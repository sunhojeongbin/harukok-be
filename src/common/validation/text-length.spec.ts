import { validateSync } from 'class-validator';
import { hasTextLength, TextLength } from './text-length';

describe('hasTextLength (DB char_length(btrim) 기준)', () => {
  it.each([
    ['1자', '가'],
    ['250자', '가'.repeat(250)],
    ['이모지 250자 (UTF-16 으로는 500)', '😀'.repeat(250)],
    ['앞뒤 공백은 세지 않는다', `  ${'가'.repeat(250)}  `],
  ])('%s → 허용', (_label, value) => {
    expect(hasTextLength(value, 1, 250)).toBe(true);
  });

  it.each([
    ['빈 문자열', ''],
    ['공백만', '   '],
    ['251자', '가'.repeat(251)],
    ['이모지 251자', '😀'.repeat(251)],
    ['문자열 아님', 42],
  ])('%s → 거부', (_label, value) => {
    expect(hasTextLength(value, 1, 250)).toBe(false);
  });
});

class FakeDto {
  @TextLength(1, 250)
  title: unknown;
}

describe('@TextLength()', () => {
  it('통과 / 거부를 필드 오류로 낸다', () => {
    expect(
      validateSync(Object.assign(new FakeDto(), { title: '할 일' })),
    ).toHaveLength(0);
    expect(
      validateSync(Object.assign(new FakeDto(), { title: '  ' })).map(
        (e) => e.property,
      ),
    ).toEqual(['title']);
  });
});
