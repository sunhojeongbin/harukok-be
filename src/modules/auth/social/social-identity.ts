/** DB ck_user_social_accounts_provider 와 같은 값 */
export const SOCIAL_PROVIDERS = ['KAKAO', 'APPLE', 'GOOGLE'] as const;
export type SocialProvider = (typeof SOCIAL_PROVIDERS)[number];

/** 검증된 소셜 토큰에서 꺼낸 값. 이메일·이름은 정규화 전 원문이다. */
export interface SocialIdentity {
  providerUserId: string;
  email: string | null;
  name: string | null;
}

/** 제공자별 idToken 검증. 실패하면 BusinessException(SOCIAL_TOKEN_INVALID). */
export interface SocialTokenVerifier {
  verify(provider: SocialProvider, idToken: string): Promise<SocialIdentity>;
}

export const SOCIAL_TOKEN_VERIFIER = Symbol('SOCIAL_TOKEN_VERIFIER');
