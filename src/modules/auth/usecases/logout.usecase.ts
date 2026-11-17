import { Inject, Injectable } from '@nestjs/common';
import { BusinessException } from '../../../common/errors/business.exception';
import type { SessionRequestDto } from '../dto/session.dto';
import { AuthErrors } from '../errors/auth.errors';
import {
  SESSION_STORE,
  type SessionStore,
} from '../repositories/session.store';
import { TokenIssuer } from '../tokens/token-issuer';

/** POST /auth/logout — API 설계서 4장 3번 */
@Injectable()
export class LogoutUseCase {
  constructor(@Inject(SESSION_STORE) private readonly store: SessionStore) {}

  async execute(userId: string, request: SessionRequestDto): Promise<void> {
    const result = await this.store.logout({
      userId,
      tokenHash: TokenIssuer.hashRefreshToken(request.refreshToken),
      deviceId: request.deviceId,
    });
    if (result === 'INVALID') {
      throw new BusinessException(AuthErrors.REFRESH_TOKEN_INVALID);
    }
  }
}
