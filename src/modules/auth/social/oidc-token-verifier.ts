import {
  createRemoteJWKSet,
  type JWTPayload,
  jwtVerify,
  type JWTVerifyGetKey,
} from 'jose';
import { BusinessException } from '../../../common/errors/business.exception';
import { AuthErrors } from '../errors/auth.errors';
import type {
  SocialIdentity,
  SocialProvider,
  SocialTokenVerifier,
} from './social-identity';

export interface OidcProviderConfig {
  issuers: string[];
  audiences: string[];
  keys: JWTVerifyGetKey;
  /** 이름을 담은 클레임. 애플은 이름을 토큰에 넣지 않는다 */
  nameClaim: string | null;
}

/** 제공자 공개 JWKS (jose 가 키를 캐시하고 kid 가 바뀌면 다시 받는다). 테스트에서는 쓰지 않는다. */
export function remoteOidcConfigs(env: {
  APPLE_CLIENT_ID: string;
  GOOGLE_CLIENT_IDS: string[];
  KAKAO_APP_KEYS: string[];
}): Record<SocialProvider, OidcProviderConfig> {
  const jwks = (url: string) => createRemoteJWKSet(new URL(url));
  return {
    KAKAO: {
      issuers: ['https://kauth.kakao.com'],
      audiences: env.KAKAO_APP_KEYS,
      keys: jwks('https://kauth.kakao.com/.well-known/jwks.json'),
      nameClaim: 'nickname',
    },
    APPLE: {
      issuers: ['https://appleid.apple.com'],
      audiences: [env.APPLE_CLIENT_ID],
      keys: jwks('https://appleid.apple.com/auth/keys'),
      nameClaim: null,
    },
    GOOGLE: {
      issuers: ['https://accounts.google.com', 'accounts.google.com'],
      audiences: env.GOOGLE_CLIENT_IDS,
      keys: jwks('https://www.googleapis.com/oauth2/v3/certs'),
      nameClaim: 'name',
    },
  };
}

/** 카카오·구글 OIDC id_token, 애플 identityToken 을 JWKS 로 검증한다. */
export class OidcSocialTokenVerifier implements SocialTokenVerifier {
  constructor(
    private readonly configs: Record<SocialProvider, OidcProviderConfig>,
  ) {}

  async verify(
    provider: SocialProvider,
    idToken: string,
  ): Promise<SocialIdentity> {
    const config = this.configs[provider];
    let payload: JWTPayload;
    try {
      ({ payload } = await jwtVerify(idToken, config.keys, {
        issuer: config.issuers,
        audience: config.audiences,
        algorithms: ['RS256', 'ES256'],
      }));
    } catch {
      // 원인(서명·iss·aud·만료)은 응답에 노출하지 않는다
      throw new BusinessException(AuthErrors.SOCIAL_TOKEN_INVALID);
    }
    if (typeof payload.sub !== 'string' || payload.sub === '') {
      throw new BusinessException(AuthErrors.SOCIAL_TOKEN_INVALID);
    }
    // 구글은 미확인 이메일에 email_verified=false 를 준다. 확인되지 않은 이메일은 저장하지 않는다
    const email =
      payload.email_verified === false ? null : stringClaim(payload, 'email');
    return {
      providerUserId: payload.sub,
      email,
      name: config.nameClaim ? stringClaim(payload, config.nameClaim) : null,
    };
  }
}

function stringClaim(payload: JWTPayload, name: string): string | null {
  const value = payload[name];
  return typeof value === 'string' ? value : null;
}
