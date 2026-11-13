'use strict';
// 로컬 개발/테스트 DB 생성 스크립트. 생성만 하고 삭제는 하지 않는다.
// DATABASE_URL, TEST_DATABASE_URL 을 .env 또는 환경변수(CI)에서 읽는다 (의존성 없음).
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { loadEnv } = require('./env.cjs');
const { isLocalHost, parseDbTarget } = require('./lib/db-guard.cjs');

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

function run(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: 'utf8' }); // shell 미사용
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
  const env = loadEnv(path.join(__dirname, '..'));
  const urls = [env.DATABASE_URL, env.TEST_DATABASE_URL];
  if (urls.some((u) => !u))
    fail(
      'DATABASE_URL 과 TEST_DATABASE_URL 이 필요합니다. `cp .env.example .env` 후 사용자 이름을 수정하세요.',
    );

  const targets = urls.map((u) => {
    try {
      return { url: u, ...parseDbTarget(u) };
    } catch {
      return fail(
        'DB URL 을 해석할 수 없거나 허용되지 않는 쿼리 파라미터가 있습니다 (host, dbname 등은 URL 쿼리로 지정할 수 없음). .env 를 확인하세요.',
      );
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
    if (!/^[a-z_][a-z0-9_]*$/.test(t.database)) {
      fail('DB 이름은 소문자·숫자·밑줄만 허용됩니다.');
    }
    // psql -c 는 :변수 치환이 안 되므로 검증된 이름을 리터럴로 넣는다.
    const exists = run('psql', [
      adm,
      '-tA',
      '-c',
      `SELECT 1 FROM pg_database WHERE datname = '${t.database}'`,
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
