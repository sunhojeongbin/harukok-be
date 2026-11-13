'use strict';
// Stop: npm run verify:fast 로 종료 전 검증한다. 실패하면 되돌려 보내고,
// 세션당 3회 연속 실패하면 STUCK 파일을 남기고 사람에게 넘긴다.

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { readInput, projectDir } = require('./lib/hook-io.cjs');

const MAX_RETRIES = 3;
const TAIL_LINES = 80;

const stateDir = (root) => path.join(root, '.claude', 'state');
// 세션 id 가 경로를 벗어나지 못하게 안전한 문자만 남긴다.
const safeId = (id) => String(id || 'unknown').replace(/[^A-Za-z0-9_-]/g, '_');

function statePath(root, sessionId) {
  return path.join(stateDir(root), `stop-${safeId(sessionId)}.json`);
}

/** failuresBefore: 이번 검증 이전의 연속 실패 횟수. */
function nextAction(failuresBefore, passed) {
  if (passed) return 'pass';
  return failuresBefore + 1 < MAX_RETRIES ? 'block' : 'give-up';
}

function readFailures(file) {
  try {
    const n = JSON.parse(fs.readFileSync(file, 'utf8')).failures;
    return Number.isInteger(n) && n >= 0 ? n : 0;
  } catch {
    return 0;
  }
}

const tail = (text, n) => text.trimEnd().split('\n').slice(-n).join('\n');

const VERIFY_TIMEOUT_MS = 570_000; // Stop 훅 제한(600초)보다 먼저 끊는다.

/** spawn 은 테스트용 주입 지점. 시간 초과는 status null → 실패로 취급한다. */
function defaultVerify(root, spawn = spawnSync) {
  const r = spawn('npm', ['run', 'verify:fast'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    timeout: VERIFY_TIMEOUT_MS,
    killSignal: 'SIGKILL',
  });
  const timedOut = r.error?.code === 'ETIMEDOUT';
  return {
    passed: r.status === 0,
    output: `${r.stdout ?? ''}${r.stderr ?? ''}${
      timedOut
        ? `\n검증 시간 초과(${VERIFY_TIMEOUT_MS / 1000}초)`
        : r.error
          ? r.error.message
          : ''
    }`,
  };
}

/** 부수효과는 파일뿐. { exitCode, stderr } 를 돌려준다. */
function runStop({ projectDir: root, sessionId, verify }) {
  const file = statePath(root, sessionId);
  const before = readFailures(file);
  const { passed, output } = (verify ?? defaultVerify)(root);
  const action = nextAction(before, passed);

  if (action === 'pass') {
    fs.rmSync(file, { force: true });
    return { exitCode: 0, stderr: '' };
  }
  fs.mkdirSync(stateDir(root), { recursive: true });
  if (action === 'block') {
    const n = before + 1;
    fs.writeFileSync(file, JSON.stringify({ failures: n }));
    return {
      exitCode: 2,
      stderr: `${tail(output, TAIL_LINES)}\n\n검증 실패 (${n}/${MAX_RETRIES}). 고친 뒤 다시 종료하세요.\n`,
    };
  }
  const stuck = path.join(stateDir(root), `STUCK-${safeId(sessionId)}.md`);
  fs.writeFileSync(
    stuck,
    `# 종료 검증 ${MAX_RETRIES}회 연속 실패\n\n세션: ${safeId(sessionId)}\n\n\`\`\`\n${tail(output, TAIL_LINES)}\n\`\`\`\n`,
  );
  fs.rmSync(file, { force: true });
  return {
    exitCode: 0,
    stderr: `${MAX_RETRIES}회 연속 실패 — 사람 확인 필요 (${path.relative(root, stuck)})\n`,
  };
}

module.exports = { MAX_RETRIES, defaultVerify, statePath, nextAction, runStop };

if (require.main === module) {
  void (async () => {
    let input = {};
    try {
      input = await readInput();
    } catch {
      // 입력을 못 읽어도 검증은 수행한다 (세션 id 만 unknown).
    }
    const r = runStop({
      projectDir: projectDir(input) ?? process.cwd(),
      sessionId: input.session_id,
    });
    if (r.stderr) process.stderr.write(r.stderr);
    process.exit(r.exitCode);
  })();
}
