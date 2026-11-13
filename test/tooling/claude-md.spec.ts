import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const claudeMd = (): string =>
  fs.readFileSync(path.join(ROOT, 'CLAUDE.md'), 'utf8');

describe('CLAUDE.md', () => {
  it('언급된 npm run 명령이 전부 package.json scripts 에 존재한다', () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'),
    ) as { scripts: Record<string, string> };
    const names = [...claudeMd().matchAll(/`npm run ([\w:-]+)/g)].map(
      (m) => m[1],
    );
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) {
      expect(pkg.scripts).toHaveProperty([name]);
    }
  });

  it('명세 위치 docs/spec/ 을 언급한다', () => {
    expect(claudeMd()).toContain('docs/spec/');
  });

  it('140줄 이하다', () => {
    expect(claudeMd().split('\n').length).toBeLessThanOrEqual(140);
  });

  it('7장이 보호 경로·Bash 쓰기 차단·우회 금지·결함 보고 규칙을 담는다', () => {
    const md = claudeMd();
    for (const needle of [
      '.claude/state/**',
      '.github/workflows/**',
      'Bash 쓰기',
      '최선의 방어선',
      'PR 본문',
      '001·005',
    ]) {
      expect(md).toContain(needle);
    }
  });
});
