import { spawnSync } from 'node:child_process';
import * as path from 'node:path';
import { decide } from '../../.claude/hooks/pre-edit-guard.cjs';

const dir = path.join('/tmp', 'harukok-proj');
const hook = path.join(
  __dirname,
  '..',
  '..',
  '.claude',
  'hooks',
  'pre-edit-guard.cjs',
);

interface Opts {
  base?: string | null;
  inBase?: boolean;
}

function run(toolInput: Record<string, unknown>, opts: Opts = {}) {
  return decide(
    { tool_name: 'Edit', tool_input: toolInput },
    {
      projectDir: dir,
      base: opts.base === undefined ? 'HEAD' : opts.base,
      fileInBase: () => opts.inBase ?? false,
    },
  );
}
const expectBlocked = (ti: Record<string, unknown>, o?: Opts) =>
  expect(run(ti, o).allow).toBe(false);
const expectAllowed = (ti: Record<string, unknown>, o?: Opts) =>
  expect(run(ti, o).allow).toBe(true);

describe('pre-edit-guard decide', () => {
  it('명세 사본 편집을 차단하고 사유를 준다', () => {
    const r = run({ file_path: `${dir}/docs/spec/01-api.md` });
    expect(r.allow).toBe(false);
    expect('reason' in r && r.reason).toContain('노션');
  });
  it('루프가 훅을 끄거나 게이트 로직을 고치지 못하게 보호한다', () => {
    expectBlocked({ file_path: `${dir}/.claude/settings.local.json` });
    expectBlocked({ file_path: `${dir}/scripts/lib/git.cjs` });
    expectBlocked({ file_path: `${dir}/scripts/lib/sub/x.cjs` });
    expectBlocked({ file_path: `${dir}/scripts/check-test-integrity.cjs` });
    expectAllowed({ file_path: `${dir}/scripts/db-migrate.cjs` });
    expectAllowed({ file_path: `${dir}/scripts/db-setup.cjs` });
  });
  it('.env 계열은 차단, .env.example 은 허용', () => {
    expectBlocked({ file_path: `${dir}/.env` });
    expectBlocked({ file_path: `${dir}/.env.local` });
    expectAllowed({ file_path: `${dir}/.env.example` });
  });
  it('훅·설정 파일 편집을 차단한다 (.. 우회 포함)', () => {
    expectBlocked({ file_path: `${dir}/.claude/hooks/stop-verify.cjs` });
    expectBlocked({ file_path: `${dir}/.claude/settings.json` });
    expectBlocked({ file_path: `${dir}/src/../.claude/hooks/x.cjs` });
    expectBlocked({ file_path: '.claude/settings.json' });
  });
  it('병합된 마이그레이션만 차단한다', () => {
    const f = `${dir}/migrations/20261110_001__init_schema.sql`;
    expectBlocked({ file_path: f }, { base: 'origin/main', inBase: true });
    expectAllowed({ file_path: f }, { base: 'HEAD', inBase: true });
    expectAllowed({ file_path: f }, { base: null, inBase: true });
    expectAllowed(
      { file_path: `${dir}/migrations/20261201_006__x.sql` },
      { base: 'origin/main', inBase: false },
    );
  });
  it('공백·한글·상대 경로와 프로젝트 밖 경로를 처리한다', () => {
    expectAllowed({ file_path: `${dir}/src/modules/할 일/todo.ts` });
    expectAllowed({ file_path: 'src/app.module.ts' });
    expectAllowed({ file_path: '/etc/hosts' });
  });
  it('편집 도구가 아니거나 경로가 없으면 허용한다', () => {
    expect(
      decide(
        { tool_name: 'Read', tool_input: { file_path: `${dir}/.env` } },
        { projectDir: dir },
      ).allow,
    ).toBe(true);
    expect(
      decide({ tool_name: 'Edit', tool_input: {} }, { projectDir: dir }).allow,
    ).toBe(true);
  });
});

describe('pre-edit-guard 실행', () => {
  const spawn = (input: string) =>
    spawnSync('node', [hook], {
      input,
      encoding: 'utf8',
      env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
    });

  it('차단 시 exit 2 와 stderr 사유', () => {
    const r = spawn(
      JSON.stringify({
        tool_name: 'Write',
        tool_input: { file_path: `${dir}/.env` },
      }),
    );
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('.env');
  });
  it('허용 시 exit 0', () => {
    const r = spawn(
      JSON.stringify({
        tool_name: 'Edit',
        tool_input: { file_path: `${dir}/src/a.ts` },
      }),
    );
    expect(r.status).toBe(0);
  });
  it('파싱 불가 입력은 스택 트레이스 없이 exit 2', () => {
    const r = spawn('not json');
    expect(r.status).toBe(2);
    expect(r.stderr).not.toMatch(/\n\s+at \S/);
  });
});
