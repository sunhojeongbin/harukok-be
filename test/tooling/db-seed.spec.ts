import { TEMP_TERMS } from '../../scripts/db-seed.cjs';

describe('TEMP_TERMS (임시 이용약관 시드)', () => {
  it('이용약관 1개만 담는다 (약관은 이용약관 1종, type 없음)', () => {
    expect(TEMP_TERMS).toHaveLength(1);
    expect(TEMP_TERMS[0]).not.toHaveProperty('type');
  });

  it('URL 은 예약 도메인(example.com)이라 실제 서비스에 쓰일 수 없다', () => {
    for (const t of TEMP_TERMS) {
      expect(new URL(t.contentUrl).hostname).toBe('example.com');
    }
  });

  it('제목에 (임시) 를 표시한다', () => {
    for (const t of TEMP_TERMS) expect(t.title).toContain('(임시)');
  });

  it('DDL 제약 길이를 지킨다 (version varchar(20))', () => {
    for (const t of TEMP_TERMS) {
      expect(t.version.length).toBeLessThanOrEqual(20);
      expect(Number.isNaN(Date.parse(t.effectiveFrom))).toBe(false);
    }
  });
});
