import { execFileSync, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const CLI = path.resolve(__dirname, '../../scripts/check-test-integrity.cjs');

function git(cwd: string, ...args: string[]): void {
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], {
    cwd,
    stdio: 'ignore',
  });
}
function cli(cwd: string, ...args: string[]): number | null {
  return spawnSync('node', [CLI, ...args], { cwd }).status;
}
function write(cwd: string, file: string, text: string): void {
  fs.mkdirSync(path.dirname(path.join(cwd, file)), { recursive: true });
  fs.writeFileSync(path.join(cwd, file), text);
}

describe('check-test-integrity CLI', () => {
  const dirs: string[] = [];
  const repo = (): string => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'cti-'));
    dirs.push(d);
    git(d, 'init', '-b', 'main');
    return d;
  };
  afterAll(() => {
    for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
  });

  it('한글 파일명 테스트 삭제를 감지한다', () => {
    const d = repo();
    write(d, 'src/한글.spec.ts', "it('a', () => {});\n");
    git(d, 'add', '.');
    git(d, 'commit', '-m', 'c');
    expect(cli(d)).toBe(0);
    fs.rmSync(path.join(d, 'src/한글.spec.ts'));
    expect(cli(d)).toBe(1);
  });

  it('한글 파일명 spec 에 추가된 skip 을 감지한다', () => {
    const d = repo();
    write(d, 'src/한글.spec.ts', "it('a', () => {});\n");
    git(d, 'add', '.');
    git(d, 'commit', '-m', 'c');
    write(
      d,
      'src/한글.spec.ts',
      ['it', '.skip(', "'a', () => {});\n"].join(''),
    );
    expect(cli(d)).toBe(1);
  });

  it('추적 안 된 한글 spec 의 skip 도 감지한다', () => {
    const d = repo();
    write(d, 'a.txt', 'x');
    git(d, 'add', '.');
    git(d, 'commit', '-m', 'c');
    write(d, 'src/신규.spec.ts', ['x', "it('a', () => {});\n"].join(''));
    expect(cli(d)).toBe(1);
  });

  it('앞서간 origin/main 의 새 테스트를 삭제로 오탐하지 않는다', () => {
    const d = repo();
    write(d, 'a.txt', 'x');
    git(d, 'add', '.');
    git(d, 'commit', '-m', 'base');
    const remote = fs.mkdtempSync(path.join(os.tmpdir(), 'cti-remote-'));
    dirs.push(remote);
    git(remote, 'init', '--bare', '-b', 'main');
    git(d, 'remote', 'add', 'origin', remote);
    git(d, 'push', '-u', 'origin', 'main');
    git(d, 'checkout', '-b', 'feature');
    // main 을 앞으로 진행시킨다.
    git(d, 'checkout', 'main');
    write(d, 'src/new.spec.ts', "it('a', () => {});\n");
    git(d, 'add', '.');
    git(d, 'commit', '-m', 'main adv');
    git(d, 'push', 'origin', 'main');
    git(d, 'checkout', 'feature');
    expect(cli(d)).toBe(0);
    expect(cli(d, '--base', 'origin/main')).toBe(0);
  });
});
