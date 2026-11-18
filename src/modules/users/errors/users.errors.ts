import { HttpStatus } from '@nestjs/common';
import type { ErrorDefinition } from '../../../common/errors/business.exception';

/**
 * @description 사용자 모듈 오류 정의
 * @returns {Record<string, ErrorDefinition>}
 */
export const UsersErrors = {
  /** 탈퇴 후 남은 액세스 토큰(최대 1시간) 사용 — API 설계서 6-3 */
  USER_NOT_FOUND: {
    code: 'USER_NOT_FOUND',
    status: HttpStatus.NOT_FOUND,
    message: '사용자를 찾을 수 없습니다.',
  },
} as const satisfies Record<string, ErrorDefinition>;
