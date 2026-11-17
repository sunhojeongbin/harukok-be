import { Logger } from '@nestjs/common';
import type {
  SocialIdentity,
  SocialProvider,
  SocialTokenVerifier,
} from './social-identity';

/**
 * 개발 전용 테스트 로그인 (Swagger 에서 실제 소셜 토큰 없이 로그인).
 * DEV_TEST_LOGIN=true 일 때만 켜지고, 운영(NODE_ENV=production)에서는 켤 수 없다 (env 검증이 부팅을 막는다).
 * 계정 값은 scripts/db-seed.cjs 의 TEST_ACCOUNT 와 같아야 한다 (test/tooling/db-seed.spec.ts 가 대조).
 */
export const DEV_TEST_ID_TOKEN = 'dev-test-token';
export const DEV_TEST_PROVIDER: SocialProvider = 'GOOGLE';
export const DEV_TEST_IDENTITY: SocialIdentity = {
  providerUserId: 'dev-test-user',
  email: 'dev-test@example.com',
  name: '테스트 계정',
};

/** 켜져 있으면 GOOGLE + 테스트 토큰만 테스트 계정으로 통과시키고, 나머지는 실제 검증기로 넘긴다 */
export function withDevTestLogin(
  verifier: SocialTokenVerifier,
  enabled: boolean,
): SocialTokenVerifier {
  if (!enabled) return verifier;
  new Logger('DevTestLogin').warn(
    `DEV_TEST_LOGIN 이 켜져 있다 — ${DEV_TEST_PROVIDER} + '${DEV_TEST_ID_TOKEN}' 로 테스트 계정에 로그인된다 (개발 전용)`,
  );
  return {
    verify: (provider, idToken) =>
      provider === DEV_TEST_PROVIDER && idToken === DEV_TEST_ID_TOKEN
        ? Promise.resolve({ ...DEV_TEST_IDENTITY })
        : verifier.verify(provider, idToken),
  };
}
