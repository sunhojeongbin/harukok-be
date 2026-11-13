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
function cliFull(
  cwd: string,
  env: Record<string, string> = {},
  ...args: string[]
) {
  const r = spawnSync('node', [CLI, ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, GITHUB_STEP_SUMMARY: '', ...env },
  });
  return { status: r.status, stderr: r.stderr };
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

  describe('게이트 설정 변경 경고', () => {
    const WARN = '게이트 설정 변경 — 사람 확인 필요';
    const pkg = (scripts: Record<string, string>, extra = {}) =>
      JSON.stringify({ name: 'x', scripts, ...extra }, null, 2) + '\n';
    const base = (): string => {
      const d = repo();
      write(d, 'package.json', pkg({ lint: 'eslint .', build: 'nest build' }));
      write(d, 'eslint.config.mjs', 'export default [];\n');
      write(d, 'tsconfig.json', '{}\n');
      write(d, 'src/a.ts', 'export {};\n');
      git(d, 'add', '.');
      git(d, 'commit', '-m', 'c');
      return d;
    };

    it('변경이 없으면 경고가 없다', () => {
      const r = cliFull(base());
      expect(r.status).toBe(0);
      expect(r.stderr).not.toContain(WARN);
    });
    it('package.json 의 게이트 스크립트가 바뀌면 경고하되 exit 0', () => {
      const d = base();
      write(d, 'package.json', pkg({ lint: 'true', build: 'nest build' }));
      const r = cliFull(d);
      expect(r.status).toBe(0);
      expect(r.stderr).toContain(`${WARN}: package.json`);
    });
    it('package.json 의 게이트 스크립트 추가·삭제도 경고한다', () => {
      const d = base();
      write(
        d,
        'package.json',
        pkg({ build: 'nest build', 'verify:fast': 'true' }),
      );
      expect(cliFull(d).stderr).toContain(`${WARN}: package.json`);
    });
    it('package.json 의 무관한 변경은 경고하지 않는다', () => {
      const d = base();
      write(
        d,
        'package.json',
        pkg({ lint: 'eslint .', build: 'nest build -b swc' }, { version: '2' }),
      );
      expect(cliFull(d).stderr).not.toContain(WARN);
    });
    it('설정 파일이 바뀌면 파일별로 경고한다', () => {
      const d = base();
      write(d, 'eslint.config.mjs', 'export default [{}];\n');
      write(d, 'tsconfig.json', '{"a":1}\n');
      const r = cliFull(d);
      expect(r.status).toBe(0);
      expect(r.stderr).toContain(`${WARN}: eslint.config.mjs`);
      expect(r.stderr).toContain(`${WARN}: tsconfig.json`);
    });
    it('새로 추가된 설정 파일(jest.config.js)도 경고한다', () => {
      const d = base();
      write(d, 'jest.config.js', 'module.exports = {};\n');
      git(d, 'add', 'jest.config.js');
      expect(cliFull(d).stderr).toContain(`${WARN}: jest.config.js`);
    });
    it('GITHUB_STEP_SUMMARY 가 있으면 요약에도 기록한다', () => {
      const d = base();
      write(d, 'eslint.config.mjs', 'export default [{}];\n');
      const summary = path.join(d, '..', `summary-${path.basename(d)}.md`);
      cliFull(d, { GITHUB_STEP_SUMMARY: summary });
      expect(fs.readFileSync(summary, 'utf8')).toContain('eslint.config.mjs');
      fs.rmSync(summary, { force: true });
    });
  });

  it('사용자 git 설정(noprefix·color·ext-diff)이 있어도 감지한다', () => {
    const d = repo();
    write(d, 'src/a.spec.ts', "it('a', () => {});\n");
    git(d, 'add', '.');
    git(d, 'commit', '-m', 'c');
    git(d, 'config', 'diff.noprefix', 'true');
    git(d, 'config', 'color.diff', 'always');
    git(d, 'config', 'color.ui', 'always');
    write(d, 'src/a.spec.ts', ['it', '.skip(', "'a', () => {});\n"].join(''));
    expect(cli(d)).toBe(1);
  });
});
