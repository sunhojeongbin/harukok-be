import { Logger } from '@nestjs/common';
import { BusinessException } from '../../../common/errors/business.exception';
import { AuthErrors } from '../errors/auth.errors';
import {
  DEV_TEST_ID_TOKEN,
  DEV_TEST_IDENTITY,
  withDevTestLogin,
} from './dev-test-login';
import type { SocialTokenVerifier } from './social-identity';

function realVerifier() {
  const verify = jest
    .fn()
    .mockRejectedValue(new BusinessException(AuthErrors.SOCIAL_TOKEN_INVALID));
  return { verifier: { verify } as SocialTokenVerifier, verify };
}

describe('withDevTestLogin', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('꺼져 있으면 원래 검증기를 그대로 돌려준다 — 테스트 토큰도 실제 검증을 거친다', async () => {
    const { verifier, verify } = realVerifier();

    const wrapped = withDevTestLogin(verifier, false);

    expect(wrapped).toBe(verifier);
    await expect(
      wrapped.verify('GOOGLE', DEV_TEST_ID_TOKEN),
    ).rejects.toBeInstanceOf(BusinessException);
    expect(verify).toHaveBeenCalledWith('GOOGLE', DEV_TEST_ID_TOKEN);
  });

  it('켜져 있으면 GOOGLE + 테스트 토큰을 테스트 계정으로 통과시킨다 (실제 검증 호출 안 함)', async () => {
    const { verifier, verify } = realVerifier();

    const wrapped = withDevTestLogin(verifier, true);

    await expect(wrapped.verify('GOOGLE', DEV_TEST_ID_TOKEN)).resolves.toEqual(
      DEV_TEST_IDENTITY,
    );
    expect(verify).not.toHaveBeenCalled();
  });

  it('켜져 있어도 다른 토큰은 실제 검증을 거친다', async () => {
    const { verifier, verify } = realVerifier();

    const wrapped = withDevTestLogin(verifier, true);

    await expect(
      wrapped.verify('GOOGLE', 'some-real-token'),
    ).rejects.toBeInstanceOf(BusinessException);
    expect(verify).toHaveBeenCalledWith('GOOGLE', 'some-real-token');
  });

  it.each(['KAKAO', 'APPLE'] as const)(
    '켜져 있어도 %s 로 테스트 토큰을 보내면 실제 검증을 거친다 (테스트 계정은 GOOGLE 하나)',
    async (provider) => {
      const { verifier, verify } = realVerifier();

      const wrapped = withDevTestLogin(verifier, true);

      await expect(
        wrapped.verify(provider, DEV_TEST_ID_TOKEN),
      ).rejects.toBeInstanceOf(BusinessException);
      expect(verify).toHaveBeenCalledWith(provider, DEV_TEST_ID_TOKEN);
    },
  );

  it('켜면 경고 로그로 알린다 (실수로 켠 채 배포되는 것을 드러내기 위해)', () => {
    const warn = jest.spyOn(Logger.prototype, 'warn');

    withDevTestLogin(realVerifier().verifier, true);

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('DEV_TEST_LOGIN'),
    );
  });
});
