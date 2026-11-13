import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  processFile,
  targetsFor,
} from '../../.claude/hooks/post-edit-format.cjs';

describe('post-edit-format', () => {
  let dir: string;
  const touch = (rel: string) => {
    const f = path.join(dir, rel);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, 'x');
    return f;
  };
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'post-format-'));
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('확장자별 대상을 정한다', () => {
    touch('src/a.ts');
    touch('README.md');
    touch('a.json');
    touch('.claude/hooks/x.cjs');
    expect(targetsFor(`${dir}/src/a.ts`, dir)).toEqual({
      eslint: true,
      prettier: true,
    });
    expect(targetsFor(`${dir}/README.md`, dir)).toEqual({
      eslint: false,
      prettier: true,
    });
    expect(targetsFor(`${dir}/a.json`, dir)).toEqual({
      eslint: false,
      prettier: true,
    });
    expect(targetsFor(`${dir}/.claude/hooks/x.cjs`, dir)).toEqual({
      eslint: true,
      prettier: true,
    });
  });

  it('제외 경로·프로젝트 밖·없는 파일·미지원 확장자는 null', () => {
    touch('docs/spec/01-api.md');
    touch('node_modules/x/a.ts');
    touch('dist/a.js');
    touch('img.png');
    expect(targetsFor(`${dir}/docs/spec/01-api.md`, dir)).toBeNull();
    expect(targetsFor(`${dir}/node_modules/x/a.ts`, dir)).toBeNull();
    expect(targetsFor(`${dir}/dist/a.js`, dir)).toBeNull();
    expect(targetsFor(`${dir}/img.png`, dir)).toBeNull();
    expect(targetsFor(`${dir}/src/none.ts`, dir)).toBeNull();
    expect(targetsFor('/etc/hosts', dir)).toBeNull();
    expect(targetsFor(`${dir}/../outside.ts`, dir)).toBeNull();
  });

  it('공백·한글 경로도 대상으로 인식한다', () => {
    touch('src/할 일/a b.ts');
    expect(targetsFor(`${dir}/src/할 일/a b.ts`, dir)).toEqual({
      eslint: true,
      prettier: true,
    });
  });

  it('eslint --fix 후 prettier --write 를 인자 배열로 실행한다', () => {
    const f = touch('src/할 일/a b.ts');
    const calls: Array<{ args: string[]; cwd: string }> = [];
    const r = processFile(f, dir, (args, cwd) => {
      calls.push({ args, cwd });
      return { status: 0, output: '' };
    });
    expect(r).toEqual({ ok: true });
    expect(calls).toEqual([
      { args: ['eslint', '--fix', '--', f], cwd: dir },
      { args: ['prettier', '--write', '--', f], cwd: dir },
    ]);
  });

  it('eslint 오류가 남으면 마지막 40줄로 실패를 알리고 prettier 는 그래도 실행한다', () => {
    const f = touch('src/a.ts');
    const out = Array.from({ length: 100 }, (_, i) => `err${i}`).join('\n');
    const seen: string[] = [];
    const r = processFile(f, dir, (args) => {
      seen.push(args[0]);
      return args[0] === 'eslint'
        ? { status: 1, output: out }
        : { status: 0, output: '' };
    });
    expect(r.ok).toBe(false);
    const msg = (r as { ok: false; message: string }).message;
    expect(msg).toContain('err99');
    expect(msg).toContain('err60');
    expect(msg).not.toContain('err59\n');
    expect(seen).toEqual(['eslint', 'prettier']);
  });

  it('prettier 만 대상이면 eslint 를 부르지 않는다', () => {
    const f = touch('README.md');
    const seen: string[] = [];
    processFile(f, dir, (args) => {
      seen.push(args[0]);
      return { status: 0, output: '' };
    });
    expect(seen).toEqual(['prettier']);
  });

  it('대상이 아니면 아무것도 실행하지 않는다', () => {
    const seen: string[] = [];
    const r = processFile(`${dir}/none.ts`, dir, (args) => {
      seen.push(args[0]);
      return { status: 0, output: '' };
    });
    expect(r).toEqual({ ok: true });
    expect(seen).toEqual([]);
  });

  it('기본 실행기는 npx --no-install 로 로컬 도구만 쓴다', () => {
    const bin = path.join(dir, 'bin');
    const log = path.join(dir, 'calls.log');
    fs.mkdirSync(bin);
    fs.writeFileSync(
      path.join(bin, 'npx'),
      `#!/bin/sh\necho "$@" >> '${log}'\n`,
      { mode: 0o755 },
    );
    const f = touch('src/a.ts');
    const hook = path.resolve(
      __dirname,
      '../../.claude/hooks/post-edit-format.cjs',
    );
    const res = spawnSync('node', [hook], {
      input: JSON.stringify({
        tool_name: 'Edit',
        tool_input: { file_path: f },
      }),
      encoding: 'utf8',
      env: {
        ...process.env,
        CLAUDE_PROJECT_DIR: dir,
        PATH: `${bin}${path.delimiter}${process.env.PATH ?? ''}`,
      },
    });
    expect(res.status).toBe(0);
    const logged = fs.readFileSync(log, 'utf8').trim().split('\n');
    expect(logged).toHaveLength(2);
    for (const c of logged) expect(c.startsWith('--no-install ')).toBe(true);
  });
});
