import { randomBytes } from 'node:crypto';
import { Logger } from '@nestjs/common';
import { jwtVerify } from 'jose';
import { TokenCipher } from '../../../common/crypto/token-cipher';
import { BusinessException } from '../../../common/errors/business.exception';
import { TermsErrors } from '../../terms/errors/terms.errors';
import type { GetCurrentTermsUseCase } from '../../terms/usecases/get-current-terms.usecase';
import type { SocialLoginRequestDto } from '../dto/social-login.request.dto';
import { AuthErrors } from '../errors/auth.errors';
import type { LoginCommand, LoginResult } from '../repositories/login.store';
import type { SocialIdentity } from '../social/social-identity';
import { TokenIssuer } from '../tokens/token-issuer';
import { SocialLoginUseCase } from './social-login.usecase';

const SECRET = 'fake-access-secret-for-tests-only-0123456789';
const TERM = {
  id: '00000000-0000-7000-8000-0000000000a1',
  version: '1.0',
  contentUrl: 'https://example.com/terms',
};
const IDENTITY: SocialIdentity = {
  providerUserId: 'fake-sub-1',
  email: ' Fake@Example.COM ',
  name: '<b>가짜</b> 사용자',
};
const RESULT: LoginResult = {
  userId: '00000000-0000-7000-8000-0000000000u1',
  isNewUser: true,
  name: '가짜 사용자',
  providers: ['GOOGLE'],
};

function setup() {
  const verify = jest.fn().mockResolvedValue(IDENTITY);
  const exchangeCode = jest.fn().mockResolvedValue('fake-apple-refresh');
  const findUserId = jest.fn().mockResolvedValue(null);
  const login = jest.fn().mockResolvedValue(RESULT);
  const currentTerm = jest.fn().mockResolvedValue(TERM);
  const cipher = new TokenCipher(randomBytes(32).toString('base64'));
  const useCase = new SocialLoginUseCase(
    { verify },
    { exchangeCode },
    { findUserId, login },
    { execute: currentTerm } as unknown as GetCurrentTermsUseCase,
    cipher,
    new TokenIssuer(SECRET),
  );
  const command = () => (login.mock.calls[0] as [LoginCommand])[0];
  return {
    useCase,
    verify,
    exchangeCode,
    findUserId,
    login,
    currentTerm,
    cipher,
    command,
  };
}

const request = (
  overrides: Partial<SocialLoginRequestDto> = {},
): SocialLoginRequestDto => ({
  provider: 'GOOGLE',
  idToken: 'fake-id-token',
  deviceId: 'fake-device-1',
  agreement: { termId: TERM.id, version: TERM.version },
  ...overrides,
});

async function expectError(
  promise: Promise<unknown>,
  definition: (typeof AuthErrors)[keyof typeof AuthErrors],
) {
  await expect(promise).rejects.toBeInstanceOf(BusinessException);
  await expect(promise).rejects.toMatchObject({ definition });
}

describe('SocialLoginUseCase', () => {
  let logError: jest.SpyInstance;

  beforeEach(() => {
    logError = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  describe('성공', () => {
    it('신규: 동의한 현행 약관·정규화된 이메일·이름으로 가입하고 토큰을 발급한다', async () => {
      const s = setup();

      const res = await s.useCase.execute(request());

      expect(s.verify).toHaveBeenCalledWith('GOOGLE', 'fake-id-token');
      expect(s.command()).toMatchObject({
        provider: 'GOOGLE',
        providerUserId: 'fake-sub-1',
        email: 'fake@example.com',
        name: '가짜 사용자',
        agreedTermId: TERM.id,
        appleRefreshTokenEnc: null,
        deviceId: 'fake-device-1',
      });
      expect(res).toMatchObject({
        isNewUser: true,
        user: { id: RESULT.userId, name: '가짜 사용자', providers: ['GOOGLE'] },
      });
      const { payload } = await jwtVerify(
        res.accessToken,
        new TextEncoder().encode(SECRET),
      );
      expect(payload.sub).toBe(RESULT.userId);
      expect(s.command().refreshTokenHash).toEqual(
        TokenIssuer.hashRefreshToken(res.refreshToken),
      );
    });

    it('기존 사용자: 약관 동의 없이 로그인하고 약관을 조회하지 않는다', async () => {
      const s = setup();
      s.findUserId.mockResolvedValue(RESULT.userId);
      s.login.mockResolvedValue({ ...RESULT, isNewUser: false });

      const res = await s.useCase.execute(request({ agreement: undefined }));

      expect(res.isNewUser).toBe(false);
      expect(s.command().agreedTermId).toBeNull();
      expect(s.currentTerm).not.toHaveBeenCalled();
    });

    it('기존 사용자가 agreement 를 보내도 기록하지 않는다 (명세 5-2)', async () => {
      const s = setup();
      s.findUserId.mockResolvedValue(RESULT.userId);

      await s.useCase.execute(request());

      expect(s.command().agreedTermId).toBeNull();
    });

    it('카카오·구글은 요청의 name 을 무시하고 토큰의 이름을 쓴다', async () => {
      const s = setup();

      await s.useCase.execute(
        request({ provider: 'KAKAO', name: '요청 이름' }),
      );

      expect(s.command().name).toBe('가짜 사용자');
    });

    it('애플: 요청의 name 을 쓰고, 코드를 교환해 refresh token 을 암호화해 넘긴다', async () => {
      const s = setup();
      s.verify.mockResolvedValue({ ...IDENTITY, name: null });

      await s.useCase.execute(
        request({
          provider: 'APPLE',
          authorizationCode: 'fake-code',
          name: '<i>애플</i> 사용자',
        }),
      );

      expect(s.exchangeCode).toHaveBeenCalledWith('fake-code');
      expect(s.command().name).toBe('애플 사용자');
      const enc = s.command().appleRefreshTokenEnc;
      expect(enc).toBeInstanceOf(Buffer);
      expect(s.cipher.decrypt(enc as Buffer)).toBe('fake-apple-refresh');
    });

    it('애플 코드 교환은 DB 트랜잭션(login)보다 먼저 한다', async () => {
      const s = setup();

      await s.useCase.execute(
        request({ provider: 'APPLE', authorizationCode: 'fake-code' }),
      );

      expect(s.exchangeCode.mock.invocationCallOrder[0]).toBeLessThan(
        s.login.mock.invocationCallOrder[0],
      );
    });

    it('애플 코드 교환이 실패해도 로그인은 진행하고(암호문 NULL), 에러 로그를 남긴다', async () => {
      const s = setup();
      s.exchangeCode.mockRejectedValue(new Error('fake 400 invalid_grant'));

      const res = await s.useCase.execute(
        request({ provider: 'APPLE', authorizationCode: 'fake-code' }),
      );

      expect(res.accessToken).toBeTruthy();
      expect(s.command().appleRefreshTokenEnc).toBeNull();
      expect(logError).toHaveBeenCalled();
      expect(JSON.stringify(logError.mock.calls)).not.toContain('fake-code');
    });

    it('애플이 아니면 authorizationCode 가 와도 교환하지 않는다', async () => {
      const s = setup();

      await s.useCase.execute(request({ authorizationCode: 'fake-code' }));

      expect(s.exchangeCode).not.toHaveBeenCalled();
    });
  });

  describe('약관 동의 (NOT_FOUND 계열)', () => {
    it('신규인데 agreement 가 없으면 TERMS_AGREEMENT_REQUIRED, 저장·애플 교환 안 함', async () => {
      const s = setup();

      await expectError(
        s.useCase.execute(
          request({
            provider: 'APPLE',
            authorizationCode: 'fake-code',
            agreement: undefined,
          }),
        ),
        AuthErrors.TERMS_AGREEMENT_REQUIRED,
      );
      expect(s.login).not.toHaveBeenCalled();
      expect(s.exchangeCode).not.toHaveBeenCalled();
    });

    it.each([
      [
        'termId 가 현행이 아님',
        { termId: '00000000-0000-7000-8000-0000000000ff', version: '1.0' },
      ],
      ['version 이 현행이 아님', { termId: TERM.id, version: '0.9' }],
    ])('%s 이면 TERMS_AGREEMENT_REQUIRED', async (_label, agreement) => {
      const s = setup();

      await expectError(
        s.useCase.execute(request({ agreement })),
        AuthErrors.TERMS_AGREEMENT_REQUIRED,
      );
      expect(s.login).not.toHaveBeenCalled();
    });

    it('시행 중인 이용약관이 없으면(TERM_NOT_FOUND) 가입할 수 없다 → TERMS_AGREEMENT_REQUIRED', async () => {
      const s = setup();
      s.currentTerm.mockRejectedValue(
        new BusinessException(TermsErrors.TERM_NOT_FOUND),
      );

      await expectError(
        s.useCase.execute(request()),
        AuthErrors.TERMS_AGREEMENT_REQUIRED,
      );
    });
  });

  describe('권한 (토큰 검증)', () => {
    it('idToken 검증 실패는 SOCIAL_TOKEN_INVALID 그대로, 조회·저장·교환 안 함', async () => {
      const s = setup();
      s.verify.mockRejectedValue(
        new BusinessException(AuthErrors.SOCIAL_TOKEN_INVALID),
      );

      await expectError(
        s.useCase.execute(
          request({ provider: 'APPLE', authorizationCode: 'fake-code' }),
        ),
        AuthErrors.SOCIAL_TOKEN_INVALID,
      );
      expect(s.findUserId).not.toHaveBeenCalled();
      expect(s.login).not.toHaveBeenCalled();
      expect(s.exchangeCode).not.toHaveBeenCalled();
    });
  });

  describe('저장 실패', () => {
    it('트랜잭션 오류는 그대로 전파한다 (전역 필터가 500 처리)', async () => {
      const s = setup();
      const error = new Error('fake db down');
      s.login.mockRejectedValue(error);

      await expect(s.useCase.execute(request())).rejects.toBe(error);
    });

    it('약관 조회의 예상 못 한 오류도 그대로 전파한다', async () => {
      const s = setup();
      const error = new Error('fake db down');
      s.currentTerm.mockRejectedValue(error);

      await expect(s.useCase.execute(request())).rejects.toBe(error);
    });
  });
});
