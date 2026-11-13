import { validateEnv } from './env.validation';

const VALID_URL = 'postgresql://fake@localhost:5432/fake_db';

describe('validateEnv', () => {
  it('DATABASE_URL 만 있어도 통과하고 PORT 기본값 3000 을 채운다', () => {
    const env = validateEnv({ DATABASE_URL: VALID_URL });

    expect(env.DATABASE_URL).toBe(VALID_URL);
    expect(env.PORT).toBe(3000);
  });

  it('PORT 문자열을 숫자로 바꾼다', () => {
    const env = validateEnv({ DATABASE_URL: VALID_URL, PORT: '8080' });

    expect(env.PORT).toBe(8080);
  });

  it('postgres:// 접두사도 허용한다', () => {
    const url = 'postgres://fake@localhost/fake_db';

    expect(validateEnv({ DATABASE_URL: url }).DATABASE_URL).toBe(url);
  });

  it('DATABASE_URL 이 없으면 키 이름을 담아 실패한다', () => {
    expect(() => validateEnv({})).toThrow(/DATABASE_URL/);
  });

  it('DATABASE_URL 이 postgres URL 이 아니면 실패한다', () => {
    expect(() =>
      validateEnv({ DATABASE_URL: 'mysql://x@localhost/y' }),
    ).toThrow(/DATABASE_URL/);
  });

  it.each(['0', '65536', 'abc'])('PORT=%s 이면 실패한다', (port) => {
    expect(() => validateEnv({ DATABASE_URL: VALID_URL, PORT: port })).toThrow(
      /PORT/,
    );
  });

  it('NODE_ENV 가 허용값이 아니면 실패한다', () => {
    expect(() =>
      validateEnv({ DATABASE_URL: VALID_URL, NODE_ENV: 'staging' }),
    ).toThrow(/NODE_ENV/);
  });

  it('오류 메시지에 값은 넣지 않는다 (시크릿 노출 방지)', () => {
    const secretish = 'mysql://fake-user:fake-password@localhost/y';

    let message = '';
    try {
      validateEnv({ DATABASE_URL: secretish });
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toMatch(/DATABASE_URL/);
    expect(message).not.toContain('fake-password');
  });
});
