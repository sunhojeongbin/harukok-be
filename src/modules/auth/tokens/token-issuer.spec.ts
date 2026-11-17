import { createHash } from 'node:crypto';
import { jwtVerify } from 'jose';
import { ACCESS_TOKEN_TTL_SECONDS, TokenIssuer } from './token-issuer';

const SECRET = 'fake-access-secret-for-tests-only-0123456789';
const key = (s: string) => new TextEncoder().encode(s);

describe('TokenIssuer', () => {
  const issuer = new TokenIssuer(SECRET);

  it('액세스 토큰은 HS256 JWT, sub = 사용자ID, 수명 1시간', async () => {
    const token = await issuer.issueAccessToken('fake-user-id');

    const { payload, protectedHeader } = await jwtVerify(token, key(SECRET));
    expect(protectedHeader.alg).toBe('HS256');
    expect(payload.sub).toBe('fake-user-id');
    expect((payload.exp ?? 0) - (payload.iat ?? 0)).toBe(
      ACCESS_TOKEN_TTL_SECONDS,
    );
    expect(ACCESS_TOKEN_TTL_SECONDS).toBe(3600);
  });

  it('다른 비밀키로는 액세스 토큰을 검증할 수 없다', async () => {
    const token = await issuer.issueAccessToken('fake-user-id');

    await expect(
      jwtVerify(token, key('another-fake-secret-0123456789abcdef')),
    ).rejects.toThrow();
  });

  it('리프레시 토큰은 매번 다른 무작위 값이고, 해시는 원문의 SHA-256 이다', () => {
    const a = issuer.newRefreshToken();
    const b = issuer.newRefreshToken();

    expect(a.token).not.toBe(b.token);
    expect(a.token).toMatch(/^[A-Za-z0-9_-]{43}$/); // 32바이트 base64url
    expect(a.hash).toEqual(createHash('sha256').update(a.token).digest());
    expect(TokenIssuer.hashRefreshToken(a.token)).toEqual(a.hash);
  });
});
