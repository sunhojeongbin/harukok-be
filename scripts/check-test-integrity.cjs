'use strict';

/**
 * 테스트 약화 감지 CLI.
 * 사용법: node scripts/check-test-integrity.cjs [--base <ref>]
 * 비교 범위: <base> 대비 작업 트리 + 추적 안 된 테스트 파일. base 가 없으면(커밋 없음) 추적 안 된 파일만 검사.
 */

const fs = require('node:fs');
const path = require('node:path');
const { run, defaultBase, refExists } = require('./lib/git.cjs');
const { isTestFile, findViolations } = require('./lib/test-integrity.cjs');

function parseBase(argv) {
  const i = argv.indexOf('--base');
  return i >= 0 ? argv[i + 1] : undefined;
}

function fail(msg) {
  console.error(msg);
  process.exit(2);
}

function collect(cwd, base) {
  const deleted = [];
  const added = [];

  if (base !== null) {
    const status = run(
      ['diff', '--unified=0', '--name-status', '--no-renames', base],
      cwd,
    );
    if (status.status !== 0) fail(`git diff 실패: ${status.stderr}`);
    for (const row of status.stdout.split('\n')) {
      const [code, ...rest] = row.split('\t');
      if (code === 'D') deleted.push(rest.join('\t'));
    }

    const diff = run(['diff', '--unified=0', '--no-renames', base], cwd);
    if (diff.status !== 0) fail(`git diff 실패: ${diff.stderr}`);
    let file = null;
    for (const row of diff.stdout.split('\n')) {
      if (row.startsWith('+++ ')) {
        file = row === '+++ /dev/null' ? null : row.slice(6);
      } else if (row.startsWith('+') && file) {
        added.push({ file, line: row.slice(1) });
      }
    }
  }

  const untracked = run(
    ['ls-files', '--others', '--exclude-standard', '-z'],
    cwd,
  );
  if (untracked.status !== 0) fail(`git ls-files 실패: ${untracked.stderr}`);
  for (const file of untracked.stdout.split('\0').filter(Boolean)) {
    if (!isTestFile(file)) continue;
    const text = fs.readFileSync(path.join(cwd, file), 'utf8');
    for (const line of text.split('\n')) added.push({ file, line });
  }

  return { deleted, added };
}

function main() {
  const cwd = process.cwd();
  const arg = parseBase(process.argv.slice(2));
  if (process.argv.includes('--base') && !arg)
    fail('--base 에 ref 가 필요합니다');
  if (arg !== undefined && !refExists(arg, cwd))
    fail(`base ref 를 찾을 수 없습니다: ${arg}`);
  const base = arg !== undefined ? arg : defaultBase(cwd);

  const violations = findViolations(collect(cwd, base));
  if (violations.length > 0) {
    console.error('테스트 약화 감지(G6) 위반:');
    for (const v of violations) console.error(`  - ${v}`);
    process.exit(1);
  }
}

main();
