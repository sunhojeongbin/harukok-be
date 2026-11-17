import { HttpStatus } from '@nestjs/common';
import type { ErrorDefinition } from '../../../common/errors/business.exception';

export const AuthErrors = {
  SOCIAL_TOKEN_INVALID: {
    code: 'SOCIAL_TOKEN_INVALID',
    status: HttpStatus.UNAUTHORIZED,
    message: '소셜 로그인 토큰이 유효하지 않습니다.',
  },
} as const satisfies Record<string, ErrorDefinition>;
