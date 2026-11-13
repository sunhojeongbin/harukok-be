'use strict';
// PreToolUse(Bash): 파괴적·위험 명령을 차단한다.
// 명령을 따옴표를 존중해 조각(&&, ||, ;, |, 줄바꿈 등)으로 나누고 각 조각의 토큰을 검사한다.
// 따옴표 안 문자열은 명령으로 보지 않는다 (단 psql -c 의 SQL, sh -c 의 스크립트는 검사한다).

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { projectDir, runHook } = require('./lib/hook-io.cjs');
const { protectedReason } = require('./lib/protected-paths.cjs');
const libDir = path.join(__dirname, '..', '..', 'scripts', 'lib');
const { isLocalHost, assertDbNameDestructiveAllowed, parseDbTarget } = require(
  path.join(libDir, 'db-guard.cjs'),
);

const ALLOW = { allow: true };
const deny = (reason) => ({ allow: false, reason });
const MAX_DEPTH = 3;

/** 따옴표 밖의 연산자로 조각을 나누고 각 조각을 따옴표 제거된 토큰 배열로 만든다. */
function tokenize(command) {
  const pieces = [];
  let tokens = [];
  let cur = '';
  let has = false;
  let quote = null;
  const endToken = () => {
    if (has) tokens.push(cur);
    cur = '';
    has = false;
  };
  const endPiece = () => {
    endToken();
    if (tokens.length) pieces.push(tokens);
    tokens = [];
  };
  for (let i = 0; i < command.length; i++) {
    const c = command[i];
    if (quote === "'") {
      if (c === "'") quote = null;
      else cur += c;
    } else if (quote === '"') {
      if (c === '"') quote = null;
      else if (c === '\\' && i + 1 < command.length) cur += command[++i];
      else cur += c;
    } else if (c === "'" || c === '"') {
      quote = c;
      has = true;
    } else if (c === '\\' && i + 1 < command.length) {
      cur += command[++i];
      has = true;
    } else if (/\s/.test(c) && c !== '\n') {
      endToken();
    } else if ('\n;&|()`'.includes(c)) {
      endPiece();
    } else {
      cur += c;
      has = true;
    }
  }
  endPiece();
  return pieces;
}

const WRAPPERS = ['sudo', 'env', 'command', 'nohup', 'time', 'exec', 'nice'];
const SHELLS = ['sh', 'bash', 'zsh', 'dash', 'ksh'];
const PG_TOOLS = [
  'psql',
  'dropdb',
  'createdb',
  'pg_dump',
  'pg_dumpall',
  'pg_restore',
];
const READERS = [
  'cat',
  'less',
  'more',
  'head',
  'tail',
  'grep',
  'egrep',
  'fgrep',
  'rg',
  'ag',
  'sed',
  'awk',
  'bat',
  'nl',
  'tac',
  'strings',
  'xxd',
  'od',
  'source',
  '.',
];
// 도구별 값을 받는 옵션. 여기에 없는 옵션(-e, -l, -S 등)은 값이 없는 플래그로 본다.
const PG_SHORT_VALUE = {
  psql: 'hpUdfcoTvPLFR',
  dropdb: 'hpUOD',
  createdb: 'hpUODETl',
  other: 'hpUdfFjnNtTZES',
};
const PG_LONG_VALUE = {
  psql: [
    '--host',
    '--port',
    '--username',
    '--dbname',
    '--file',
    '--command',
    '--output',
    '--variable',
    '--set',
  ],
  dropdb: ['--maintenance-db', '--host', '--port', '--username'],
  createdb: [
    '--maintenance-db',
    '--host',
    '--port',
    '--username',
    '--owner',
    '--tablespace',
    '--encoding',
    '--template',
    '--locale',
  ],
  other: [
    '--host',
    '--port',
    '--username',
    '--dbname',
    '--file',
    '--format',
    '--jobs',
    '--schema',
    '--table',
  ],
};
const MAX_SQL_FILE = 1024 * 1024;

/** 앞쪽의 VAR=값, sudo/env 등을 걷어내고 { env, cmd, args } 로 나눈다. */
function splitCommand(tokens) {
  const env = [];
  let i = 0;
  for (;;) {
    if (i < tokens.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[i])) {
      env.push(tokens[i++]);
    } else if (
      i < tokens.length &&
      WRAPPERS.includes(path.basename(tokens[i]))
    ) {
      i++;
    } else break;
  }
  if (i >= tokens.length) return null;
  return { env, cmd: path.basename(tokens[i]), args: tokens.slice(i + 1) };
}

const shortCluster = (a, ch) => /^-[^-]/.test(a) && a.slice(1).includes(ch);

function checkGit(args) {
  let i = 0;
  while (i < args.length) {
    if (
      ['-C', '-c', '--git-dir', '--work-tree', '--namespace'].includes(args[i])
    )
      i += 2;
    else if (args[i].startsWith('-')) i++;
    else break;
  }
  const sub = args[i];
  const rest = args.slice(i + 1);
  if (sub === 'push') {
    const hit = rest.find(
      (a) =>
        a === '--force' ||
        a.startsWith('--force-with-lease') ||
        a === '--force-if-includes' ||
        shortCluster(a, 'f') ||
        /^\+[^\s]/.test(a),
    );
    if (hit)
      return deny(
        `차단: git push 강제 푸시(${hit}, force)는 허용되지 않습니다.`,
      );
  }
  if (sub === 'reset' && rest.includes('--hard')) {
    return deny(
      '차단: git reset --hard 는 작업 내용을 잃을 수 있어 허용되지 않습니다.',
    );
  }
  if (
    sub === 'clean' &&
    rest.some((a) => a === '--force' || shortCluster(a, 'f'))
  ) {
    return deny(
      '차단: git clean -f 는 추적되지 않는 파일을 삭제하므로 허용되지 않습니다.',
    );
  }
  return null;
}

function checkRm(args, ctx) {
  let r = false;
  let f = false;
  let onlyTargets = false;
  const targets = [];
  for (const a of args) {
    if (onlyTargets) targets.push(a);
    else if (a === '--') onlyTargets = true;
    else if (a === '--recursive') r = true;
    else if (a === '--force') f = true;
    else if (/^-[^-]/.test(a)) {
      if (/[rR]/.test(a)) r = true;
      if (a.includes('f')) f = true;
    } else if (!a.startsWith('--')) targets.push(a);
  }
  if (!(r && f)) return null;
  const root = path.resolve(ctx.projectDir);
  const home = ctx.home;
  for (const t of targets) {
    if (t.includes('$')) {
      if (/^\$\{?HOME\}?(\/|$)/.test(t))
        return deny(`차단: rm -rf 대상 '${t}' 은(는) 홈 디렉터리입니다.`);
      return deny(
        `차단: rm -rf 대상 '${t}' 에 변수가 있어 안전을 판정할 수 없습니다.`,
      );
    }
    const expanded =
      t === '~' || t.startsWith('~/') ? path.join(home, t.slice(1)) : t;
    const abs = path.resolve(root, expanded);
    const rel = path.relative(root, abs);
    const outside =
      rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel);
    const inGit = rel === '.git' || rel.startsWith(`.git${path.sep}`);
    const globAtRoot =
      /^(\.?\*|\.\[.*\]\*)$/.test(path.basename(expanded)) &&
      path.dirname(abs) === root;
    if (
      abs === path.parse(abs).root ||
      abs === path.resolve(home) ||
      outside ||
      rel === '' ||
      inGit ||
      globAtRoot
    ) {
      return deny(
        `차단: rm -rf 대상 '${t}' 은(는) 루트·홈·상위·프로젝트 루트·.git·프로젝트 밖 경로이거나 전체 삭제 글롭입니다.`,
      );
    }
  }
  return null;
}

/** DB 이름이 파괴적 작업 허용 목록에 있는지 확인한다. */
function checkDbName(name, what) {
  try {
    assertDbNameDestructiveAllowed(name);
    return null;
  } catch (e) {
    return deny(`차단: ${what} — ${e.message}`);
  }
}

function checkHost(host, what) {
  if (host === '' || host.startsWith('/') || isLocalHost(host)) return null;
  return deny(`차단: ${what} 의 호스트 '${host}' 는 로컬이 아닙니다.`);
}

const DB_STMT =
  /\b(drop|create)\s+database\s+(?:if\s+(?:not\s+)?exists\s+)?"?([\w-]+)"?/gi;

/** SQL 텍스트의 DROP/CREATE DATABASE 대상 이름을 검사한다. */
function checkSqlText(text) {
  DB_STMT.lastIndex = 0;
  let m;
  while ((m = DB_STMT.exec(text))) {
    const d = checkDbName(m[2], `${m[1].toUpperCase()} DATABASE ${m[2]}`);
    if (d) return d;
  }
  return null;
}

/** SQL 파일이 있으면 읽어서 검사한다. 없거나 읽을 수 없으면 통과. */
function checkSqlFile(file, ctx) {
  if (file === '' || file === '-') return null;
  const abs = path.resolve(ctx.projectDir, file);
  let text;
  try {
    if (fs.statSync(abs).size > MAX_SQL_FILE) return null;
    text = fs.readFileSync(abs, 'utf8');
  } catch {
    return null;
  }
  return checkSqlText(text);
}

function checkPg(cmd, args, env, ctx) {
  for (const e of env) {
    const m = /^PGHOST(?:ADDR)?=(.*)$/.exec(e);
    if (m) {
      const d = checkHost(m[1], `${e}`);
      if (d) return d;
    }
  }
  const kind = cmd in PG_SHORT_VALUE ? cmd : 'other';
  const shortValue = PG_SHORT_VALUE[kind];
  const longValue = PG_LONG_VALUE[kind];
  const positional = [];
  const sql = [];
  const files = [];
  const apply = (flag, val) => {
    if (flag === 'h' || flag === 'host') {
      return checkHost(val, `${cmd} -h`);
    }
    if (kind === 'psql' && (flag === 'c' || flag === 'command')) {
      sql.push(val);
      return null;
    }
    if (kind === 'psql' && (flag === 'f' || flag === 'file')) {
      files.push(val);
      return null;
    }
    return connInfoHost(val);
  };
  let onlyPositional = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    let d = null;
    if (onlyPositional || !a.startsWith('-') || a === '-') {
      if (a.startsWith('<') && !a.startsWith('<<')) {
        files.push(a.slice(1) || (args[++i] ?? ''));
      } else positional.push(a);
    } else if (a === '--') onlyPositional = true;
    else if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      const name = eq >= 0 ? a.slice(0, eq) : a;
      if (longValue.includes(name)) {
        d = apply(name.slice(2), eq >= 0 ? a.slice(eq + 1) : (args[++i] ?? ''));
      }
    } else {
      for (let j = 1; j < a.length; j++) {
        if (shortValue.includes(a[j])) {
          const rest = a.slice(j + 1);
          d = apply(a[j], rest !== '' ? rest : (args[++i] ?? ''));
          break;
        }
      }
    }
    if (d) return d;
  }
  for (const a of [...positional, ...args]) {
    const c = connInfoHost(a);
    if (c) return c;
  }
  for (const s of sql) {
    const d = checkSqlText(s);
    if (d) return d;
  }
  for (const f of files) {
    const d = checkSqlFile(f, ctx);
    if (d) return d;
  }
  if (cmd === 'dropdb' || cmd === 'createdb') {
    const name = positional[0];
    if (name !== undefined) return checkDbName(name, `${cmd} ${name}`);
  }
  return null;
}

/** URL(postgres://…) 또는 key=value 접속 문자열의 호스트를 검사한다. */
function connInfoHost(v) {
  if (/^postgres(ql)?:\/\//i.test(v)) {
    try {
      return checkHost(parseDbTarget(v).host, 'DB URL');
    } catch {
      return deny(
        '차단: DB URL 을 해석할 수 없거나 허용되지 않는 쿼리 파라미터가 있습니다.',
      );
    }
  }
  const m = /(?:^|\s)host(?:addr)?\s*=\s*'?([^\s']*)/.exec(v);
  return m ? checkHost(m[1], '접속 문자열') : null;
}

function checkReader(cmd, args) {
  for (const a of args) {
    const v = a
      .replace(/^[<>]+/, '')
      .split('=')
      .pop();
    const name = path.basename(v);
    if (/^\.env(\..+)?$/.test(name) && name !== '.env.example') {
      return deny(
        `차단: ${cmd} 로 ${name} 을(를) 읽을 수 없습니다 (비밀값 보호, .env.example 만 허용).`,
      );
    }
  }
  return null;
}

/** 쓰기·삭제·이동 대상이 보호 경로면 차단한다 (편집 가드의 Bash 우회 방지). */
function checkTarget(t, ctx) {
  if (typeof t !== 'string' || t === '' || t.includes('$')) return null;
  const expanded =
    t === '~' || t.startsWith('~/') ? path.join(ctx.home, t.slice(1)) : t;
  const reason = protectedReason(expanded, ctx);
  return reason ? deny(`${reason} (Bash 쓰기 포함)`) : null;
}

const nonFlags = (args) => {
  const out = [];
  let only = false;
  for (const a of args) {
    if (only) out.push(a);
    else if (a === '--') only = true;
    else if (!a.startsWith('-') || a === '-') out.push(a);
  }
  return out;
};

/** 리다이렉션(>, >>, 2>, &>, >|) 대상을 검사한다. */
function checkRedirects(tokens, ctx) {
  for (let i = 0; i < tokens.length; i++) {
    const m = /^(?:\d*|&)>>?\|?(.*)$/.exec(tokens[i]);
    if (!m) continue;
    const target = m[1] !== '' ? m[1] : tokens[i + 1];
    if (target && !target.startsWith('&')) {
      const d = checkTarget(target, ctx);
      if (d) return d;
    }
  }
  return null;
}

function checkWrites(cmd, args, ctx) {
  let targets = [];
  if (['rm', 'unlink', 'mv', 'cp', 'tee', 'truncate'].includes(cmd)) {
    targets = nonFlags(args);
  } else if (
    (cmd === 'sed' &&
      args.some(
        (a) =>
          a === '--in-place' ||
          /^-[^-]*i/.test(a) ||
          a.startsWith('--in-place='),
      )) ||
    (cmd === 'perl' && args.some((a) => /^-[^-]*i/.test(a)))
  ) {
    targets = nonFlags(args);
  } else if (cmd === 'git') {
    let i = 0;
    while (i < args.length) {
      if (
        ['-C', '-c', '--git-dir', '--work-tree', '--namespace'].includes(
          args[i],
        )
      )
        i += 2;
      else if (args[i].startsWith('-')) i++;
      else break;
    }
    if (['checkout', 'restore', 'rm', 'mv'].includes(args[i])) {
      targets = nonFlags(args.slice(i + 1));
    }
  }
  for (const t of targets) {
    const d = checkTarget(t, ctx);
    if (d) return d;
  }
  return null;
}

function checkTokens(tokens, ctx, depth) {
  const redirect = checkRedirects(tokens, ctx);
  if (redirect) return redirect;
  const parts = splitCommand(tokens);
  if (!parts) return null;
  const { env, cmd, args } = parts;
  const write = checkWrites(cmd, args, ctx);
  if (write) return write;
  if (cmd === 'git') return checkGit(args);
  if (cmd === 'rm') return checkRm(args, ctx);
  if (PG_TOOLS.includes(cmd)) return checkPg(cmd, args, env, ctx);
  if (READERS.includes(cmd)) return checkReader(cmd, args);
  if (depth < MAX_DEPTH) {
    let script = null;
    if (SHELLS.includes(cmd)) {
      const i = args.findIndex((a) => shortCluster(a, 'c'));
      if (i >= 0 && args[i + 1] !== undefined) script = args[i + 1];
    } else if (cmd === 'eval') script = args.join(' ');
    if (script !== null) return checkCommand(script, ctx, depth + 1);
  }
  return null;
}

function checkCommand(command, ctx, depth) {
  // stdin(파이프·here-string·heredoc)으로 넘기는 SQL 은 조각 단위로 볼 수 없어 명령 전체에서 찾는다.
  if (/\bpsql\b/.test(command)) {
    const d = checkSqlText(command);
    if (d) return d;
  }
  for (const tokens of tokenize(command)) {
    const d = checkTokens(tokens, ctx, depth);
    if (d) return d;
  }
  return null;
}

/** ctx = { projectDir?, home?, base?, fileInBase? } */
function decide(input, ctx = {}) {
  if (input.tool_name && input.tool_name !== 'Bash') return ALLOW;
  const command = input.tool_input?.command;
  if (typeof command !== 'string' || command === '') return ALLOW;
  return (
    checkCommand(
      command,
      {
        projectDir: ctx.projectDir ?? projectDir(input),
        home: ctx.home ?? os.homedir(),
        base: ctx.base,
        fileInBase: ctx.fileInBase,
      },
      0,
    ) ?? ALLOW
  );
}

module.exports = { decide };

if (require.main === module) void runHook('pre-bash-guard', decide);
