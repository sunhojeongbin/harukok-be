'use strict';

const { spawnSync } = require('node:child_process');

/** git 을 셸 없이 실행한다. */
function run(args, cwd) {
  return spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
}

/** ref 가 커밋으로 해석되는지 확인한다. */
function refExists(ref, cwd) {
  return (
    run(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], cwd).status ===
    0
  );
}

/** ref 시점의 커밋에 해당 경로의 파일이 있는지 확인한다. */
function fileInRef(ref, path, cwd) {
  return run(['cat-file', '-e', `${ref}:${path}`], cwd).status === 0;
}

/** 기본 비교 기준: origin/main → HEAD → null(커밋 없음). */
function defaultBase(cwd) {
  if (refExists('origin/main', cwd)) return 'origin/main';
  if (refExists('HEAD', cwd)) return 'HEAD';
  return null;
}

module.exports = { run, refExists, fileInRef, defaultBase };
