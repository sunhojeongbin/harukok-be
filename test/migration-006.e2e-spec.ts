// 006(이용약관 단일화) 적용 시 데이터 처리. 테스트 DB 에서 006 만 되돌렸다가 다시 적용한다.
import { Client, DatabaseError } from 'pg';
import { migrateDown, migrateUp } from '../scripts/db-migrate.cjs';
import { MIGRATIONS_DIR, testDatabaseUrl } from './e2e/test-db';

const VERSION_006 = '20261113_006';

describe('마이그레이션 006 데이터 처리 (e2e)', () => {
  let db: Client;

  const applied = async () =>
    (
      await db.query<{ version: string }>(
        'SELECT version FROM schema_migrations ORDER BY version',
      )
    ).rows.map((r) => r.version);

  beforeAll(async () => {
    db = new Client({ connectionString: testDatabaseUrl() });
    await db.connect();
  });

  beforeEach(async () => {
    await db.query('DELETE FROM users');
    await db.query('DELETE FROM terms');
    await expect(migrateDown(db, MIGRATIONS_DIR)).resolves.toEqual([
      `${VERSION_006}__terms_single`,
    ]);
  });

  afterEach(async () => {
    await db.query('DELETE FROM users');
    await db.query('DELETE FROM terms');
    await migrateUp(db, MIGRATIONS_DIR);
  });

  afterAll(async () => {
    await db.end();
  });

  const insertTerm = (type: string, version: string) =>
    db.query<{ id: string }>(
      `INSERT INTO terms (type, version, title, content_url, effective_from)
       VALUES ($1, $2, '가짜 약관', 'https://example.com/terms', now()) RETURNING id`,
      [type, version],
    );

  it('동의 이력이 없는 PRIVACY 행은 지우고 SERVICE 행은 남긴다', async () => {
    await insertTerm('SERVICE', '1.0');
    await insertTerm('PRIVACY', '1.0');

    await migrateUp(db, MIGRATIONS_DIR);

    const r = await db.query<{ version: string }>('SELECT version FROM terms');
    expect(r.rows.map((row) => row.version)).toEqual(['1.0']);
    expect(await applied()).toContain(VERSION_006);
  });

  it('PRIVACY 행에 동의 이력이 있으면 적용이 실패하고(RESTRICT), 데이터·스키마는 그대로다', async () => {
    const user = await db.query<{ id: string }>(
      'INSERT INTO users DEFAULT VALUES RETURNING id',
    );
    const privacy = await insertTerm('PRIVACY', '1.0');
    await db.query(
      'INSERT INTO user_term_agreements (user_id, term_id) VALUES ($1, $2)',
      [user.rows[0].id, privacy.rows[0].id],
    );

    const err = await migrateUp(db, MIGRATIONS_DIR).then(
      () => null,
      (e: unknown) => e,
    );

    expect(err).toBeInstanceOf(DatabaseError);
    expect((err as DatabaseError).code).toBe('23001'); // restrict_violation (ON DELETE RESTRICT)
    // 실패한 트랜잭션이 정리되어 같은 연결로 계속 쿼리할 수 있어야 한다.
    const left = await db.query<{ n: string }>(
      `SELECT count(*) AS n FROM terms WHERE type = 'PRIVACY'`,
    );
    expect(left.rows[0].n).toBe('1');
    expect(await applied()).not.toContain(VERSION_006);
  });
});
