import { jwtVerify } from 'jose';
import { BusinessException } from '../../../common/errors/business.exception';
import { AuthErrors } from '../errors/auth.errors';
import type { RotateResult } from '../repositories/session.store';
import { TokenIssuer } from '../tokens/token-issuer';
import { RefreshTokenUseCase } from './refresh-token.usecase';

const SECRET = 'fake-access-secret-for-tests-only-0123456789';
const REQUEST = { refreshToken: 'fake-old-refresh', deviceId: 'dev-1' };

function setup(result: RotateResult | Error) {
  const rotate = jest.fn();
  if (result instanceof Error) rotate.mockRejectedValue(result);
  else rotate.mockResolvedValue(result);
  const useCase = new RefreshTokenUseCase(
    { rotate, logout: jest.fn() },
    new TokenIssuer(SECRET),
  );
  return { useCase, rotate };
}

async function expectError(
  promise: Promise<unknown>,
  definition: (typeof AuthErrors)[keyof typeof AuthErrors],
) {
  await expect(promise).rejects.toBeInstanceOf(BusinessException);
  await expect(promise).rejects.toMatchObject({ definition });
}

describe('RefreshTokenUseCase', () => {
  it('성공: 기존 토큰 해시 · 기기 · 새 토큰 해시로 로테이션하고 새 토큰 쌍을 돌려준다', async () => {
    const s = setup({ outcome: 'OK', userId: 'fake-user-id' });

    const res = await s.useCase.execute(REQUEST);

    const [command] = s.rotate.mock.calls[0] as [
      { tokenHash: Buffer; deviceId: string; newTokenHash: Buffer },
    ];
    expect(command.tokenHash).toEqual(
      TokenIssuer.hashRefreshToken('fake-old-refresh'),
    );
    expect(command.deviceId).toBe('dev-1');
    expect(command.newTokenHash).toEqual(
      TokenIssuer.hashRefreshToken(res.refreshToken),
    );
    expect(res.refreshToken).not.toBe('fake-old-refresh');
    const { payload } = await jwtVerify(
      res.accessToken,
      new TextEncoder().encode(SECRET),
    );
    expect(payload.sub).toBe('fake-user-id');
  });

  it('NOT_FOUND: 토큰이 없으면 REFRESH_TOKEN_INVALID', async () => {
    await expectError(
      setup({ outcome: 'INVALID' }).useCase.execute(REQUEST),
      AuthErrors.REFRESH_TOKEN_INVALID,
    );
  });

  it('권한: 재사용(폐기된 토큰)이면 REFRESH_TOKEN_REVOKED', async () => {
    await expectError(
      setup({ outcome: 'REVOKED' }).useCase.execute(REQUEST),
      AuthErrors.REFRESH_TOKEN_REVOKED,
    );
  });

  it('만료면 REFRESH_TOKEN_EXPIRED', async () => {
    await expectError(
      setup({ outcome: 'EXPIRED' }).useCase.execute(REQUEST),
      AuthErrors.REFRESH_TOKEN_EXPIRED,
    );
  });

  it('저장 실패: 트랜잭션 오류는 그대로 전파한다', async () => {
    const error = new Error('fake db down');

    await expect(setup(error).useCase.execute(REQUEST)).rejects.toBe(error);
  });
});
