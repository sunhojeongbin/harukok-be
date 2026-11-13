import {
  isProtectedPath,
  protectedReason,
} from '../../.claude/hooks/lib/protected-paths.cjs';

const ctx = { projectDir: '/tmp/harukok-proj', base: null };

describe('protected-paths', () => {
  it('보호 경로는 사유를, 일반 경로는 null 을 준다', () => {
    expect(protectedReason('docs/spec/a.md', ctx)).toContain('노션');
    expect(protectedReason('src/a.ts', ctx)).toBeNull();
    expect(protectedReason('', ctx)).toBeNull();
  });
  it('프로젝트 밖 경로와 루트 자체는 보호 대상이 아니다', () => {
    expect(isProtectedPath('/etc/hosts', ctx)).toBe(false);
    expect(isProtectedPath('../docs/spec/a.md', ctx)).toBe(false);
    expect(isProtectedPath('.', ctx)).toBe(false);
  });
  it('대소문자를 무시하고 비교한다', () => {
    expect(isProtectedPath('DOCS/SPEC/a.md', ctx)).toBe(true);
    expect(isProtectedPath('.Claude/State/x.json', ctx)).toBe(true);
    expect(isProtectedPath('.github/WORKFLOWS/ci.yml', ctx)).toBe(true);
  });
  it('병합된 마이그레이션은 base 가 origin/main 일 때만 보호한다', () => {
    const f = 'migrations/20261110_001__init.sql';
    const merged = {
      projectDir: ctx.projectDir,
      base: 'origin/main',
      fileInBase: () => true,
    };
    expect(isProtectedPath(f, merged)).toBe(true);
    expect(isProtectedPath(f, { ...merged, base: 'HEAD' })).toBe(false);
  });
});
