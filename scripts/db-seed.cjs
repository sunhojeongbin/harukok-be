'use strict';
// 로컬 개발용 임시 데이터. 운영에는 넣지 않는다.
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

module.exports = { TEMP_TERMS, seedTerms };
