import { Inject, Injectable, Logger } from '@nestjs/common';
import { TokenCipher } from '../../../common/crypto/token-cipher';
import { BusinessException } from '../../../common/errors/business.exception';
import {
  APPLE_REVOKE_CLIENT,
  type AppleRevokeClient,
} from '../../auth/social/apple-auth.client';
import {
  KAKAO_UNLINK_CLIENT,
  type KakaoUnlinkClient,
} from '../../auth/social/kakao-unlink.client';
import { UsersErrors } from '../errors/users.errors';
import {
  type LinkedAccount,
  USERS_STORE,
  type UsersStore,
} from '../repositories/users.store';

/** DELETE /users/me — API 설계서 4장 5번. 연동 해제 → users 삭제 (순서를 뒤집지 않는다) */
@Injectable()
export class WithdrawUseCase {
  private readonly logger = new Logger(WithdrawUseCase.name);

  constructor(
    @Inject(USERS_STORE) private readonly store: UsersStore,
    @Inject(APPLE_REVOKE_CLIENT) private readonly apple: AppleRevokeClient,
    @Inject(KAKAO_UNLINK_CLIENT) private readonly kakao: KakaoUnlinkClient,
    private readonly cipher: TokenCipher,
  ) {}

  async execute(userId: string): Promise<void> {
    // 1. 연결된 제공자 목록 — users 를 먼저 지우면 CASCADE 로 해제 대상(토큰 · 회원번호)을 잃는다
    const accounts = await this.store.findLinkedAccounts(userId);
    if (!accounts) throw new BusinessException(UsersErrors.USER_NOT_FOUND);
    // 2. 제공자별 연동 해제 — 실패해도 탈퇴를 막지 않는다 (Apple 요구 · 심사 요건 5.1.1(v))
    for (const account of accounts) await this.unlink(userId, account);
    // 3. users 1행 삭제 → CASCADE 로 전부 파기
    if (!(await this.store.deleteUser(userId))) {
      throw new BusinessException(UsersErrors.USER_NOT_FOUND);
    }
  }

  /** 로그에는 사용자ID · 제공자 · 오류 요약만 남긴다 (토큰 · 키 값은 넣지 않는다) */
  private async unlink(userId: string, account: LinkedAccount): Promise<void> {
    try {
      if (account.provider === 'APPLE') {
        if (!account.appleRefreshTokenEnc) {
          this.logger.warn(
            `탈퇴 ${userId}: 저장된 애플 토큰이 없어 revoke 를 건너뛴다 — 사용자가 애플 설정에서 직접 해제해야 한다 (TN3194 수동 경로)`,
          );
          return;
        }
        await this.apple.revoke(
          this.cipher.decrypt(account.appleRefreshTokenEnc),
        );
      } else if (account.provider === 'KAKAO') {
        await this.kakao.unlink(account.providerUserId);
      }
      // GOOGLE: 앱이 탈퇴 호출 전에 SDK disconnect() 를 한다 — 서버는 할 일이 없다
    } catch (error) {
      this.logger.error(
        `탈퇴 ${userId}: ${account.provider} 연동 해제 실패 — 삭제는 진행한다`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }
}
