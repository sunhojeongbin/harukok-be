'use strict';

/**
 * 테스트 약화 감지 CLI.
 * 사용법: node scripts/check-test-integrity.cjs [--base <ref>]
 * 비교 범위: <base> 대비 작업 트리 + 추적 안 된 테스트 파일. base 가 없으면(커밋 없음) 추적 안 된 파일만 검사.
 */

const fs = require('node:fs');
const path = require('node:path');
const {
  DIFF_FLAGS,
  run,
  defaultBase,
  refExists,
  mergeBase,
} = require('./lib/git.cjs');
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
      [
        'diff',
        ...DIFF_FLAGS,
        '--unified=0',
        '--name-status',
        '--no-renames',
        base,
      ],
      cwd,
    );
    if (status.status !== 0) fail(`git diff 실패: ${status.stderr}`);
    for (const row of status.stdout.split('\n')) {
      const [code, ...rest] = row.split('\t');
      if (code === 'D') deleted.push(rest.join('\t'));
    }

    const diff = run(
      ['diff', ...DIFF_FLAGS, '--unified=0', '--no-renames', base],
      cwd,
    );
    if (diff.status !== 0) fail(`git diff 실패: ${diff.stderr}`);
    let file = null;
    for (const row of diff.stdout.split('\n')) {
      if (row.startsWith('+++ ')) {
        file =
          row === '+++ /dev/null' ? null : row.slice(6).replace(/\t.*$/, '');
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

const GATE_FILES = [
  'jest.config.js',
  'test/jest-e2e.json',
  'eslint.config.mjs',
  'tsconfig.json',
  'tsconfig.build.json',
  '.prettierrc',
  '.prettierignore',
];
const GATE_SCRIPT = /^(lint|format|typecheck|test|verify|db:check)/;

function gateScripts(text) {
  try {
    const scripts = JSON.parse(text).scripts ?? {};
    return Object.fromEntries(
      Object.entries(scripts).filter(([k]) => GATE_SCRIPT.test(k)),
    );
  } catch {
    return null;
  }
}

/** base 대비 게이트 설정이 바뀐 파일 목록 (경고용, 판정에는 쓰지 않는다). */
function changedGateFiles(cwd, base) {
  const changed = new Set();
  if (base !== null) {
    const names = run(
      ['diff', ...DIFF_FLAGS, '--name-only', '--no-renames', '-z', base],
      cwd,
    );
    if (names.status === 0) {
      for (const f of names.stdout.split('\0').filter(Boolean)) {
        if (GATE_FILES.includes(f)) changed.add(f);
      }
    }
    const before = run(['show', `${base}:package.json`], cwd);
    let nowText = null;
    try {
      nowText = fs.readFileSync(path.join(cwd, 'package.json'), 'utf8');
    } catch {
      // package.json 이 없으면 비교하지 않는다
    }
    if (before.status === 0 && nowText !== null) {
      const a = gateScripts(before.stdout);
      const b = gateScripts(nowText);
      if (a && b && JSON.stringify(sorted(a)) !== JSON.stringify(sorted(b))) {
        changed.add('package.json');
      }
    }
  }
  const untracked = run(
    ['ls-files', '--others', '--exclude-standard', '-z'],
    cwd,
  );
  if (untracked.status === 0) {
    for (const f of untracked.stdout.split('\0').filter(Boolean)) {
      if (GATE_FILES.includes(f)) changed.add(f);
    }
  }
  return [...changed].sort();
}

const sorted = (o) => Object.entries(o).sort(([x], [y]) => (x < y ? -1 : 1));

function warnGateChanges(files) {
  if (files.length === 0) return;
  const lines = files.map((f) => `게이트 설정 변경 — 사람 확인 필요: ${f}`);
  for (const l of lines) console.error(l);
  const summary = process.env.GITHUB_STEP_SUMMARY;
  if (summary) {
    try {
      fs.appendFileSync(
        summary,
        `### 게이트 설정 변경 (사람 확인 필요)\n\n${files.map((f) => `- \`${f}\``).join('\n')}\n\nPR 본문에 변경 이유가 있는지 확인하세요.\n`,
      );
    } catch {
      // 요약 기록 실패는 검사 결과에 영향을 주지 않는다
    }
  }
}

function main() {
  const cwd = process.cwd();
  const arg = parseBase(process.argv.slice(2));
  if (process.argv.includes('--base') && !arg)
    fail('--base 에 ref 가 필요합니다');
  if (arg !== undefined && !refExists(arg, cwd))
    fail(`base ref 를 찾을 수 없습니다: ${arg}`);
  const picked = arg !== undefined ? arg : defaultBase(cwd);
  // 뒤처진 브랜치가 앞선 base 의 새 테스트를 '삭제'로 오탐하지 않도록 공통 조상과 비교한다.
  const base =
    picked !== null && picked !== 'HEAD' ? mergeBase(picked, cwd) : picked;

  warnGateChanges(changedGateFiles(cwd, base));

  const violations = findViolations(collect(cwd, base));
  if (violations.length > 0) {
    console.error('테스트 약화 감지(G6) 위반:');
    for (const v of violations) console.error(`  - ${v}`);
    process.exit(1);
  }
}

main();
