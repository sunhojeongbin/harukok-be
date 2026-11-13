import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { defaultBase, fileInRef, refExists } from '../../scripts/lib/git.cjs';

function git(cwd: string, ...args: string[]): string {
  return execFileSync(
    'git',
    ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args],
    { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );
}

describe('git 헬퍼', () => {
  const dirs: string[] = [];
  const mk = (): string => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'git-spec-'));
    dirs.push(d);
    return d;
  };
  const initRepo = (): string => {
    const d = mk();
    git(d, 'init', '-b', 'main');
    return d;
  };
  const commit = (d: string, file = 'a.txt'): void => {
    fs.writeFileSync(path.join(d, file), 'x');
    git(d, 'add', '.');
    git(d, 'commit', '-m', 'c');
  };

  afterAll(() => {
    for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
  });

  it('커밋이 없으면 defaultBase 는 null', () => {
    expect(defaultBase(initRepo())).toBeNull();
  });

  it('커밋이 있으면 defaultBase 는 HEAD', () => {
    const d = initRepo();
    commit(d);
    expect(defaultBase(d)).toBe('HEAD');
  });

  it('origin/main 이 있으면 defaultBase 는 origin/main', () => {
    const d = initRepo();
    commit(d);
    const remote = mk();
    git(remote, 'init', '--bare', '-b', 'main');
    git(d, 'remote', 'add', 'origin', remote);
    git(d, 'push', '-q', '-u', 'origin', 'main');
    expect(defaultBase(d)).toBe('origin/main');
  });

  it('refExists / fileInRef', () => {
    const d = initRepo();
    expect(refExists('HEAD', d)).toBe(false);
    commit(d);
    expect(refExists('HEAD', d)).toBe(true);
    expect(refExists('nope', d)).toBe(false);
    expect(fileInRef('HEAD', 'a.txt', d)).toBe(true);
    expect(fileInRef('HEAD', 'b.txt', d)).toBe(false);
  });
});
