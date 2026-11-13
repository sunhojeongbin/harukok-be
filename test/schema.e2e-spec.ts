// DB 설계서 9장 검증 항목 중 스키마(DDL)로 보장되는 것을 옮긴다.
// 앱 쿼리 수준 항목(4대째 로그인, 소프트 삭제 쿼리, 정리 배치)은 해당 단위에서 검증한다.
import { Client, DatabaseError } from 'pg';
import { testDatabaseUrl } from './e2e/test-db';

describe('스키마 001·005 (e2e)', () => {
  let db: Client;

  beforeAll(async () => {
    db = new Client({ connectionString: testDatabaseUrl() });
    await db.connect();
  });

  afterAll(async () => {
    await db.end();
  });

  // 테스트마다 트랜잭션을 열고 되돌려 서로 영향을 주지 않는다.
  beforeEach(async () => {
    await db.query('BEGIN');
  });

  afterEach(async () => {
    await db.query('ROLLBACK');
  });

  /** 실패해도 트랜잭션이 깨지지 않도록 SAVEPOINT 안에서 실행한다. */
  async function attempt(
    sql: string,
    params: unknown[] = [],
  ): Promise<DatabaseError | null> {
    await db.query('SAVEPOINT t');
    try {
      await db.query(sql, params);
      await db.query('RELEASE SAVEPOINT t');
      return null;
    } catch (e) {
      await db.query('ROLLBACK TO SAVEPOINT t');
      if (e instanceof DatabaseError) return e;
      throw e;
    }
  }

  async function expectOk(sql: string, params: unknown[] = []) {
    const err = await attempt(sql, params);
    expect(err?.message ?? null).toBeNull();
  }

  async function expectViolation(
    constraint: string,
    sql: string,
    params: unknown[] = [],
  ) {
    const err = await attempt(sql, params);
    expect(err?.constraint).toBe(constraint);
  }

  async function newUser(
    email: string | null = null,
    name: string | null = null,
  ) {
    const r = await db.query<{ id: string }>(
      'INSERT INTO users (email, name) VALUES ($1, $2) RETURNING id',
      [email, name],
    );
    return r.rows[0].id;
  }

  const insertTodo =
    'INSERT INTO todos (user_id, title, due_date) VALUES ($1, $2, $3)';
  const insertSocial =
    'INSERT INTO user_social_accounts (user_id, provider, provider_user_id, provider_refresh_token_enc) VALUES ($1, $2, $3, $4)';
  const insertToken = `INSERT INTO refresh_tokens (user_id, token_hash, device_id, expires_at)
    VALUES ($1, $2, $3, now() + interval '30 days')`;

  describe('todos.title (ck_todos_title)', () => {
    it('250자는 성공, 251자·공백만은 거부', async () => {
      const userId = await newUser();

      await expectOk(insertTodo, [userId, '가'.repeat(250), '2026-11-13']);
      await expectViolation('ck_todos_title', insertTodo, [
        userId,
        '가'.repeat(251),
        '2026-11-13',
      ]);
      await expectViolation('ck_todos_title', insertTodo, [
        userId,
        '   ',
        '2026-11-13',
      ]);
    });
  });

  describe('user_social_accounts.provider', () => {
    it('KAKAO·APPLE·GOOGLE 은 성공, NAVER 는 거부', async () => {
      const userId = await newUser();

      for (const provider of ['KAKAO', 'APPLE', 'GOOGLE']) {
        await expectOk(insertSocial, [
          userId,
          provider,
          `fake-${provider}`,
          null,
        ]);
      }
      await expectViolation('ck_user_social_accounts_provider', insertSocial, [
        userId,
        'NAVER',
        'fake-naver',
        null,
      ]);
    });

    it('같은 소셜 계정의 중복 연결은 거부', async () => {
      const a = await newUser();
      const b = await newUser();

      await expectOk(insertSocial, [a, 'KAKAO', 'fake-1', null]);
      await expectViolation(
        'uq_user_social_accounts_provider_user_id',
        insertSocial,
        [b, 'KAKAO', 'fake-1', null],
      );
    });
  });

  describe('user_social_accounts.provider_refresh_token_enc (005)', () => {
    it('APPLE 행은 암호문을 저장할 수 있다', async () => {
      const userId = await newUser();

      await expectOk(insertSocial, [
        userId,
        'APPLE',
        'fake-apple-sub',
        Buffer.from('fake-ciphertext'),
      ]);
    });

    it.each(['KAKAO', 'GOOGLE'])(
      '%s 행에 암호문을 넣으면 거부, NULL 은 성공',
      async (provider) => {
        const userId = await newUser();

        await expectViolation(
          'ck_user_social_accounts_provider_refresh_token_enc',
          insertSocial,
          [userId, provider, 'fake-sub', Buffer.from('fake-ciphertext')],
        );
        await expectOk(insertSocial, [userId, provider, 'fake-sub', null]);
      },
    );
  });

  describe('users.email (ck_users_email)', () => {
    it('구글·애플로 각각 가입한 같은 이메일 2계정을 허용한다 (UNIQUE 없음)', async () => {
      await newUser('fake@example.com');

      await expectOk('INSERT INTO users (email) VALUES ($1)', [
        'fake@example.com',
      ]);
    });

    it.each([
      ['정상', 'fake@example.com'],
      ['NULL', null],
      ['애플 relay', 'fake123@privaterelay.appleid.com'],
    ])('%s 은 성공', async (_label, email) => {
      await expectOk('INSERT INTO users (email) VALUES ($1)', [email]);
    });

    it.each([
      ['대문자', 'Fake@Example.com'],
      ['앞뒤 공백', ' fake@example.com '],
      ['빈 문자열', ''],
      ['256자', `${'a'.repeat(244)}@example.com`],
    ])('%s 은 거부', async (_label, email) => {
      await expectViolation(
        'ck_users_email',
        'INSERT INTO users (email) VALUES ($1)',
        [email],
      );
    });
  });

  describe('users.name (ck_users_name)', () => {
    it.each([
      ['정상', '하루콕'],
      ['NULL', null],
      ['50자', '가'.repeat(50)],
      ['대문자 포함', 'Fake User'],
    ])('%s 은 성공', async (_label, name) => {
      await expectOk('INSERT INTO users (name) VALUES ($1)', [name]);
    });

    it.each([
      ['51자', '가'.repeat(51)],
      ['공백만', '   '],
      ['빈 문자열', ''],
    ])('%s 은 거부', async (_label, name) => {
      await expectViolation(
        'ck_users_name',
        'INSERT INTO users (name) VALUES ($1)',
        [name],
      );
    });
  });

  describe('refresh_tokens 기기당 활성 토큰 1개', () => {
    it('같은 기기의 활성 토큰 2개는 거부, 폐기 후에는 새 토큰 허용', async () => {
      const userId = await newUser();

      await expectOk(insertToken, [
        userId,
        Buffer.from('fake-hash-1'),
        'dev-1',
      ]);
      await expectViolation(
        'uq_refresh_tokens_user_id_device_id_active',
        insertToken,
        [userId, Buffer.from('fake-hash-2'), 'dev-1'],
      );

      await db.query(
        'UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1',
        [userId],
      );
      await expectOk(insertToken, [
        userId,
        Buffer.from('fake-hash-3'),
        'dev-1',
      ]);
    });
  });

  describe('회원 탈퇴 CASCADE', () => {
    it('users 1행 삭제로 자식 테이블이 전부 0건이 된다', async () => {
      const userId = await newUser('fake@example.com', '하루콕');
      const term = await db.query<{ id: string }>(
        `INSERT INTO terms (version, title, content_url, effective_from)
         VALUES ('fake-1', '가짜 약관', 'https://example.com/terms', now())
         RETURNING id`,
      );
      await db.query(insertSocial, [userId, 'KAKAO', 'fake-kakao', null]);
      await db.query(insertToken, [userId, Buffer.from('fake-hash'), 'dev-1']);
      await db.query(
        'INSERT INTO user_term_agreements (user_id, term_id) VALUES ($1, $2)',
        [userId, term.rows[0].id],
      );
      await db.query(insertTodo, [userId, '가짜 할 일', '2026-11-13']);

      await db.query('DELETE FROM users WHERE id = $1', [userId]);

      for (const table of [
        'user_social_accounts',
        'refresh_tokens',
        'user_term_agreements',
        'todos',
      ]) {
        const r = await db.query<{ n: string }>(
          `SELECT count(*) AS n FROM ${table} WHERE user_id = $1`,
          [userId],
        );
        expect({ table, n: r.rows[0].n }).toEqual({ table, n: '0' });
      }
    });
  });

  describe('terms 이용약관 단일화 (006)', () => {
    const insertTerm = `INSERT INTO terms (version, title, content_url, effective_from)
      VALUES ($1, '가짜 이용약관', 'https://example.com/terms', now())`;

    it('컬럼은 id·version·title·content_url·effective_from·created_at 뿐이다 (type·is_required 없음)', async () => {
      const r = await db.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'terms' ORDER BY column_name`,
      );

      expect(r.rows.map((row) => row.column_name)).toEqual([
        'content_url',
        'created_at',
        'effective_from',
        'id',
        'title',
        'version',
      ]);
    });

    it('같은 version 은 두 번 넣을 수 없다 (uq_terms_version)', async () => {
      await expectOk(insertTerm, ['fake-1.0']);
      await expectViolation('uq_terms_version', insertTerm, ['fake-1.0']);
    });
  });

  describe('todos 부분 인덱스 idx_todos_user_id_due_date', () => {
    async function plan(sql: string): Promise<string> {
      await db.query('SET LOCAL enable_seqscan = off');
      const r = await db.query<{ 'QUERY PLAN': string }>(`EXPLAIN ${sql}`, [
        '00000000-0000-7000-8000-000000000000',
        '2026-11-13',
      ]);
      return r.rows.map((row) => row['QUERY PLAN']).join('\n');
    }

    it('deleted_at IS NULL 조건이 있으면 부분 인덱스를 탄다', async () => {
      await expect(
        plan(
          'SELECT id FROM todos WHERE user_id = $1 AND due_date = $2 AND deleted_at IS NULL ORDER BY id',
        ),
      ).resolves.toContain('idx_todos_user_id_due_date');
    });

    it('조건을 빠뜨리면 부분 인덱스를 못 탄다 (누락 위험 확인)', async () => {
      await expect(
        plan(
          'SELECT id FROM todos WHERE user_id = $1 AND due_date = $2 ORDER BY id',
        ),
      ).resolves.not.toContain('idx_todos_user_id_due_date');
    });
  });
});
