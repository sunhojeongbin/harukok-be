// Swagger 문서용 공용 값 — 모두 가짜 예시다 (실제 토큰 · 개인 정보 아님, CLAUDE.md 5장)
import { SOCIAL_PROVIDERS } from '../social/social-identity';

/** 제공자 enum 을 공유 스키마 하나(SocialProvider)로 등록해 여러 DTO 가 참조하게 한다 */
export const SOCIAL_PROVIDER_SCHEMA = {
  enum: SOCIAL_PROVIDERS,
  enumName: 'SocialProvider',
} as const;

export const EXAMPLE = {
  /** JWT 모양의 가짜 값 — 서명이 없어 실제로는 통과하지 않는다 */
  accessToken:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIwMDAwMDAwMC0wMDAwLTcwMDAtODAwMC0wMDAwMDAwMDAwMDEifQ.fake-signature',
  /** 실제 리프레시 토큰과 같은 길이(43자 base64url)의 가짜 값 */
  refreshToken: 'ZmFrZS1yZWZyZXNoLXRva2VuLWZvci1zd2FnZ2VyISE',
  /** 개발 전용 테스트 로그인 토큰 (docs/guides/swagger-social-login.md) */
  idToken: 'dev-test-token',
  authorizationCode: 'fake-apple-authorization-code',
  deviceId: 'swagger',
  name: '홍길동',
  email: 'user@example.com',
} as const;
