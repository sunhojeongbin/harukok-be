import { normalizeEmail, normalizeName } from './profile';

describe('normalizeEmail', () => {
  it.each([
    [' Fake@Example.COM ', 'fake@example.com'],
    ['fake123@privaterelay.appleid.com', 'fake123@privaterelay.appleid.com'],
    ['', null],
    ['   ', null],
    [null, null],
    [undefined, null],
    ['ab', null],
    [`${'a'.repeat(244)}@example.com`, null],
  ])('%j → %j', (input, expected) => {
    expect(normalizeEmail(input)).toBe(expected);
  });
});

describe('normalizeName', () => {
  it.each([
    ['하루콕', '하루콕'],
    ['<b>하루</b>콕', '하루콕'],
    ['  공백  ', '공백'],
    ['<p></p>', null],
    ['   ', null],
    [null, null],
    [undefined, null],
  ])('%j → %j', (input, expected) => {
    expect(normalizeName(input)).toBe(expected);
  });

  it('50자를 넘으면 50자로 자른다 (글자 단위)', () => {
    expect(normalizeName('가'.repeat(60))).toBe('가'.repeat(50));
  });

  it('이모지 같은 서로게이트 쌍을 반으로 자르지 않는다 (char_length 기준)', () => {
    const name = '😀'.repeat(60);

    const result = normalizeName(name) ?? '';

    expect([...result]).toHaveLength(50);
    expect(result).toBe('😀'.repeat(50));
  });

  it('잘린 끝의 공백은 지운다 (DB ck_users_name 은 btrim 기준)', () => {
    expect(normalizeName(`${'가'.repeat(49)} 나다`)).toBe('가'.repeat(49));
  });
});
