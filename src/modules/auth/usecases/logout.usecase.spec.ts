import { BusinessException } from '../../../common/errors/business.exception';
import { AuthErrors } from '../errors/auth.errors';
import { TokenIssuer } from '../tokens/token-issuer';
import { LogoutUseCase } from './logout.usecase';

const REQUEST = { refreshToken: 'fake-refresh', deviceId: 'dev-1' };

function setup(result: 'OK' | 'INVALID' | Error) {
  const logout = jest.fn();
  if (result instanceof Error) logout.mockRejectedValue(result);
  else logout.mockResolvedValue(result);
  return {
    useCase: new LogoutUseCase({ rotate: jest.fn(), logout }),
    logout,
  };
}

describe('LogoutUseCase', () => {
  it('성공: Bearer 사용자 · 토큰 해시 · 기기로 폐기하고 끝낸다 (204)', async () => {
    const s = setup('OK');

    await expect(
      s.useCase.execute('fake-user-id', REQUEST),
    ).resolves.toBeUndefined();
    expect(s.logout).toHaveBeenCalledWith({
      userId: 'fake-user-id',
      tokenHash: TokenIssuer.hashRefreshToken('fake-refresh'),
      deviceId: 'dev-1',
    });
  });

  it('NOT_FOUND · 권한: 토큰 없음 · 다른 사용자 · 기기 불일치는 REFRESH_TOKEN_INVALID', async () => {
    const result = setup('INVALID').useCase.execute('fake-user-id', REQUEST);

    await expect(result).rejects.toBeInstanceOf(BusinessException);
    await expect(result).rejects.toMatchObject({
      definition: AuthErrors.REFRESH_TOKEN_INVALID,
    });
  });

  it('저장 실패: 트랜잭션 오류는 그대로 전파한다', async () => {
    const error = new Error('fake db down');

    await expect(
      setup(error).useCase.execute('fake-user-id', REQUEST),
    ).rejects.toBe(error);
  });
});
