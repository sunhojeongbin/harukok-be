'use strict';
// PreToolUse(Edit|Write|MultiEdit): 보호 대상 파일 편집을 차단한다.

const { projectDir, runHook } = require('./lib/hook-io.cjs');
const { protectedReason } = require('./lib/protected-paths.cjs');

const EDIT_TOOLS = ['Edit', 'Write', 'MultiEdit', 'NotebookEdit'];
const ALLOW = { allow: true };
const deny = (reason) => ({ allow: false, reason });

/**
 * ctx = { projectDir?, base?, fileInBase?(relPath) } — 생략하면 git 에서 구한다.
 * base 가 undefined 면 defaultBase() 를, null 이면 기준 없음으로 취급한다.
 */
function decide(input, ctx = {}) {
  if (input.tool_name && !EDIT_TOOLS.includes(input.tool_name)) return ALLOW;
  const target = input.tool_input?.file_path ?? input.tool_input?.notebook_path;
  if (typeof target !== 'string' || target === '') return ALLOW;

  const reason = protectedReason(target, {
    projectDir: ctx.projectDir ?? projectDir(input),
    base: ctx.base,
    fileInBase: ctx.fileInBase,
  });
  return reason ? deny(reason) : ALLOW;
}

module.exports = { decide };

if (require.main === module) void runHook('pre-edit-guard', decide);
