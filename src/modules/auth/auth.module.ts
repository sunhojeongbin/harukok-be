import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvironmentVariables } from '../../common/config/env.validation';
import { TokenCipher } from '../../common/crypto/token-cipher';
import { TermsModule } from '../terms/terms.module';
import { AuthController } from './controller/auth.controller';
import { LOGIN_STORE, PgLoginStore } from './repositories/login.store';
import {
  APPLE_AUTH_CLIENT,
  HttpAppleAuthClient,
} from './social/apple-auth.client';
import {
  OidcSocialTokenVerifier,
  remoteOidcConfigs,
} from './social/oidc-token-verifier';
import { withDevTestLogin } from './social/dev-test-login';
import { SOCIAL_TOKEN_VERIFIER } from './social/social-identity';
import { TokenIssuer } from './tokens/token-issuer';
import { LogoutUseCase } from './usecases/logout.usecase';
import { RefreshTokenUseCase } from './usecases/refresh-token.usecase';
import { SocialLoginUseCase } from './usecases/social-login.usecase';
import { PgSessionStore, SESSION_STORE } from './repositories/session.store';

type Config = ConfigService<EnvironmentVariables, true>;

@Module({
  imports: [TermsModule],
  controllers: [AuthController],
  providers: [
    SocialLoginUseCase,
    RefreshTokenUseCase,
    LogoutUseCase,
    { provide: LOGIN_STORE, useClass: PgLoginStore },
    { provide: SESSION_STORE, useClass: PgSessionStore },
    {
      provide: SOCIAL_TOKEN_VERIFIER,
      inject: [ConfigService],
      useFactory: (config: Config) =>
        withDevTestLogin(
          new OidcSocialTokenVerifier(
            remoteOidcConfigs({
              APPLE_CLIENT_ID: config.get('APPLE_CLIENT_ID', { infer: true }),
              GOOGLE_CLIENT_IDS: config.get('GOOGLE_CLIENT_IDS', {
                infer: true,
              }),
              KAKAO_APP_KEYS: config.get('KAKAO_APP_KEYS', { infer: true }),
            }),
          ),
          // 개발 전용. 운영에서는 env 검증이 켜지 못하게 막는다
          config.get('DEV_TEST_LOGIN', { infer: true }),
        ),
    },
    {
      provide: APPLE_AUTH_CLIENT,
      inject: [ConfigService],
      useFactory: (config: Config) =>
        new HttpAppleAuthClient({
          teamId: config.get('APPLE_TEAM_ID', { infer: true }),
          keyId: config.get('APPLE_KEY_ID', { infer: true }),
          privateKeyPem: config.get('APPLE_PRIVATE_KEY', { infer: true }),
          clientId: config.get('APPLE_CLIENT_ID', { infer: true }),
        }),
    },
    {
      provide: TokenCipher,
      inject: [ConfigService],
      useFactory: (config: Config) =>
        new TokenCipher(config.get('TOKEN_ENCRYPTION_KEY', { infer: true })),
    },
    {
      provide: TokenIssuer,
      inject: [ConfigService],
      useFactory: (config: Config) =>
        new TokenIssuer(config.get('JWT_ACCESS_SECRET', { infer: true })),
    },
  ],
})
export class AuthModule {}
