import { TEMP_TERMS } from '../../scripts/db-seed.cjs';

describe('TEMP_TERMS (임시 약관 시드)', () => {
  it('SERVICE·PRIVACY 를 하나씩 담는다', () => {
    expect(TEMP_TERMS.map((t) => t.type).sort()).toEqual([
      'PRIVACY',
      'SERVICE',
    ]);
  });

  it('URL 은 예약 도메인(example.com)이라 실제 서비스에 쓰일 수 없다', () => {
    for (const t of TEMP_TERMS) {
      expect(new URL(t.contentUrl).hostname).toBe('example.com');
    }
  });

  it('제목에 (임시) 를 표시한다', () => {
    for (const t of TEMP_TERMS) expect(t.title).toContain('(임시)');
  });

  it('DDL 제약 길이를 지킨다 (type·version varchar(20))', () => {
    for (const t of TEMP_TERMS) {
      expect(t.version.length).toBeLessThanOrEqual(20);
      expect(Number.isNaN(Date.parse(t.effectiveFrom))).toBe(false);
    }
  });
});
