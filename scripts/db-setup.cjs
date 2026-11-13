'use strict';
// 로컬 개발/테스트 DB 생성 스크립트. 생성만 하고 삭제는 하지 않는다.
// .env 의 DATABASE_URL, TEST_DATABASE_URL 을 읽는다 (의존성 없음).
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { isLocalHost, parseDbTarget } = require('./lib/db-guard.cjs');

function parseEnv(file) {
  const env = {};
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (/^(['"]).*\1$/.test(value)) value = value.slice(1, -1);
    else value = value.replace(/\s+#.*$/, '');
    env[key] = value;
  }
  return env;
}

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

function run(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: 'utf8' });
  if (r.error) fail(`${cmd} 실행 실패: ${r.error.message}`);
  return r;
}

/** URL 의 DB 부분만 postgres 로 바꾼 관리용 URL */
function adminUrl(url) {
  const u = new URL(url);
  u.pathname = '/postgres';
  return u.toString();
}

function main() {
  const envFile = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envFile)) {
    fail(
      '.env 가 없습니다. `cp .env.example .env` 후 사용자 이름을 수정하세요.',
    );
  }
  const env = parseEnv(envFile);
  const urls = [env.DATABASE_URL, env.TEST_DATABASE_URL];
  if (urls.some((u) => !u))
    fail('.env 에 DATABASE_URL 과 TEST_DATABASE_URL 이 필요합니다.');

  const targets = urls.map((u) => {
    try {
      return { url: u, ...parseDbTarget(u) };
    } catch {
      return fail(`DB URL 을 해석할 수 없습니다: ${u}`);
    }
  });

  if (!targets.every((t) => isLocalHost(t.host))) {
    fail(
      'DB 안전 가드: 로컬 호스트(localhost/127.0.0.1/::1)가 아니면 db:setup 을 실행하지 않습니다.',
    );
  }
  if (targets.some((t) => !t.database)) fail('URL 에 DB 이름이 없습니다.');

  const admin = adminUrl(targets[0].url);
  const ver = run('psql', [admin, '-tAc', 'SHOW server_version_num']);
  if (ver.status !== 0)
    fail(`PostgreSQL 에 연결할 수 없습니다.\n${ver.stderr}`);
  const versionNum = Number(ver.stdout.trim());
  if (!(versionNum >= 180000)) {
    fail(`PostgreSQL 18 이상이 필요합니다. 현재: ${ver.stdout.trim()}`);
  }

  for (const t of targets) {
    const adm = adminUrl(t.url);
    const exists = run('psql', [
      adm,
      '-tA',
      '-v',
      `name=${t.database}`,
      '-c',
      "SELECT 1 FROM pg_database WHERE datname = :'name'",
    ]);
    if (exists.status !== 0) fail(`DB 조회 실패: ${exists.stderr}`);
    if (exists.stdout.trim() === '1') {
      console.log(`이미 있음: ${t.database}`);
      continue;
    }
    const created = run('createdb', ['--maintenance-db', adm, t.database]);
    if (created.status !== 0) fail(`DB 생성 실패: ${created.stderr}`);
    console.log(`생성됨: ${t.database}`);
  }
}

main();
