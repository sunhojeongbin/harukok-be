import { generateKeyPairSync, KeyObject, randomBytes } from 'node:crypto';

/** 테스트 전용 가짜 애플 서명 키 (EC P-256). 실행할 때마다 새로 만든다. */
export function fakeAppleKeyPair(): {
  privateKeyPem: string;
  publicKey: KeyObject;
} {
  const { privateKey, publicKey } = generateKeyPairSync('ec', {
    namedCurve: 'P-256',
  });
  return {
    privateKeyPem: privateKey.export({
      type: 'pkcs8',
      format: 'pem',
    }) as string,
    publicKey,
  };
}

/** DATABASE_URL 을 뺀 필수 환경변수의 가짜 값. 실제 시크릿이 아니다. */
export function fakeEnv(): Record<string, string> {
  return {
    JWT_ACCESS_SECRET: 'fake-access-secret-for-tests-only-0123456789',
    TOKEN_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
    APPLE_TEAM_ID: 'FAKETEAM01',
    APPLE_KEY_ID: 'FAKEKEY001',
    APPLE_PRIVATE_KEY: fakeAppleKeyPair().privateKeyPem,
    APPLE_CLIENT_ID: 'com.example.fake.harukok',
    GOOGLE_CLIENT_IDS:
      'fake-ios.apps.googleusercontent.com,fake-android.apps.googleusercontent.com',
    KAKAO_APP_KEYS: 'fake-kakao-native-app-key',
  };
}
