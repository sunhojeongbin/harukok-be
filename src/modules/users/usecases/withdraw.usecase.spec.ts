import { randomBytes } from 'node:crypto';
import { Logger } from '@nestjs/common';
import { TokenCipher } from '../../../common/crypto/token-cipher';
import { BusinessException } from '../../../common/errors/business.exception';
import { UsersErrors } from '../errors/users.errors';
import type { LinkedAccount } from '../repositories/users.store';
import { WithdrawUseCase } from './withdraw.usecase';

const USER = '00000000-0000-7000-8000-000000000001';

function setup(accounts: (cipher: TokenCipher) => LinkedAccount[] | null) {
  const cipher = new TokenCipher(randomBytes(32).toString('base64'));
  const findLinkedAccounts = jest.fn().mockResolvedValue(accounts(cipher));
  const deleteUser = jest.fn().mockResolvedValue(true);
  const revoke = jest.fn().mockResolvedValue(undefined);
  const unlink = jest.fn().mockResolvedValue(undefined);
  const useCase = new WithdrawUseCase(
    { findProfile: jest.fn(), findLinkedAccounts, deleteUser },
    { revoke },
    { unlink },
    cipher,
  );
  return { useCase, findLinkedAccounts, deleteUser, revoke, unlink };
}

const allThree = (cipher: TokenCipher): LinkedAccount[] => [
  {
    provider: 'APPLE',
    providerUserId: 'fake-apple-sub',
    appleRefreshTokenEnc: cipher.encrypt('fake-apple-refresh'),
  },
  {
    provider: 'KAKAO',
    providerUserId: '1234567890',
    appleRefreshTokenEnc: null,
  },
  {
    provider: 'GOOGLE',
    providerUserId: 'fake-google-sub',
    appleRefreshTokenEnc: null,
  },
];

describe('WithdrawUseCase', () => {
  let logError: jest.SpyInstance;
  let logWarn: jest.SpyInstance;

  beforeEach(() => {
    logError = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    logWarn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  describe('성공', () => {
    it('애플은 복호화한 토큰으로 revoke, 카카오는 회원번호로 unlink, 구글은 서버에서 하지 않는다 → 그 다음 삭제', async () => {
      const s = setup(allThree);

      await expect(s.useCase.execute(USER)).resolves.toBeUndefined();

      expect(s.revoke).toHaveBeenCalledWith('fake-apple-refresh');
      expect(s.unlink).toHaveBeenCalledWith('1234567890');
      expect(s.revoke).toHaveBeenCalledTimes(1);
      expect(s.unlink).toHaveBeenCalledTimes(1);
      expect(s.deleteUser).toHaveBeenCalledWith(USER);
    });

    it('순서: 모든 연동 해제가 users 삭제보다 먼저다 (먼저 지우면 CASCADE 로 해제 대상을 잃는다)', async () => {
      const s = setup(allThree);

      await s.useCase.execute(USER);

      const deleteAt = s.deleteUser.mock.invocationCallOrder[0];
      expect(s.revoke.mock.invocationCallOrder[0]).toBeLessThan(deleteAt);
      expect(s.unlink.mock.invocationCallOrder[0]).toBeLessThan(deleteAt);
    });

    it('해제가 실패해도 삭제는 진행하고 에러 로그만 남긴다 (토큰 값은 로그에 넣지 않음)', async () => {
      const s = setup(allThree);
      s.revoke.mockRejectedValue(new Error('fake apple 400'));
      s.unlink.mockRejectedValue(new Error('fake kakao 401'));

      await expect(s.useCase.execute(USER)).resolves.toBeUndefined();

      expect(s.deleteUser).toHaveBeenCalledWith(USER);
      expect(logError).toHaveBeenCalledTimes(2);
      expect(JSON.stringify(logError.mock.calls)).not.toContain(
        'fake-apple-refresh',
      );
    });

    it('애플 토큰이 없으면(로그인 때 교환 실패) revoke 를 건너뛰고 경고 — 삭제는 진행', async () => {
      const s = setup(() => [
        {
          provider: 'APPLE',
          providerUserId: 'fake-apple-sub',
          appleRefreshTokenEnc: null,
        },
      ]);

      await s.useCase.execute(USER);

      expect(s.revoke).not.toHaveBeenCalled();
      expect(logWarn).toHaveBeenCalled();
      expect(s.deleteUser).toHaveBeenCalledWith(USER);
    });

    it('애플 토큰을 복호화할 수 없으면(키 교체 등) 해제 실패로 보고 삭제는 진행', async () => {
      const s = setup(() => [
        {
          provider: 'APPLE',
          providerUserId: 'fake-apple-sub',
          appleRefreshTokenEnc: Buffer.from(
            'not-a-valid-ciphertext-000000000000',
          ),
        },
      ]);

      await s.useCase.execute(USER);

      expect(s.revoke).not.toHaveBeenCalled();
      expect(logError).toHaveBeenCalled();
      expect(s.deleteUser).toHaveBeenCalledWith(USER);
    });

    it('한 제공자의 실패가 다른 제공자 해제를 막지 않는다', async () => {
      const s = setup(allThree);
      s.revoke.mockRejectedValue(new Error('fake apple down'));

      await s.useCase.execute(USER);

      expect(s.unlink).toHaveBeenCalledWith('1234567890');
    });
  });

  describe('NOT_FOUND', () => {
    it('사용자가 없으면 USER_NOT_FOUND — 해제도 삭제도 하지 않는다', async () => {
      const s = setup(() => null);

      const result = s.useCase.execute(USER);

      await expect(result).rejects.toBeInstanceOf(BusinessException);
      await expect(result).rejects.toMatchObject({
        definition: UsersErrors.USER_NOT_FOUND,
      });
      expect(s.revoke).not.toHaveBeenCalled();
      expect(s.unlink).not.toHaveBeenCalled();
      expect(s.deleteUser).not.toHaveBeenCalled();
    });

    it('해제하는 사이 이미 지워졌으면(동시 탈퇴) USER_NOT_FOUND', async () => {
      const s = setup(allThree);
      s.deleteUser.mockResolvedValue(false);

      await expect(s.useCase.execute(USER)).rejects.toMatchObject({
        definition: UsersErrors.USER_NOT_FOUND,
      });
    });
  });

  describe('권한', () => {
    it('Bearer 의 사용자 ID 로만 조회·삭제한다', async () => {
      const s = setup(allThree);

      await s.useCase.execute('fake-bearer-user');

      expect(s.findLinkedAccounts).toHaveBeenCalledWith('fake-bearer-user');
      expect(s.deleteUser).toHaveBeenCalledWith('fake-bearer-user');
    });
  });

  describe('저장 실패', () => {
    it('삭제 오류는 그대로 전파한다 (500)', async () => {
      const s = setup(allThree);
      const error = new Error('fake db down');
      s.deleteUser.mockRejectedValue(error);

      await expect(s.useCase.execute(USER)).rejects.toBe(error);
    });

    it('조회 오류면 해제하지 않고 그대로 전파한다', async () => {
      const s = setup(allThree);
      const error = new Error('fake db down');
      s.findLinkedAccounts.mockRejectedValue(error);

      await expect(s.useCase.execute(USER)).rejects.toBe(error);
      expect(s.revoke).not.toHaveBeenCalled();
      expect(s.unlink).not.toHaveBeenCalled();
    });
  });
});
