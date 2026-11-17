import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  type JWTPayload,
  SignJWT,
} from 'jose';
import type { KeyLike } from 'jose';
import { BusinessException } from '../../../common/errors/business.exception';
import { AuthErrors } from '../errors/auth.errors';
import {
  type OidcProviderConfig,
  OidcSocialTokenVerifier,
} from './oidc-token-verifier';
import type { SocialProvider } from './social-identity';

const ISSUER: Record<SocialProvider, string> = {
  KAKAO: 'https://kauth.kakao.com',
  APPLE: 'https://appleid.apple.com',
  GOOGLE: 'https://accounts.google.com',
};
const AUDIENCE: Record<SocialProvider, string> = {
  KAKAO: 'fake-kakao-app-key',
  APPLE: 'com.example.fake.harukok',
  GOOGLE: 'fake-ios.apps.googleusercontent.com',
};

let privateKey: KeyLike;
let otherPrivateKey: KeyLike;
let verifier: OidcSocialTokenVerifier;

beforeAll(async () => {
  const pair = await generateKeyPair('RS256');
  privateKey = pair.privateKey;
  otherPrivateKey = (await generateKeyPair('RS256')).privateKey;
  const jwk = {
    ...(await exportJWK(pair.publicKey)),
    kid: 'fake-kid',
    alg: 'RS256',
  };
  const keys = createLocalJWKSet({ keys: [jwk] });
  const config = (
    provider: SocialProvider,
    nameClaim: string | null,
  ): OidcProviderConfig => ({
    issuers: [ISSUER[provider]],
    audiences: [AUDIENCE[provider], 'second-allowed-audience'],
    keys,
    nameClaim,
  });
  verifier = new OidcSocialTokenVerifier({
    KAKAO: config('KAKAO', 'nickname'),
    APPLE: config('APPLE', null),
    GOOGLE: config('GOOGLE', 'name'),
  });
});

async function sign(
  provider: SocialProvider,
  claims: JWTPayload,
  opts: {
    key?: KeyLike;
    iss?: string;
    aud?: string;
    exp?: string | number;
    sub?: string | null;
  } = {},
): Promise<string> {
  const jwt = new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256', kid: 'fake-kid' })
    .setIssuedAt()
    .setIssuer(opts.iss ?? ISSUER[provider])
    .setAudience(opts.aud ?? AUDIENCE[provider])
    .setExpirationTime(opts.exp ?? '5m');
  if (opts.sub !== null) jwt.setSubject(opts.sub ?? 'fake-sub-1');
  return jwt.sign(opts.key ?? privateKey);
}

async function expectInvalid(promise: Promise<unknown>) {
  await expect(promise).rejects.toBeInstanceOf(BusinessException);
  await expect(promise).rejects.toMatchObject({
    definition: AuthErrors.SOCIAL_TOKEN_INVALID,
  });
}

describe('OidcSocialTokenVerifier', () => {
  it('구글: sub · email · name 을 꺼낸다', async () => {
    const token = await sign('GOOGLE', {
      email: 'Fake@Example.com',
      email_verified: true,
      name: '가짜 사용자',
    });

    await expect(verifier.verify('GOOGLE', token)).resolves.toEqual({
      providerUserId: 'fake-sub-1',
      email: 'Fake@Example.com',
      name: '가짜 사용자',
    });
  });

  it('구글: email_verified 가 false 면 이메일을 버린다', async () => {
    const token = await sign('GOOGLE', {
      email: 'fake@example.com',
      email_verified: false,
    });

    await expect(verifier.verify('GOOGLE', token)).resolves.toMatchObject({
      email: null,
    });
  });

  it('카카오: 이름은 nickname 클레임에서 꺼낸다', async () => {
    const token = await sign('KAKAO', { nickname: '가짜닉', email: 'k@e.com' });

    await expect(verifier.verify('KAKAO', token)).resolves.toEqual({
      providerUserId: 'fake-sub-1',
      email: 'k@e.com',
      name: '가짜닉',
    });
  });

  it('애플: 토큰에 이름이 없으므로 name 은 NULL', async () => {
    const token = await sign('APPLE', { name: '무시됨', email: 'a@e.com' });

    await expect(verifier.verify('APPLE', token)).resolves.toEqual({
      providerUserId: 'fake-sub-1',
      email: 'a@e.com',
      name: null,
    });
  });

  it('이메일·이름 클레임이 없거나 문자열이 아니면 NULL', async () => {
    const token = await sign('GOOGLE', { email: 42 });

    await expect(verifier.verify('GOOGLE', token)).resolves.toEqual({
      providerUserId: 'fake-sub-1',
      email: null,
      name: null,
    });
  });

  it('허용 목록의 다른 aud 도 받는다 (iOS·Android·서버 클라이언트 ID)', async () => {
    const token = await sign('GOOGLE', {}, { aud: 'second-allowed-audience' });

    await expect(verifier.verify('GOOGLE', token)).resolves.toMatchObject({
      providerUserId: 'fake-sub-1',
    });
  });

  it('aud 가 다르면 SOCIAL_TOKEN_INVALID', async () => {
    await expectInvalid(
      verifier.verify('GOOGLE', await sign('GOOGLE', {}, { aud: 'other-app' })),
    );
  });

  it('iss 가 다르면 SOCIAL_TOKEN_INVALID (다른 제공자 토큰을 섞어 보내도 거부)', async () => {
    await expectInvalid(verifier.verify('GOOGLE', await sign('KAKAO', {})));
  });

  it('만료된 토큰은 SOCIAL_TOKEN_INVALID', async () => {
    const expired = Math.floor(Date.now() / 1000) - 60;

    await expectInvalid(
      verifier.verify('APPLE', await sign('APPLE', {}, { exp: expired })),
    );
  });

  it('JWKS 에 없는 키로 서명했으면 SOCIAL_TOKEN_INVALID', async () => {
    await expectInvalid(
      verifier.verify(
        'KAKAO',
        await sign('KAKAO', {}, { key: otherPrivateKey }),
      ),
    );
  });

  it('sub 가 없으면 SOCIAL_TOKEN_INVALID', async () => {
    await expectInvalid(
      verifier.verify('GOOGLE', await sign('GOOGLE', {}, { sub: null })),
    );
  });

  it('JWT 형식이 아니면 SOCIAL_TOKEN_INVALID', async () => {
    await expectInvalid(verifier.verify('GOOGLE', 'not-a-jwt'));
  });
});
