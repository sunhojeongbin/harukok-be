import { importPKCS8, SignJWT } from 'jose';
import {
  type FetchFn,
  requestWithRetry,
  UNLINK_RETRY,
} from '../../../common/http/request-with-retry';

export const APPLE_AUTH_CLIENT = Symbol('APPLE_AUTH_CLIENT');
const APPLE_ISSUER = 'https://appleid.apple.com';
export const APPLE_TOKEN_URL = `${APPLE_ISSUER}/auth/token`;
export const APPLE_REVOKE_CLIENT = Symbol('APPLE_REVOKE_CLIENT');
export const APPLE_REVOKE_URL = `${APPLE_ISSUER}/auth/revoke`;
const CLIENT_SECRET_TTL_SECONDS = 5 * 60;

/** 애플 authorizationCode → refresh token 교환 (탈퇴 시 /auth/revoke 용) */
export interface AppleAuthClient {
  exchangeCode(code: string): Promise<string>;
}

/** 탈퇴 시 저장해 둔 refresh token 을 무효화한다 (App Store 심사 요건, TN3194). 실패하면 예외 */
export interface AppleRevokeClient {
  revoke(refreshToken: string): Promise<void>;
}

export interface AppleAuthConfig {
  teamId: string;
  keyId: string;
  privateKeyPem: string;
  /** 네이티브 앱 번들 ID (Service ID 아님) */
  clientId: string;
}

export type { FetchFn };

export class HttpAppleAuthClient implements AppleAuthClient, AppleRevokeClient {
  constructor(
    private readonly config: AppleAuthConfig,
    private readonly fetchFn: FetchFn = fetch,
    private readonly now: () => number = Date.now,
  ) {}

  /** 일시적 오류(네트워크 · 시간 초과 · 5xx)는 한 번 더 시도한다. 그래도 실패하면 예외 — 탈퇴는 로그만 남기고 진행한다 */
  async revoke(refreshToken: string): Promise<void> {
    const body = new URLSearchParams({
      client_id: this.config.clientId,
      client_secret: await this.clientSecret(),
      token: refreshToken,
      token_type_hint: 'refresh_token',
    });
    const res = await requestWithRetry(
      this.fetchFn,
      APPLE_REVOKE_URL,
      {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      },
      UNLINK_RETRY,
    );
    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as { error?: unknown };
      // 애플 오류 코드만 남긴다. 토큰 · 시크릿은 넣지 않는다
      throw new Error(
        `애플 /auth/revoke 실패: ${res.status} ${typeof json.error === 'string' ? json.error : ''}`,
      );
    }
  }

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
