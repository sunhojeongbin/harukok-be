'use strict';
// 로컬 개발용 임시 데이터(이용약관 · 테스트 계정). 운영에는 넣지 않는다.
//   node scripts/db-seed.cjs   → DATABASE_URL(로컬 호스트만)에 넣는다. 이미 있으면 건너뛴다.
// 이용약관 공개 URL 이 확정되면 실제 약관은 새 번호의 마이그레이션으로 추가한다 (DB 설계서 10장).
// 약관은 이용약관 1종이다. 개인정보 처리방침은 DB 에 두지 않는다 (006).
const path = require('node:path');
const { Client } = require('pg');
const { loadEnv } = require('./env.cjs');
const { isLocalHost, parseDbTarget } = require('./lib/db-guard.cjs');

// example.com 은 예약 도메인이라 실제 서비스에 쓰일 수 없다 — 임시 값이 남아도 바로 드러난다.
const TEMP_TERMS = [
  {
    version: '0.1',
    title: '서비스 이용약관 (임시)',
    contentUrl: 'https://example.com/harukok/terms',
    effectiveFrom: '2026-11-01T00:00:00+09:00',
  },
];

async function seedTerms(client) {
  let inserted = 0;
  for (const t of TEMP_TERMS) {
    const r = await client.query(
      `INSERT INTO terms (version, title, content_url, effective_from)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT ON CONSTRAINT uq_terms_version DO NOTHING`,
      [t.version, t.title, t.contentUrl, t.effectiveFrom],
    );
    inserted += r.rowCount ?? 0;
  }
  return inserted;
}

async function main() {
  const env = loadEnv(path.join(__dirname, '..'));
  if (env.NODE_ENV === 'production') {
    throw new Error(
      'db:seed 는 운영(NODE_ENV=production)에서 실행하지 않습니다.',
    );
  }
  const url = env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL 이 필요합니다 (.env 또는 환경변수).');
  if (!isLocalHost(parseDbTarget(url).host)) {
    throw new Error('DB 안전 가드: 로컬 호스트가 아니면 실행하지 않습니다.');
  }
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const n = await seedTerms(client);
    console.log(`임시 약관: ${n}건 추가 (이미 있던 것은 건너뜀)`);
    const account = await seedTestAccount(client);
    console.log(
      `테스트 계정: ${account.created ? '추가' : '이미 있음'} (users.id ${account.userId}) — docs/guides/test-account.md`,
    );
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}

// 개발 전용 테스트 계정 — src/modules/auth/social/dev-test-login.ts 와 같은 값이어야 한다
// (test/tooling/db-seed.spec.ts 가 대조). DEV_TEST_LOGIN=true 서버에서 GOOGLE + 'dev-test-token' 으로 로그인된다.
const TEST_ACCOUNT = Object.freeze({
  provider: 'GOOGLE',
  providerUserId: 'dev-test-user',
  email: 'dev-test@example.com',
  name: '테스트 계정',
});

/** 사용자 · 소셜 계정 · (현행 약관이 있으면) 약관 동의를 한 트랜잭션으로 넣는다. 이미 있으면 건너뛴다 */
async function seedTestAccount(client) {
  const a = TEST_ACCOUNT;
  await client.query('BEGIN');
  try {
    const found = await client.query(
      `SELECT user_id FROM user_social_accounts
        WHERE provider = $1 AND provider_user_id = $2`,
      [a.provider, a.providerUserId],
    );
    if (found.rows.length > 0) {
      await client.query('COMMIT');
      return { userId: found.rows[0].user_id, created: false };
    }
    const user = await client.query(
      'INSERT INTO users (name, email) VALUES ($1, $2) RETURNING id',
      [a.name, a.email],
    );
    const userId = user.rows[0].id;
    await client.query(
      `INSERT INTO user_social_accounts (user_id, provider, provider_user_id)
       VALUES ($1, $2, $3)`,
      [userId, a.provider, a.providerUserId],
    );
    // 로그인과 같은 판정(시행 중 최신)으로 자동 동의를 기록한다. 약관이 없으면 첫 로그인 때 보충된다
    await client.query(
      `INSERT INTO user_term_agreements (user_id, term_id)
       SELECT $1, id FROM terms WHERE effective_from <= now()
        ORDER BY effective_from DESC, created_at DESC, id DESC LIMIT 1`,
      [userId],
    );
    await client.query('COMMIT');
    return { userId, created: true };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

module.exports = { TEMP_TERMS, seedTerms, TEST_ACCOUNT, seedTestAccount };
