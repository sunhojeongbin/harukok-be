import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');

interface HookEntry {
  matcher?: string;
  hooks: { command: string }[];
}
interface Settings {
  hooks: Record<string, HookEntry[]>;
}
const settings = JSON.parse(
  fs.readFileSync(path.join(ROOT, '.claude/settings.json'), 'utf8'),
) as Settings;

describe('.claude/settings.json', () => {
  const matcherOf = (event: string, file: string): string | undefined =>
    settings.hooks[event].find((e) =>
      e.hooks.some((h) => h.command.includes(file)),
    )?.matcher;

  it('편집 계열 훅은 NotebookEdit 까지 포함한다', () => {
    const expected = 'Edit|Write|MultiEdit|NotebookEdit';
    expect(matcherOf('PreToolUse', 'pre-edit-guard.cjs')).toBe(expected);
    expect(matcherOf('PostToolUse', 'post-edit-format.cjs')).toBe(expected);
  });

  it('참조하는 훅 파일이 모두 존재한다', () => {
    const commands = Object.values(settings.hooks)
      .flat()
      .flatMap((e) => e.hooks.map((h) => h.command));
    expect(commands.length).toBeGreaterThan(0);
    for (const c of commands) {
      const m = /\.claude\/hooks\/[\w-]+\.cjs/.exec(c);
      expect(m).not.toBeNull();
      expect(fs.existsSync(path.join(ROOT, m![0]))).toBe(true);
    }
  });
});
