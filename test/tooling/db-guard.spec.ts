import {
  assertDbNameDestructiveAllowed,
  assertDestructiveAllowed,
  DESTRUCTIVE_DB_NAMES,
  isLocalHost,
  parseDbTarget,
} from '../../scripts/lib/db-guard.cjs';

describe('assertDestructiveAllowed', () => {
  it.each([
    'postgresql://me@localhost:5432/harukok_test',
    'postgresql://me@127.0.0.1/harukok_check?sslmode=disable',
    'postgresql://me@[::1]:5432/harukok_test',
  ])('허용: %s', (u) =>
    expect(() => assertDestructiveAllowed(u)).not.toThrow(),
  );

  it.each([
    'postgresql://me@localhost:5432/harukok_dev',
    'postgresql://me@localhost:5432/postgres',
    'postgresql://me@db.example.com:5432/harukok_test',
    'postgresql://me@localhost:5432',
    'not-a-url',
  ])('거부: %s', (u) =>
    expect(() => assertDestructiveAllowed(u)).toThrow(/DB 안전 가드/),
  );
});

describe('isLocalHost', () => {
  it.each(['localhost', '127.0.0.1', '::1', '[::1]'])('로컬: %s', (h) =>
    expect(isLocalHost(h)).toBe(true),
  );
  it.each(['db.example.com', '10.0.0.1', '', 'localhost.evil.com'])(
    '비로컬: %s',
    (h) => expect(isLocalHost(h)).toBe(false),
  );
});

describe('parseDbTarget', () => {
  it('host 와 database 를 분리한다', () => {
    expect(parseDbTarget('postgresql://me@localhost:5432/harukok_dev')).toEqual(
      { host: 'localhost', database: 'harukok_dev' },
    );
  });
  it('DB 이름이 없으면 null', () => {
    expect(parseDbTarget('postgresql://me@localhost:5432').database).toBeNull();
  });
});

describe('assertDbNameDestructiveAllowed', () => {
  it('허용 목록', () => {
    expect(DESTRUCTIVE_DB_NAMES).toEqual(['harukok_test', 'harukok_check']);
    expect(() => assertDbNameDestructiveAllowed('harukok_check')).not.toThrow();
  });
  it('거부', () => {
    expect(() => assertDbNameDestructiveAllowed('harukok_dev')).toThrow(
      /DB 안전 가드/,
    );
  });
});
