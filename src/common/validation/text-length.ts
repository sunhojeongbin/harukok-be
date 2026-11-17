import { ValidateBy, type ValidationOptions } from 'class-validator';

/**
 * 공백만이 아니고, 앞뒤 공백을 뺀 글자 수(코드포인트)가 min~max.
 * DB 의 CHECK (char_length(btrim(x)) BETWEEN min AND max) 와 같은 기준이다 — @Length 는 UTF-16 단위라 이모지에서 어긋난다.
 */
export function hasTextLength(
  value: unknown,
  min: number,
  max: number,
): boolean {
  if (typeof value !== 'string') return false;
  const length = [...value.trim()].length;
  return length >= min && length <= max;
}

export function TextLength(
  min: number,
  max: number,
  options?: ValidationOptions,
): PropertyDecorator {
  return ValidateBy(
    {
      name: 'textLength',
      validator: {
        validate: (value: unknown) => hasTextLength(value, min, max),
        defaultMessage: () =>
          `$property must be ${min}~${max} characters (not blank)`,
      },
    },
    options,
  );
}
