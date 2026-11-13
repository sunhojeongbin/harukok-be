'use strict';
// PreToolUse(Edit|Write|MultiEdit): 보호 대상 파일 편집을 차단한다.

const path = require('node:path');
const { projectDir, runHook } = require('./lib/hook-io.cjs');
const { defaultBase, fileInRef } = require(
  path.join(__dirname, '..', '..', 'scripts', 'lib', 'git.cjs'),
);

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

  const root = path.resolve(ctx.projectDir ?? projectDir(input));
  const rel = path.relative(root, path.resolve(root, target));
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) return ALLOW;
  const parts = rel.split(path.sep);
  const posix = parts.join('/');
  const name = parts[parts.length - 1];

  if (parts[0] === 'docs' && parts[1] === 'spec') {
    return deny(
      `차단: ${posix} — 명세 사본(docs/spec)은 노션에서만 갱신합니다. 이 저장소에서 직접 고치지 마세요.`,
    );
  }
  if (/^\.env(\..+)?$/.test(name) && name !== '.env.example') {
    return deny(
      `차단: ${posix} — .env 파일은 편집할 수 없습니다 (.env.example 만 허용).`,
    );
  }
  if (
    posix === '.claude/settings.json' ||
    posix === '.claude/settings.local.json' ||
    posix === 'scripts/check-test-integrity.cjs' ||
    (parts[0] === 'scripts' && parts[1] === 'lib') ||
    (parts[0] === '.claude' && parts[1] === 'hooks')
  ) {
    return deny(
      `차단: ${posix} — 루프가 자기 검증 장치(훅·설정·게이트 로직)를 바꾸지 못하게 막습니다.`,
    );
  }
  if (
    parts.length === 2 &&
    parts[0] === 'migrations' &&
    name.endsWith('.sql')
  ) {
    const base = ctx.base === undefined ? defaultBase(root) : ctx.base;
    if (base === 'origin/main') {
      const inBase = ctx.fileInBase
        ? ctx.fileInBase(posix)
        : fileInRef(base, posix, root);
      if (inBase) {
        return deny(
          `차단: ${posix} — 병합된 마이그레이션은 수정하지 말고 새 번호로 추가하세요.`,
        );
      }
    }
  }
  return ALLOW;
}

module.exports = { decide };

if (require.main === module) void runHook('pre-edit-guard', decide);
