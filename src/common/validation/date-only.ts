import { ValidateBy, type ValidationOptions } from 'class-validator';

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * 달력 날짜만 허용: 'YYYY-MM-DD' 이고 실제로 있는 날짜 (API 설계서 5-5).
 * 시각 · 타임존이 붙은 문자열은 거부한다 — 받는 순간 '날짜 하루 밀림'이 되살아난다 (DB 설계서 5-1).
 */
export function isDateOnly(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const m = DATE_ONLY.exec(value);
  if (!m) return false;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  // UTC 로 만들어 되돌려 보면 2026-02-30 같은 값은 다른 날짜가 된다
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function IsDateOnly(options?: ValidationOptions): PropertyDecorator {
  return ValidateBy(
    {
      name: 'isDateOnly',
      validator: {
        validate: (value: unknown) => isDateOnly(value),
        defaultMessage: () => '$property must be a YYYY-MM-DD date',
      },
    },
    options,
  );
}
