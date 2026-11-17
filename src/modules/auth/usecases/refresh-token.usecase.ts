import { Inject, Injectable } from '@nestjs/common';
import { BusinessException } from '../../../common/errors/business.exception';
import type {
  RefreshTokenResponseDto,
  SessionRequestDto,
} from '../dto/session.dto';
import { AuthErrors } from '../errors/auth.errors';
import {
  type RefreshJudgement,
  SESSION_STORE,
  type SessionStore,
} from '../repositories/session.store';
import { TokenIssuer } from '../tokens/token-issuer';

const ERROR_BY_OUTCOME = {
  INVALID: AuthErrors.REFRESH_TOKEN_INVALID,
  REVOKED: AuthErrors.REFRESH_TOKEN_REVOKED,
  EXPIRED: AuthErrors.REFRESH_TOKEN_EXPIRED,
} as const satisfies Record<Exclude<RefreshJudgement, 'OK'>, unknown>;

/** POST /auth/token/refresh — API 설계서 4장 2번 */
@Injectable()
export class RefreshTokenUseCase {
  constructor(
    @Inject(SESSION_STORE) private readonly store: SessionStore,
    private readonly tokens: TokenIssuer,
  ) {}

  async execute(request: SessionRequestDto): Promise<RefreshTokenResponseDto> {
    const next = this.tokens.newRefreshToken();
    const result = await this.store.rotate({
      tokenHash: TokenIssuer.hashRefreshToken(request.refreshToken),
      deviceId: request.deviceId,
      newTokenHash: next.hash,
    });
    if (result.outcome !== 'OK') {
      throw new BusinessException(ERROR_BY_OUTCOME[result.outcome]);
    }
    return {
      accessToken: await this.tokens.issueAccessToken(result.userId),
      refreshToken: next.token,
    };
  }
}
