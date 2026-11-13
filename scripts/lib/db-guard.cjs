'use strict';
// DB 안전 가드: 파괴적 작업(생성/삭제/롤백)은 로컬 호스트 + 허용된 DB 이름에서만 허용한다.
// Node 표준 라이브러리만 사용한다.

const DESTRUCTIVE_DB_NAMES = ['harukok_test', 'harukok_check'];
// libpq URI 쿼리 파라미터(host, hostaddr, dbname, service, port, options 등)는
// 권한부·경로를 덮어쓸 수 있으므로, 연결 대상에 영향 없는 것만 허용한다.
const ALLOWED_QUERY_PARAMS = ['sslmode', 'connect_timeout', 'application_name'];
const LOCAL_HOSTS = ['localhost', '127.0.0.1', '::1', '[::1]'];

/** URL 에서 호스트와 DB 이름을 뽑는다. 파싱 실패 시 예외. */
function parseDbTarget(url) {
  const u = new URL(url);
  for (const key of u.searchParams.keys()) {
    if (!ALLOWED_QUERY_PARAMS.includes(key.toLowerCase())) {
      throw new Error(`허용되지 않는 URL 쿼리 파라미터: ${key}`);
    }
  }
  const database = decodeURIComponent(u.pathname.replace(/^\//, ''));
  return { host: u.hostname, database: database === '' ? null : database };
}

function isLocalHost(host) {
  return LOCAL_HOSTS.includes(host);
}

function assertDbNameDestructiveAllowed(name) {
  if (!DESTRUCTIVE_DB_NAMES.includes(name)) {
    throw new Error(
      `DB 안전 가드: DB 이름 '${name}' 은(는) 파괴적 작업이 허용되지 않습니다 (허용: ${DESTRUCTIVE_DB_NAMES.join(', ')}).`,
    );
  }
}

function assertDestructiveAllowed(url) {
  let target;
  try {
    target = parseDbTarget(url);
  } catch {
    throw new Error(
      'DB 안전 가드: DB URL 을 해석할 수 없거나 허용되지 않는 쿼리 파라미터가 있어 거부합니다.',
    );
  }
  if (!isLocalHost(target.host)) {
    throw new Error(
      `DB 안전 가드: 호스트 '${target.host}' 는 로컬이 아니어서 거부합니다.`,
    );
  }
  if (target.database === null) {
    throw new Error('DB 안전 가드: DB 이름이 없어 거부합니다.');
  }
  assertDbNameDestructiveAllowed(target.database);
}

module.exports = {
  DESTRUCTIVE_DB_NAMES,
  parseDbTarget,
  isLocalHost,
  assertDestructiveAllowed,
  assertDbNameDestructiveAllowed,
};
