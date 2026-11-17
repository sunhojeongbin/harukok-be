import { Transform } from 'class-transformer';

// 태그로 보이는 것만 지운다: '<' 뒤에 글자·'/'·'!' 가 와야 태그다 ("a < b > c" 같은 부등호는 남긴다).
const TAG = /<[a-zA-Z/!][^>]*>/g;

/** 자유 텍스트에서 HTML 태그를 지우고 앞뒤 공백을 자른다. */
export function stripHtml(value: string): string {
  return value.replace(TAG, '').trim();
}

/** DTO 문자열 필드에 stripHtml 을 적용한다. 문자열이 아니면 그대로 둔다(타입 검증이 거부). */
export function StripHtml(): PropertyDecorator {
  return Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? stripHtml(value) : value,
  );
}
