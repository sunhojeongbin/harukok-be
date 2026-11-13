import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { decide } from '../../.claude/hooks/pre-bash-guard.cjs';

const dir = '/tmp/harukok-proj';
const hook = path.join(
  __dirname,
  '..',
  '..',
  '.claude',
  'hooks',
  'pre-bash-guard.cjs',
);

const run = (command: string) =>
  decide(
    { tool_name: 'Bash', tool_input: { command } },
    { projectDir: dir, home: '/home/u' },
  );
const expectBlocked = (c: string) => expect(run(c).allow).toBe(false);
const expectAllowed = (c: string) => expect(run(c).allow).toBe(true);

describe('pre-bash-guard decide', () => {
  it.each([
    'git push --force',
    'git push -f origin main',
    'git push origin main --force-with-lease',
    'git push origin +main',
    'git -C . push -f',
    'git reset --hard HEAD~1',
    'git clean -fd',
    'cd src && rm -rf /',
    'rm -rf ~',
    'rm -fr ..',
    'rm -rf /tmp/other',
    `rm -rf ${dir}`,
    'rm -rf .git',
    'rm --recursive --force /*',
    'rm -rf $HOME',
    'true; dropdb harukok_dev',
    'createdb harukok_dev',
    'psql -c "DROP DATABASE harukok_dev"',
    'psql -h db.example.com -d harukok_dev',
    'psql -hdb.example.com harukok_dev',
    'psql postgresql://u@10.0.0.5/harukok_test',
    'psql "host=db.example.com dbname=x"',
    'PGHOST=db.example.com psql -d x',
    'echo hi | bash -c "git push -f"',
    'cat .env',
    'grep KEY .env.local',
    'source ./.env',
    'cat < .env',
  ])('차단: %s', (c) => expectBlocked(c));

  it.each([
    'npm run verify',
    'git push -u origin feat/todos',
    'git push --set-upstream origin x',
    'rm -rf dist',
    'rm -rf node_modules/.cache',
    `rm -rf ${dir}/dist`,
    'rm file.txt',
    'dropdb harukok_check',
    'createdb harukok_check',
    'psql -h localhost -d harukok_dev -c "select 1"',
    'psql postgresql://u@127.0.0.1/harukok_dev',
    'cat .env.example',
    'git commit -m "fix: rm -rf 문구가 들어간 메시지"',
    'echo "a && rm -rf /"',
  ])('허용: %s', (c) => expectAllowed(c));

  it('Bash 가 아닌 도구나 빈 명령은 허용한다', () => {
    expect(
      decide({ tool_name: 'Read', tool_input: {} }, { projectDir: dir }).allow,
    ).toBe(true);
    expect(
      decide({ tool_name: 'Bash', tool_input: {} }, { projectDir: dir }).allow,
    ).toBe(true);
  });
});

describe('pre-bash-guard DB 가드 (플래그·stdin SQL)', () => {
  it.each([
    'dropdb -e harukok_dev',
    'createdb -e myother',
    'psql -e -c "DROP DATABASE harukok_dev"',
    'psql -l -c "DROP DATABASE harukok_dev"',
    'echo "DROP DATABASE harukok_dev" | psql',
    'psql <<< "DROP DATABASE harukok_dev"',
    'psql <<EOF\nDROP DATABASE harukok_dev;\nEOF',
    'psql -f x.sql',
  ])('차단: %s', (c) => {
    const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'bg-'));
    try {
      fs.writeFileSync(
        path.join(proj, 'x.sql'),
        'DROP DATABASE harukok_dev;\n',
      );
      const r = decide(
        { tool_name: 'Bash', tool_input: { command: c } },
        { projectDir: proj, home: '/home/u' },
      );
      expect(r.allow).toBe(false);
    } finally {
      fs.rmSync(proj, { recursive: true, force: true });
    }
  });

  it.each([
    'echo "DROP DATABASE harukok_check" | psql',
    'dropdb -e harukok_check',
    'psql -e -c "select 1"',
    'psql -l',
    'psql -f missing.sql',
  ])('허용: %s', (c) => expectAllowed(c));
});

describe('pre-bash-guard 보호 경로 쓰기', () => {
  const runMerged = (command: string) =>
    decide(
      { tool_name: 'Bash', tool_input: { command } },
      {
        projectDir: dir,
        home: '/home/u',
        base: 'origin/main',
        fileInBase: (p: string) => p.startsWith('migrations/'),
      },
    );

  it.each([
    'sed -i s/a/b/ .claude/hooks/stop-verify.cjs',
    "sed -i '' 's/a/b/' scripts/lib/git.cjs",
    'perl -pi -e s/a/b/ .claude/settings.json',
    'rm .claude/state/stop-x.json',
    'unlink .claude/state/stop-x.json',
    'echo x > docs/spec/01-api.md',
    'echo x >> docs/spec/01-api.md',
    'echo x >docs/spec/01-api.md',
    'echo x 2> .claude/state/a.json',
    'echo x | tee .claude/hooks/a.cjs',
    'echo x | tee -a .env',
    'mv .claude/hooks/a.cjs /tmp/a',
    'mv /tmp/a .claude/hooks/a.cjs',
    'cp /tmp/a scripts/check-test-integrity.cjs',
    'cp docs/spec/01-api.md /tmp/a',
    'truncate -s 0 .claude/settings.json',
    'git restore .claude/hooks/a.cjs',
    'git checkout origin/main -- docs/spec/01-api.md',
    'git checkout origin/main -- .github/workflows/ci.yml',
    'sed -i s/a/b/ Docs/Spec/x.md',
    'echo x > .ENV',
    'bash -c "echo x > docs/spec/a.md"',
  ])('차단: %s', (c) => expectBlocked(c));

  it('병합된 마이그레이션 복원·덮어쓰기를 차단한다', () => {
    const m = 'migrations/20261112_005__social_unlink.sql';
    expect(runMerged(`git checkout origin/main -- ${m}`).allow).toBe(false);
    expect(runMerged(`echo x > ${m}`).allow).toBe(false);
  });

  it.each([
    'echo x > notes.txt',
    'rm dist/a.js',
    'rm src/a.ts',
    'echo x > /dev/null',
    'ls docs/spec',
    'cat docs/spec/01-api.md',
    'sed -n 1,5p docs/spec/01-api.md',
    'sed -i s/a/b/ src/a.ts',
    'cp .env.example /tmp/a',
    'git checkout -b feat/x',
    'git checkout main',
    'git restore src/a.ts',
    'echo x 2>&1',
    'npm test > /dev/null 2>&1',
  ])('허용: %s', (c) => expectAllowed(c));
});

describe('pre-bash-guard 실행', () => {
  const spawn = (input: string) =>
    spawnSync('node', [hook], {
      input,
      encoding: 'utf8',
      env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
    });

  it('차단 시 exit 2 와 stderr 사유', () => {
    const r = spawn(
      JSON.stringify({
        tool_name: 'Bash',
        tool_input: { command: 'git push --force' },
      }),
    );
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('force');
  });
  it('허용 시 exit 0', () => {
    expect(
      spawn(
        JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'ls' } }),
      ).status,
    ).toBe(0);
  });
  it('파싱 불가 입력은 스택 트레이스 없이 exit 2', () => {
    const r = spawn('{');
    expect(r.status).toBe(2);
    expect(r.stderr).not.toMatch(/\n\s+at \S/);
  });
});
