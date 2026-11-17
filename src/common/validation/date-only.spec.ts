import { validateSync } from 'class-validator';
import { IsDateOnly, isDateOnly } from './date-only';

describe('isDateOnly', () => {
  it.each(['2026-11-17', '2024-02-29', '2026-12-31', '2026-01-01'])(
    '%s 는 허용',
    (value) => {
      expect(isDateOnly(value)).toBe(true);
    },
  );

  it.each([
    ['시각 포함', '2026-11-17T00:00:00'],
    ['타임존 포함', '2026-11-17T00:00:00+09:00'],
    ['UTC Z', '2026-11-17Z'],
    ['없는 날짜', '2026-02-30'],
    ['윤년 아님', '2026-02-29'],
    ['13월', '2026-13-01'],
    ['0일', '2026-11-00'],
    ['한 자리 월', '2026-1-17'],
    ['슬래시', '2026/11/17'],
    ['앞뒤 공백', ' 2026-11-17 '],
    ['빈 문자열', ''],
    ['숫자', 20261117],
    ['null', null],
  ])('%s(%j) 는 거부', (_label, value) => {
    expect(isDateOnly(value)).toBe(false);
  });
});

class FakeDto {
  @IsDateOnly()
  dueDate: unknown;
}

describe('@IsDateOnly()', () => {
  it('통과하면 오류가 없다', () => {
    const dto = Object.assign(new FakeDto(), { dueDate: '2026-11-17' });

    expect(validateSync(dto)).toHaveLength(0);
  });

  it('거부하면 그 필드 오류가 난다', () => {
    const dto = Object.assign(new FakeDto(), {
      dueDate: '2026-11-17T00:00:00Z',
    });

    expect(validateSync(dto).map((e) => e.property)).toEqual(['dueDate']);
  });
});
