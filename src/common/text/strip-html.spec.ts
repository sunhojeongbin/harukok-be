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

  describe('우회 시도 — 결과에 태그가 다시 생기면 안 된다', () => {
    it.each([
      ['겹친 태그', '<<script>script>alert(1)<</script>/script>'],
      ['겹친 img', '<<b>img src=x onerror=alert(1)>'],
      ['닫히지 않은 태그', '<img src=x onerror=alert(1)//'],
      ['쪼갠 태그', '<scr<b>ipt>alert(1)</scr</b>ipt>'],
      ['닫는 태그만', 'x</script'],
      ['주석', '<!-- x --><script>1</script>'],
    ])('%s', (_label, input) => {
      const out = stripHtml(input);

      expect(out).not.toMatch(/<[a-zA-Z/!]/);
    });

    it('부등호로 쓴 < 는 남긴다 (뒤에 글자가 오지 않으면 태그가 아니다)', () => {
      expect(stripHtml('1 < 2 그리고 3 <= 4')).toBe('1 < 2 그리고 3 <= 4');
    });
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
