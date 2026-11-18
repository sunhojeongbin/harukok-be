import { Transform } from 'class-transformer';

// 태그로 보이는 것만 지운다: '<' 뒤에 글자·'/'·'!' 가 와야 태그다 ("a < b > c" 같은 부등호는 남긴다).
const TAG = /<[a-zA-Z/!][^>]*>/g;
// 태그를 지운 뒤에도 남은 태그 시작 — 닫히지 않은 태그('<img src=x onerror=...') 를 무력화한다
const TAG_START = /<(?=[a-zA-Z/!])/g;

/**
 * 자유 텍스트에서 HTML 태그를 지우고 앞뒤 공백을 자른다.
 * 한 번만 지우면 '<<script>script>' 처럼 겹친 태그가 지워지면서 '<script>' 가 다시 생긴다 —
 * 더 이상 바뀌지 않을 때까지 반복하고, 마지막에 남은 태그 시작 '<' 를 없앤다 (보안 점검 #1)
 */
export function stripHtml(value: string): string {
  let current = value;
  let previous: string;
  do {
    previous = current;
    current = current.replace(TAG, '');
  } while (current !== previous);
  return current.replace(TAG_START, '').trim();
}

/** DTO 문자열 필드에 stripHtml 을 적용한다. 문자열이 아니면 그대로 둔다(타입 검증이 거부). */
export function StripHtml(): PropertyDecorator {
  return Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? stripHtml(value) : value,
  );
}
