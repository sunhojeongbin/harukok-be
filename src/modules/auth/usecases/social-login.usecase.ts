import { Inject, Injectable, Logger } from '@nestjs/common';
import { TokenCipher } from '../../../common/crypto/token-cipher';
import { BusinessException } from '../../../common/errors/business.exception';
import { TermsErrors } from '../../terms/errors/terms.errors';
import { GetCurrentTermsUseCase } from '../../terms/usecases/get-current-terms.usecase';
import type { SocialLoginRequestDto } from '../dto/social-login.request.dto';
import { SocialLoginResponseDto } from '../dto/social-login.response.dto';
import { LOGIN_STORE, type LoginStore } from '../repositories/login.store';
import {
  APPLE_AUTH_CLIENT,
  type AppleAuthClient,
} from '../social/apple-auth.client';
import { normalizeEmail, normalizeName } from '../social/profile';
import {
  SOCIAL_TOKEN_VERIFIER,
  type SocialTokenVerifier,
} from '../social/social-identity';
import { TokenIssuer } from '../tokens/token-issuer';

/** POST /auth/social/login — API 설계서 4장 1번 */
@Injectable()
export class SocialLoginUseCase {
  private readonly logger = new Logger(SocialLoginUseCase.name);

  constructor(
    @Inject(SOCIAL_TOKEN_VERIFIER)
    private readonly verifier: SocialTokenVerifier,
    @Inject(APPLE_AUTH_CLIENT) private readonly apple: AppleAuthClient,
    @Inject(LOGIN_STORE) private readonly store: LoginStore,
    private readonly currentTerms: GetCurrentTermsUseCase,
    private readonly cipher: TokenCipher,
    private readonly tokens: TokenIssuer,
  ) {}

  async execute(
    request: SocialLoginRequestDto,
  ): Promise<SocialLoginResponseDto> {
    // 1. idToken 검증
    const identity = await this.verifier.verify(
      request.provider,
      request.idToken,
    );
    // 2. 현행 이용약관 — 신규 가입이면 자동 동의, 이력이 없는 기존 사용자면 보충 (판정은 트랜잭션 안에서)
    const currentTermId = await this.currentTermIdOrNull();
    // 3. 애플만 — DB 트랜잭션 전에 교환한다 (트랜잭션을 연 채 외부 호출을 기다리지 않는다)
    const appleRefreshTokenEnc =
      request.provider === 'APPLE'
        ? await this.exchangeAppleCode(request.authorizationCode ?? '')
        : null;
    // 4~6. 신규 판정 · 가입(이메일·이름 정규화) · 약관 동의 기록 · 기기 토큰 — 한 트랜잭션
    const refresh = this.tokens.newRefreshToken();
    const result = await this.store.login({
      provider: request.provider,
      providerUserId: identity.providerUserId,
      email: normalizeEmail(identity.email),
      // 애플은 이름을 토큰에 넣지 않고 최초 인가 때 SDK 로만 준다 → 요청 name
      name: normalizeName(
        request.provider === 'APPLE' ? request.name : identity.name,
      ),
      currentTermId,
      appleRefreshTokenEnc,
      deviceId: request.deviceId,
      refreshTokenHash: refresh.hash,
    });
    return {
      accessToken: await this.tokens.issueAccessToken(result.userId),
      refreshToken: refresh.token,
      isNewUser: result.isNewUser,
      user: {
        id: result.userId,
        name: result.name,
        providers: result.providers,
      },
    };
  }

  /** 시행 중인 약관이 없어도 가입을 막지 않는다 — 기록 없이 진행하고, 다음 로그인 때 보충된다 */
  private async currentTermIdOrNull(): Promise<string | null> {
    try {
      return (await this.currentTerms.execute()).id;
    } catch (error) {
      if (
        error instanceof BusinessException &&
        error.definition.code === TermsErrors.TERM_NOT_FOUND.code
      ) {
        this.logger.error(
          '시행 중인 이용약관이 없어 약관 동의를 기록하지 못했다 — 약관을 등록하면 다음 로그인 때 보충된다',
        );
        return null;
      }
      throw error;
    }
  }

  /** 실패해도 로그인은 진행한다 — 그 사용자는 탈퇴 시 수동 revoke 경로가 되므로 반드시 에러로 남긴다 */
  private async exchangeAppleCode(code: string): Promise<Buffer | null> {
    try {
      return this.cipher.encrypt(await this.apple.exchangeCode(code));
    } catch (error) {
      this.logger.error(
        '애플 authorizationCode 교환 실패 — provider_refresh_token_enc 를 비워 둔다 (탈퇴 시 수동 revoke)',
        error instanceof Error ? error.message : String(error),
      );
      return null;
    }
  }
}
