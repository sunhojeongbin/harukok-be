import { TEMP_TERMS, TEST_ACCOUNT } from '../../scripts/db-seed.cjs';
import {
  DEV_TEST_IDENTITY,
  DEV_TEST_PROVIDER,
} from '../../src/modules/auth/social/dev-test-login';

describe('TEST_ACCOUNT (개발 전용 테스트 계정 시드)', () => {
  it('앱의 테스트 로그인 신원과 같다 — 다르면 시드한 계정으로 로그인되지 않는다', () => {
    expect(TEST_ACCOUNT).toEqual({
      provider: DEV_TEST_PROVIDER,
      ...DEV_TEST_IDENTITY,
    });
  });

  it('이메일은 예약 도메인(example.com)이고 DB 정규화 규칙(소문자)을 지킨다', () => {
    expect(TEST_ACCOUNT.email).toBe(TEST_ACCOUNT.email.toLowerCase());
    expect(TEST_ACCOUNT.email.endsWith('@example.com')).toBe(true);
  });
});

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
