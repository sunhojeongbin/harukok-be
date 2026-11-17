import { randomBytes } from 'node:crypto';
import { fakeEnv } from '../../../test/fixtures/fake-env';
import { validateEnv } from './env.validation';

const VALID_URL = 'postgresql://fake@localhost:5432/fake_db';

/** DATABASE_URL 외 필수 값(가짜)을 채운 환경 */
const withRest = (env: Record<string, unknown>) => ({ ...fakeEnv(), ...env });

describe('validateEnv', () => {
  it('필수 값이 모두 있으면 통과하고 PORT 기본값 3000 을 채운다', () => {
    const env = validateEnv(withRest({ DATABASE_URL: VALID_URL }));

    expect(env.DATABASE_URL).toBe(VALID_URL);
    expect(env.PORT).toBe(3000);
  });

  it('PORT 문자열을 숫자로 바꾼다', () => {
    const env = validateEnv(
      withRest({ DATABASE_URL: VALID_URL, PORT: '8080' }),
    );

    expect(env.PORT).toBe(8080);
  });

  it('postgres:// 접두사도 허용한다', () => {
    const url = 'postgres://fake@localhost/fake_db';

    expect(validateEnv(withRest({ DATABASE_URL: url })).DATABASE_URL).toBe(url);
  });

  it('DATABASE_URL 이 없으면 키 이름을 담아 실패한다', () => {
    expect(() => validateEnv({})).toThrow(/DATABASE_URL/);
  });

  it('DATABASE_URL 이 postgres URL 이 아니면 실패한다', () => {
    expect(() =>
      validateEnv(withRest({ DATABASE_URL: 'mysql://x@localhost/y' })),
    ).toThrow(/DATABASE_URL/);
  });

  it.each(['0', '65536', 'abc'])('PORT=%s 이면 실패한다', (port) => {
    expect(() =>
      validateEnv(withRest({ DATABASE_URL: VALID_URL, PORT: port })),
    ).toThrow(/PORT/);
  });

  it('NODE_ENV 가 허용값이 아니면 실패한다', () => {
    expect(() =>
      validateEnv(withRest({ DATABASE_URL: VALID_URL, NODE_ENV: 'staging' })),
    ).toThrow(/NODE_ENV/);
  });

  it('오류 메시지에 값은 넣지 않는다 (시크릿 노출 방지)', () => {
    const secretish = 'mysql://fake-user:fake-password@localhost/y';

    let message = '';
    try {
      validateEnv(withRest({ DATABASE_URL: secretish }));
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toMatch(/DATABASE_URL/);
    expect(message).not.toContain('fake-password');
  });

  describe('2단위 (소셜 로그인) 키', () => {
    it.each([
      'JWT_ACCESS_SECRET',
      'TOKEN_ENCRYPTION_KEY',
      'APPLE_TEAM_ID',
      'APPLE_KEY_ID',
      'APPLE_PRIVATE_KEY',
      'APPLE_CLIENT_ID',
      'GOOGLE_CLIENT_IDS',
      'KAKAO_APP_KEYS',
      'KAKAO_ADMIN_KEY',
    ])('%s 가 없으면 키 이름을 담아 실패한다', (key) => {
      const env = withRest({ DATABASE_URL: VALID_URL });
      delete env[key];

      expect(() => validateEnv(env)).toThrow(new RegExp(key));
    });

    it('JWT_ACCESS_SECRET 이 32자 미만이면 실패한다', () => {
      expect(() =>
        validateEnv(
          withRest({ DATABASE_URL: VALID_URL, JWT_ACCESS_SECRET: 'short' }),
        ),
      ).toThrow(/JWT_ACCESS_SECRET/);
    });

    it.each([
      ['16바이트', randomBytes(16).toString('base64')],
      ['base64 아님', '!!!!not-base64!!!!'],
    ])('TOKEN_ENCRYPTION_KEY 가 %s 이면 실패한다', (_label, key) => {
      expect(() =>
        validateEnv(
          withRest({ DATABASE_URL: VALID_URL, TOKEN_ENCRYPTION_KEY: key }),
        ),
      ).toThrow(/TOKEN_ENCRYPTION_KEY/);
    });

    it('APPLE_PRIVATE_KEY 가 PEM 이 아니면 실패한다', () => {
      expect(() =>
        validateEnv(
          withRest({ DATABASE_URL: VALID_URL, APPLE_PRIVATE_KEY: 'fake' }),
        ),
      ).toThrow(/APPLE_PRIVATE_KEY/);
    });

    it('APPLE_PRIVATE_KEY 의 이스케이프된 줄바꿈(\\n)을 실제 줄바꿈으로 바꾼다', () => {
      const pem = fakeEnv().APPLE_PRIVATE_KEY;
      const escaped = pem.replace(/\n/g, '\\n');

      const env = validateEnv(
        withRest({ DATABASE_URL: VALID_URL, APPLE_PRIVATE_KEY: escaped }),
      );

      expect(env.APPLE_PRIVATE_KEY).toBe(pem);
    });

    it('쉼표 목록(GOOGLE_CLIENT_IDS·KAKAO_APP_KEYS)을 공백 없이 배열로 나눈다', () => {
      const env = validateEnv(
        withRest({
          DATABASE_URL: VALID_URL,
          GOOGLE_CLIENT_IDS: ' a.apps , b.apps ,',
          KAKAO_APP_KEYS: 'k1',
        }),
      );

      expect(env.GOOGLE_CLIENT_IDS).toEqual(['a.apps', 'b.apps']);
      expect(env.KAKAO_APP_KEYS).toEqual(['k1']);
    });
  });

  describe('DEV_TEST_LOGIN (개발 전용 테스트 로그인)', () => {
    it('없으면 꺼짐(false)', () => {
      expect(
        validateEnv(withRest({ DATABASE_URL: VALID_URL })).DEV_TEST_LOGIN,
      ).toBe(false);
    });

    it.each([
      ['true', true],
      ['false', false],
    ])('%s → %s', (value, expected) => {
      expect(
        validateEnv(
          withRest({ DATABASE_URL: VALID_URL, DEV_TEST_LOGIN: value }),
        ).DEV_TEST_LOGIN,
      ).toBe(expected);
    });

    it('true·false 가 아니면 실패한다 (yes, 1 등 오타를 켜짐으로 읽지 않는다)', () => {
      expect(() =>
        validateEnv(
          withRest({ DATABASE_URL: VALID_URL, DEV_TEST_LOGIN: 'yes' }),
        ),
      ).toThrow(/DEV_TEST_LOGIN/);
    });

    it('운영(NODE_ENV=production)에서 켜면 부팅을 막는다', () => {
      expect(() =>
        validateEnv(
          withRest({
            DATABASE_URL: VALID_URL,
            NODE_ENV: 'production',
            DEV_TEST_LOGIN: 'true',
          }),
        ),
      ).toThrow(/DEV_TEST_LOGIN/);
    });

    it('운영에서 꺼 두는 것은 괜찮다', () => {
      expect(
        validateEnv(
          withRest({
            DATABASE_URL: VALID_URL,
            NODE_ENV: 'production',
            DEV_TEST_LOGIN: 'false',
          }),
        ).DEV_TEST_LOGIN,
      ).toBe(false);
    });
  });
});
