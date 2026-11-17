import { importPKCS8, SignJWT } from 'jose';

export const APPLE_AUTH_CLIENT = Symbol('APPLE_AUTH_CLIENT');
const APPLE_ISSUER = 'https://appleid.apple.com';
export const APPLE_TOKEN_URL = `${APPLE_ISSUER}/auth/token`;
const CLIENT_SECRET_TTL_SECONDS = 5 * 60;

/** 애플 authorizationCode → refresh token 교환 (탈퇴 시 /auth/revoke 용) */
export interface AppleAuthClient {
  exchangeCode(code: string): Promise<string>;
}

export interface AppleAuthConfig {
  teamId: string;
  keyId: string;
  privateKeyPem: string;
  /** 네이티브 앱 번들 ID (Service ID 아님) */
  clientId: string;
}

export type FetchFn = (url: string, init: RequestInit) => Promise<Response>;

export class HttpAppleAuthClient implements AppleAuthClient {
  constructor(
    private readonly config: AppleAuthConfig,
    private readonly fetchFn: FetchFn = fetch,
    private readonly now: () => number = Date.now,
  ) {}

  async exchangeCode(code: string): Promise<string> {
    const body = new URLSearchParams({
      client_id: this.config.clientId,
      client_secret: await this.clientSecret(),
      code,
      grant_type: 'authorization_code',
    });
    const res = await this.fetchFn(APPLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    const json = (await res.json().catch(() => ({}))) as {
      refresh_token?: unknown;
      error?: unknown;
    };
    if (!res.ok) {
      // 애플 오류 코드(invalid_grant 등)만 남긴다. 요청 값(코드·시크릿)은 넣지 않는다
      throw new Error(
        `애플 /auth/token 실패: ${res.status} ${typeof json.error === 'string' ? json.error : ''}`,
      );
    }
    if (typeof json.refresh_token !== 'string' || json.refresh_token === '') {
      throw new Error('애플 /auth/token 응답에 refresh_token 이 없습니다.');
    }
    return json.refresh_token;
  }

  /** 요청마다 새로 서명한다 (캐시하지 않음, exp 5분) — API 설계서 5-6 */
  private async clientSecret(): Promise<string> {
    const iat = Math.floor(this.now() / 1000);
    const key = await importPKCS8(this.config.privateKeyPem, 'ES256');
    return new SignJWT({})
      .setProtectedHeader({ alg: 'ES256', kid: this.config.keyId })
      .setIssuer(this.config.teamId)
      .setSubject(this.config.clientId)
      .setAudience(APPLE_ISSUER)
      .setIssuedAt(iat)
      .setExpirationTime(iat + CLIENT_SECRET_TTL_SECONDS)
      .sign(key);
  }
}
