import {
  findViolations,
  isTestFile,
} from '../../scripts/lib/test-integrity.cjs';

describe('isTestFile', () => {
  it.each(['src/a.spec.ts', 'test/b.e2e-spec.ts'])('%s 는 테스트 파일', (f) =>
    expect(isTestFile(f)).toBe(true),
  );
  it.each(['src/a.ts', 'src/spec.ts.bak'])('%s 는 테스트 파일이 아님', (f) =>
    expect(isTestFile(f)).toBe(false),
  );
});

describe('findViolations', () => {
  it('테스트 파일 삭제를 위반으로 본다', () => {
    expect(findViolations({ deleted: ['src/a.spec.ts'], added: [] })).toEqual([
      '테스트 파일 삭제: src/a.spec.ts',
    ]);
  });

  it('일반 파일 삭제는 무시한다', () => {
    expect(findViolations({ deleted: ['src/a.ts'], added: [] })).toEqual([]);
  });

  // 이 파일 자체가 감지되지 않도록 금지 패턴을 런타임에 조립한다.
  const call = (name: string, mod?: string): string =>
    `${name}${mod ? `.${mod}` : ''}(`;

  it.each([
    call('it', 'skip'),
    call('describe', 'only'),
    call('test', 'skip'),
    call('x' + 'it'),
    call('x' + 'describe'),
    call('f' + 'it'),
    call('f' + 'describe'),
  ])('금지 패턴 %s', (p) =>
    expect(
      findViolations({
        deleted: [],
        added: [{ file: 'src/a.spec.ts', line: `  ${p}'x', () => {})` }],
      }),
    ).toHaveLength(1),
  );

  it('테스트 파일이 아니면 금지 패턴을 무시한다', () => {
    expect(
      findViolations({
        deleted: [],
        added: [{ file: 'src/a.ts', line: call('it', 'skip') }],
      }),
    ).toEqual([]);
  });

  it('문자열 속 단어는 무시한다', () => {
    expect(
      findViolations({
        deleted: [],
        added: [
          { file: 'src/a.spec.ts', line: "it('skip 처리 확인', () => {})" },
        ],
      }),
    ).toEqual([]);
  });
});
