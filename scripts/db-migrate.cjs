'use strict';
// 마이그레이션 실행기. 원본은 migrations/*.sql (TypeORM 마이그레이션 미사용).
//   node scripts/db-migrate.cjs up     [--test]   미적용분 적용 (기본 DATABASE_URL, --test 면 TEST_DATABASE_URL)
//   node scripts/db-migrate.cjs down   [--test]   마지막 1개 롤백 (harukok_test·harukok_check 만 허용)
//   node scripts/db-migrate.cjs check             harukok_check 에서 up → down → up 왕복 검증 후 삭제
// 각 .sql 파일은 자체 BEGIN/COMMIT 을 가진다. 실행기는 파일 내용을 그대로 보낸다.
const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');
const { loadEnv } = require('./env.cjs');
const {
  assertDestructiveAllowed,
  isLocalHost,
  parseDbTarget,
} = require('./lib/db-guard.cjs');

const ROOT = path.join(__dirname, '..');
const MIGRATIONS_DIR = path.join(ROOT, 'migrations');
const MIGRATIONS_TABLE = 'schema_migrations';
const CHECK_DB = 'harukok_check';
const FILE_RE = /^(\d{8}_\d{3})__([a-z0-9_]+?)(\.down)?\.sql$/;

/** migrations/ 의 적용·롤백 파일 쌍을 버전 순으로 돌려준다. 규칙 위반은 예외. */
function listMigrations(dir) {
  const byVersion = new Map();
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith('.sql')) continue;
    const m = FILE_RE.exec(file);
    if (!m) throw new Error(`마이그레이션 파일 이름 규칙 위반: ${file}`);
    const [, version, name, down] = m;
    const entry = byVersion.get(version) ?? { version, name };
    if (entry.name !== name) {
      throw new Error(`같은 버전 ${version} 에 이름이 둘 이상 있습니다.`);
    }
    entry[down ? 'down' : 'up'] = path.join(dir, file);
    byVersion.set(version, entry);
  }
  const list = [...byVersion.values()].sort((a, b) =>
    a.version.localeCompare(b.version),
  );
  for (const m of list) {
    const base = `${m.version}__${m.name}`;
    if (!m.up) throw new Error(`적용 파일이 없습니다: ${base}.sql`);
    if (!m.down) throw new Error(`롤백 파일이 없습니다: ${base}.down.sql`);
  }
  return list.map(({ version, name, up, down }) => ({
    version,
    name,
    up,
    down,
  }));
}

function withDatabase(url, name) {
  const u = new URL(url);
  u.pathname = `/${name}`;
  return u.toString();
}

function diffSnapshots(before, after) {
  const out = [];
  for (const kind of Object.keys(before)) {
    const a = new Set(before[kind]);
    const b = new Set(after[kind] ?? []);
    for (const x of a) if (!b.has(x)) out.push(`${kind} 빠짐: ${x}`);
    for (const x of b) if (!a.has(x)) out.push(`${kind} 추가: ${x}`);
  }
  return out;
}

async function ensureTable(client) {
  await client.query(
    `CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
       version    text        PRIMARY KEY,
       applied_at timestamptz NOT NULL DEFAULT now()
     )`,
  );
}

async function appliedVersions(client) {
  await ensureTable(client);
  const r = await client.query(
    `SELECT version FROM ${MIGRATIONS_TABLE} ORDER BY version`,
  );
  return r.rows.map((row) => row.version);
}

async function migrateUp(client, dir) {
  const applied = new Set(await appliedVersions(client));
  const done = [];
  for (const m of listMigrations(dir)) {
    if (applied.has(m.version)) continue;
    await client.query(fs.readFileSync(m.up, 'utf8'));
    await client.query(
      `INSERT INTO ${MIGRATIONS_TABLE} (version) VALUES ($1)`,
      [m.version],
    );
    done.push(`${m.version}__${m.name}`);
  }
  return done;
}

/** 롤백. all 이면 전부 되돌리고 기록 테이블도 지운다. */
async function migrateDown(client, dir, { all = false } = {}) {
  const byVersion = new Map(listMigrations(dir).map((m) => [m.version, m]));
  const applied = (await appliedVersions(client)).reverse();
  const done = [];
  for (const version of all ? applied : applied.slice(0, 1)) {
    const m = byVersion.get(version);
    if (!m) throw new Error(`적용 기록은 있으나 파일이 없습니다: ${version}`);
    await client.query(fs.readFileSync(m.down, 'utf8'));
    await client.query(`DELETE FROM ${MIGRATIONS_TABLE} WHERE version = $1`, [
      version,
    ]);
    done.push(`${m.version}__${m.name}`);
  }
  if (all) await client.query(`DROP TABLE IF EXISTS ${MIGRATIONS_TABLE}`);
  return done;
}

/** public 스키마의 사용자 객체 목록. 실행기 기록 테이블은 뺀다. */
async function snapshot(client) {
  const q = async (sql, params = [MIGRATIONS_TABLE]) =>
    (await client.query(sql, params)).rows.map((r) => r.item);
  return {
    columns: await q(`
      SELECT table_name || '.' || column_name || ' ' || data_type || ' ' || is_nullable
             || ' default=' || coalesce(column_default, '') AS item
        FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name <> $1`),
    constraints: await q(`
      SELECT c.conrelid::regclass || ' ' || c.conname || ' ' || pg_get_constraintdef(c.oid) AS item
        FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
       WHERE n.nspname = 'public' AND c.conrelid::regclass::text <> $1`),
    indexes: await q(`
      SELECT indexdef AS item FROM pg_indexes
       WHERE schemaname = 'public' AND tablename <> $1`),
    triggers: await q(`
      SELECT pg_get_triggerdef(t.oid) AS item
        FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND NOT t.tgisinternal AND c.relname <> $1`),
    functions: await q(
      `
      SELECT pg_get_functiondef(p.oid) AS item
        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'`,
      [],
    ),
    relations: await q(`
      SELECT c.relkind::text || ' ' || c.relname AS item
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relname::text NOT IN ($1::text, $1::text || '_pkey')`),
    comments: await q(`
      SELECT c.relname || '.' || coalesce(a.attname, '') || ' ' || d.description AS item
        FROM pg_description d JOIN pg_class c ON c.oid = d.objoid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        LEFT JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = d.objsubid
       WHERE n.nspname = 'public' AND c.relname <> $1`),
  };
}

async function withClient(url, fn) {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

/** 테스트 DB 초기화: 전체 롤백 → 전체 적용. harukok_test·harukok_check 만 허용. */
async function resetDatabase(url, dir) {
  assertDestructiveAllowed(url);
  await withClient(url, async (client) => {
    await migrateDown(client, dir, { all: true });
    await migrateUp(client, dir);
  });
}

async function check(baseUrl, dir) {
  const url = withDatabase(baseUrl, CHECK_DB);
  assertDestructiveAllowed(url);
  const admin = withDatabase(baseUrl, 'postgres');
  // 이름은 상수라 식별자 주입 위험이 없다.
  await withClient(admin, async (c) => {
    await c.query(`DROP DATABASE IF EXISTS ${CHECK_DB}`);
    await c.query(`CREATE DATABASE ${CHECK_DB}`);
  });
  try {
    await withClient(url, async (client) => {
      const empty = await snapshot(client);
      console.log(`적용: ${(await migrateUp(client, dir)).join(', ')}`);
      const first = await snapshot(client);

      console.log(
        `롤백: ${(await migrateDown(client, dir, { all: true })).join(', ')}`,
      );
      const left = diffSnapshots(empty, await snapshot(client));
      if (left.length > 0) {
        throw new Error(`롤백 후 남은 객체가 있습니다:\n${left.join('\n')}`);
      }

      await migrateUp(client, dir);
      const diff = diffSnapshots(first, await snapshot(client));
      if (diff.length > 0) {
        throw new Error(
          `재적용 결과가 첫 적용과 다릅니다:\n${diff.join('\n')}`,
        );
      }
    });
    console.log('db:check 통과: up → down(잔여 0) → up(동일)');
  } finally {
    await withClient(admin, (c) =>
      c.query(`DROP DATABASE IF EXISTS ${CHECK_DB}`),
    );
  }
}

async function main(argv) {
  const [command] = argv;
  const env = loadEnv(ROOT);
  const key = argv.includes('--test') ? 'TEST_DATABASE_URL' : 'DATABASE_URL';
  const url = env[key];
  if (!url) throw new Error(`${key} 가 필요합니다 (.env 또는 환경변수).`);
  if (!isLocalHost(parseDbTarget(url).host)) {
    throw new Error('DB 안전 가드: 로컬 호스트가 아니면 실행하지 않습니다.');
  }

  if (command === 'up') {
    const done = await withClient(url, (c) => migrateUp(c, MIGRATIONS_DIR));
    console.log(done.length ? `적용: ${done.join(', ')}` : '적용할 것 없음');
  } else if (command === 'down') {
    assertDestructiveAllowed(url);
    const done = await withClient(url, (c) => migrateDown(c, MIGRATIONS_DIR));
    console.log(done.length ? `롤백: ${done.join(', ')}` : '롤백할 것 없음');
  } else if (command === 'check') {
    await check(url, MIGRATIONS_DIR);
  } else {
    throw new Error('사용법: db-migrate.cjs <up|down|check> [--test]');
  }
}

if (require.main === module) {
  main(process.argv.slice(2)).catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}

module.exports = {
  MIGRATIONS_TABLE,
  listMigrations,
  withDatabase,
  diffSnapshots,
  migrateUp,
  migrateDown,
  snapshot,
  resetDatabase,
};
