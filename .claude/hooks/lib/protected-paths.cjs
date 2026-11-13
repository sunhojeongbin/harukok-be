'use strict';
// 보호 경로 판정. 편집 가드(pre-edit-guard)와 Bash 쓰기 가드(pre-bash-guard)가 함께 쓴다.
// 비교는 항상 소문자로 한다 (macOS 기본 파일시스템은 대소문자를 구분하지 않아 Docs/Spec 으로 우회 가능).

const path = require('node:path');
const { defaultBase, fileInRef } = require(
  path.join(__dirname, '..', '..', '..', 'scripts', 'lib', 'git.cjs'),
);

/**
 * target(절대 또는 프로젝트 기준 상대 경로)이 보호 대상이면 차단 사유 문자열, 아니면 null.
 * ctx = { projectDir, base?, fileInBase?(relPath) } — base 가 undefined 면 defaultBase() 를 쓴다.
 */
function protectedReason(target, ctx) {
  if (typeof target !== 'string' || target === '') return null;
  const root = path.resolve(ctx.projectDir);
  const rel = path.relative(root, path.resolve(root, target));
  if (rel === '' || rel === '..' || rel.startsWith(`..${path.sep}`)) {
    return null;
  }
  if (path.isAbsolute(rel)) return null;
  const parts = rel.split(path.sep);
  const lower = parts.map((p) => p.toLowerCase());
  const posix = parts.join('/');
  const lposix = lower.join('/');
  const name = lower[lower.length - 1];

  if (lower[0] === 'docs' && lower[1] === 'spec') {
    return `차단: ${posix} — 명세 사본(docs/spec)은 노션에서만 갱신합니다. 이 저장소에서 직접 고치지 마세요.`;
  }
  if (/^\.env(\..+)?$/.test(name) && name !== '.env.example') {
    return `차단: ${posix} — .env 파일은 편집할 수 없습니다 (.env.example 만 허용).`;
  }
  if (lower[0] === '.claude' && lower[1] === 'state') {
    return `차단: ${posix} — 루프가 재시도 횟수·STUCK 기록을 조작하지 못하게 막습니다.`;
  }
  if (lower[0] === '.github' && lower[1] === 'workflows') {
    return `차단: ${posix} — CI 워크플로(게이트)를 루프가 바꾸지 못하게 막습니다.`;
  }
  if (
    lposix === '.claude/settings.json' ||
    lposix === '.claude/settings.local.json' ||
    lposix === 'scripts/check-test-integrity.cjs' ||
    (lower[0] === 'scripts' && lower[1] === 'lib') ||
    (lower[0] === '.claude' && lower[1] === 'hooks')
  ) {
    return `차단: ${posix} — 루프가 자기 검증 장치(훅·설정·게이트 로직)를 바꾸지 못하게 막습니다.`;
  }
  if (
    parts.length === 2 &&
    lower[0] === 'migrations' &&
    name.endsWith('.sql')
  ) {
    const base = ctx.base === undefined ? defaultBase(root) : ctx.base;
    if (base === 'origin/main') {
      const inBase = ctx.fileInBase
        ? ctx.fileInBase(posix)
        : fileInRef(base, posix, root);
      if (inBase) {
        return `차단: ${posix} — 병합된 마이그레이션은 수정하지 말고 새 번호로 추가하세요.`;
      }
    }
  }
  return null;
}

const isProtectedPath = (target, ctx) => protectedReason(target, ctx) !== null;

module.exports = { protectedReason, isProtectedPath };
