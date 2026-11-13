'use strict';
// PostToolUse(Edit|Write|MultiEdit): 수정한 파일에 eslint --fix, prettier --write 를 적용한다.
// eslint 가 고치지 못한 오류가 남으면 exit 2 로 Claude 에게 되돌려 준다.

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { projectDir, runHook } = require('./lib/hook-io.cjs');

const ESLINT_EXT = ['.ts', '.js', '.cjs', '.mjs'];
const PRETTIER_EXT = [...ESLINT_EXT, '.json', '.md', '.yml', '.yaml'];
const SKIP_TOP = ['node_modules', 'dist'];
const EDIT_TOOLS = ['Edit', 'Write', 'MultiEdit'];
const TAIL_LINES = 40;

/** 포맷 대상이 아니면 null, 대상이면 { eslint, prettier }. */
function targetsFor(filePath, root) {
  if (typeof filePath !== 'string' || filePath === '') return null;
  const base = path.resolve(root);
  const abs = path.resolve(base, filePath);
  const rel = path.relative(base, abs);
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) return null;
  const parts = rel.split(path.sep);
  if (parts.includes('node_modules') || SKIP_TOP.includes(parts[0])) {
    return null;
  }
  if (parts[0] === 'docs' && parts[1] === 'spec') return null;
  try {
    if (!fs.statSync(abs).isFile()) return null;
  } catch {
    return null;
  }
  const ext = path.extname(abs);
  if (!PRETTIER_EXT.includes(ext)) return null;
  return { eslint: ESLINT_EXT.includes(ext), prettier: true };
}

/** npx <args> 를 셸 없이 실행한다. */
function defaultRunner(args, cwd) {
  const r = spawnSync('npx', args, { cwd, encoding: 'utf8' });
  return {
    status: r.status,
    output: `${r.stdout ?? ''}${r.stderr ?? ''}${r.error ? r.error.message : ''}`,
  };
}

const tail = (text, n) => text.trimEnd().split('\n').slice(-n).join('\n');

/** runner(args, cwd) => { status, output }. 반환: { ok: true } | { ok: false, message }. */
function processFile(filePath, root, runner = defaultRunner) {
  const targets = targetsFor(filePath, root);
  if (!targets) return { ok: true };
  const abs = path.resolve(root, filePath);
  const problems = [];
  if (targets.eslint) {
    const r = runner(['eslint', '--fix', '--', abs], root);
    if (r.status !== 0) problems.push(['eslint', r.output]);
  }
  const p = runner(['prettier', '--write', '--', abs], root);
  if (p.status !== 0) problems.push(['prettier', p.output]);
  if (problems.length === 0) return { ok: true };
  const body = problems
    .map(([tool, out]) => `[${tool}]\n${tail(out, TAIL_LINES)}`)
    .join('\n');
  return {
    ok: false,
    message: `${path.relative(root, abs)} 에 자동으로 못 고친 오류가 남았습니다. 고친 뒤 계속하세요.\n${body}`,
  };
}

function decide(input) {
  if (input.tool_name && !EDIT_TOOLS.includes(input.tool_name)) {
    return { allow: true };
  }
  const target = input.tool_input?.file_path;
  if (typeof target !== 'string' || target === '') return { allow: true };
  const r = processFile(target, projectDir(input));
  return r.ok ? { allow: true } : { allow: false, reason: r.message };
}

module.exports = { targetsFor, processFile, decide };

if (require.main === module) void runHook('post-edit-format', decide);
