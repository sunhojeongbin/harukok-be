'use strict';

/** 테스트 약화 감지(G6): 테스트 삭제와 skip/only 패턴 추가를 찾는다. */

const TEST_FILE = /\.(?:e2e-)?spec\.ts$/;
const FORBIDDEN =
  /\b(?:(?:it|describe|test)\.(?:skip|only)|x(?:it|describe|test)|f(?:it|describe))(?:\.each)?\s*[(`]/;

function isTestFile(path) {
  return TEST_FILE.test(path);
}

function findViolations({ deleted, added }) {
  const violations = [];
  for (const file of deleted) {
    if (isTestFile(file)) violations.push(`테스트 파일 삭제: ${file}`);
  }
  for (const { file, line } of added) {
    if (isTestFile(file) && FORBIDDEN.test(line)) {
      violations.push(`금지 패턴 추가: ${file}: ${line.trim()}`);
    }
  }
  return violations;
}

module.exports = { isTestFile, findViolations };
