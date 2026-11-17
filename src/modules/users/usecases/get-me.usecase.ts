import { Inject, Injectable } from '@nestjs/common';
import { BusinessException } from '../../../common/errors/business.exception';
import type { UserMeResponseDto } from '../dto/user-me.response.dto';
import { UsersErrors } from '../errors/users.errors';
import { USERS_STORE, type UsersStore } from '../repositories/users.store';

/** GET /users/me — API 설계서 4장 4번 */
@Injectable()
export class GetMeUseCase {
  constructor(@Inject(USERS_STORE) private readonly store: UsersStore) {}

  async execute(userId: string): Promise<UserMeResponseDto> {
    const profile = await this.store.findProfile(userId);
    // 액세스 토큰은 탈퇴 후에도 만료(1시간)까지 유효하다 — 사용자가 없으면 404
    if (!profile) throw new BusinessException(UsersErrors.USER_NOT_FOUND);
    return { ...profile, createdAt: profile.createdAt.toISOString() };
  }
}
