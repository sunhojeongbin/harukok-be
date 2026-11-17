import { plainToInstance } from 'class-transformer';
import { StripHtml, stripHtml } from './strip-html';

describe('stripHtml', () => {
  it.each([
    ['<b>하루</b>콕', '하루콕'],
    ['  공백  ', '공백'],
    ['<script>alert(1)</script>이름', 'alert(1)이름'],
    ['<img src=x onerror=alert(1)>', ''],
    ['a < b > c', 'a < b > c'],
    ['태그 없음', '태그 없음'],
  ])('%j → %j', (input, expected) => {
    expect(stripHtml(input)).toBe(expected);
  });
});

class FakeDto {
  @StripHtml()
  name?: unknown;
}

describe('@StripHtml()', () => {
  it('문자열 필드에 stripHtml 을 적용한다', () => {
    expect(plainToInstance(FakeDto, { name: ' <i>가짜</i> ' }).name).toBe(
      '가짜',
    );
  });

  it('문자열이 아니면 그대로 둔다 (타입 검증이 거부하도록)', () => {
    expect(plainToInstance(FakeDto, { name: 42 }).name).toBe(42);
  });
});
