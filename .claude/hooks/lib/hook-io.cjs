'use strict';
// 훅 공통 입출력. Node 표준 라이브러리만 사용한다.
// 계약: stdin 으로 JSON 입력, exit 2 = 차단(stderr 가 Claude 에게 전달), exit 0 = 허용.

/** stdin 전체를 읽어 JSON 으로 파싱한다. 실패하면 reject. */
function readInput() {
  return new Promise((resolve, reject) => {
    const chunks = [];
    process.stdin.on('data', (c) => chunks.push(c));
    process.stdin.on('error', reject);
    process.stdin.on('end', () => {
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (parsed === null || typeof parsed !== 'object') {
          throw new Error('JSON 객체가 아님');
        }
        resolve(parsed);
      } catch (e) {
        reject(new Error(`훅 입력 JSON 을 해석할 수 없습니다: ${e.message}`));
      }
    });
  });
}

/** 사유를 stderr 로 내고 exit 2 로 종료한다. */
function block(reason) {
  process.stderr.write(`${reason}\n`);
  process.exit(2);
}

/** 프로젝트 루트: CLAUDE_PROJECT_DIR 우선, 없으면 입력의 cwd. */
function projectDir(input) {
  return process.env.CLAUDE_PROJECT_DIR ?? input.cwd;
}

/**
 * 훅 진입점. 입력을 읽어 decide 로 판정하고 종료한다.
 * 해석 불가 입력이나 판정 중 예외는 보호 동작을 놓치지 않도록 차단(fail-closed)한다.
 * (훅은 settings 의 matcher 로 해당 도구에만 걸리므로 오차단 범위가 좁다.)
 */
async function runHook(name, decide) {
  let input;
  try {
    input = await readInput();
  } catch (e) {
    block(`[${name}] ${e.message} — 안전을 위해 차단합니다.`);
  }
  let result;
  try {
    result = decide(input, {});
  } catch (e) {
    block(`[${name}] 판정 중 오류(${e.message}) — 안전을 위해 차단합니다.`);
  }
  if (!result.allow) block(result.reason);
  process.exit(0);
}

module.exports = { readInput, block, projectDir, runHook };
