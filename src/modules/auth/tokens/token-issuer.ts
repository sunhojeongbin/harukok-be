import { createHash, randomBytes } from 'node:crypto';
import { SignJWT } from 'jose';

/** API 설계서 6-1 */
export const ACCESS_TOKEN_TTL_SECONDS = 60 * 60;
export const REFRESH_TOKEN_TTL_DAYS = 30;

export interface NewRefreshToken {
  /** 클라이언트에 주는 원문 */
  token: string;
  /** DB refresh_tokens.token_hash 에 저장하는 SHA-256 */
  hash: Buffer;
}

export class TokenIssuer {
  private readonly key: Uint8Array;

  constructor(accessSecret: string) {
    this.key = new TextEncoder().encode(accessSecret);
  }

  issueAccessToken(userId: string): Promise<string> {
    return new SignJWT({})
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(userId)
      .setIssuedAt()
      .setExpirationTime(`${ACCESS_TOKEN_TTL_SECONDS}s`)
      .sign(this.key);
  }

  /** 무작위 32바이트 (base64url). 서명이 필요 없다 — DB 가 해시로 찾고 폐기한다 */
  newRefreshToken(): NewRefreshToken {
    const token = randomBytes(32).toString('base64url');
    return { token, hash: TokenIssuer.hashRefreshToken(token) };
  }

  static hashRefreshToken(token: string): Buffer {
    return createHash('sha256').update(token).digest();
  }
}
