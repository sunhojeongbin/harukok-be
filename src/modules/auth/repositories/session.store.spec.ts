import { judgeRefresh, type StoredRefreshToken } from './session.store';

const token = (over: Partial<StoredRefreshToken> = {}): StoredRefreshToken => ({
  userId: 'fake-user',
  deviceId: 'dev-1',
  revoked: false,
  expired: false,
  ...over,
});

describe('judgeRefresh (재발급 판정 순서)', () => {
  it('활성 · 같은 기기 · 만료 전이면 OK', () => {
    expect(judgeRefresh(token(), 'dev-1')).toBe('OK');
  });

  it('1. 토큰이 없으면 INVALID', () => {
    expect(judgeRefresh(null, 'dev-1')).toBe('INVALID');
  });

  it('2. 기기가 다르면 INVALID', () => {
    expect(judgeRefresh(token(), 'dev-2')).toBe('INVALID');
  });

  it('3. 이미 폐기된 토큰이면 REVOKED (재사용)', () => {
    expect(judgeRefresh(token({ revoked: true }), 'dev-1')).toBe('REVOKED');
  });

  it('4. 만료됐으면 EXPIRED', () => {
    expect(judgeRefresh(token({ expired: true }), 'dev-1')).toBe('EXPIRED');
  });

  it('기기 불일치가 재사용보다 먼저다 — 다른 기기가 폐기 토큰을 보내도 그 기기 세션을 폐기하지 않는다', () => {
    expect(judgeRefresh(token({ revoked: true }), 'dev-2')).toBe('INVALID');
  });

  it('재사용이 만료보다 먼저다 — 폐기되고 만료된 토큰은 REVOKED', () => {
    expect(judgeRefresh(token({ revoked: true, expired: true }), 'dev-1')).toBe(
      'REVOKED',
    );
  });
});
