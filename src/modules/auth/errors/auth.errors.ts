import { HttpStatus } from '@nestjs/common';
import type { ErrorDefinition } from '../../../common/errors/business.exception';

export const AuthErrors = {
  SOCIAL_TOKEN_INVALID: {
    code: 'SOCIAL_TOKEN_INVALID',
    status: HttpStatus.UNAUTHORIZED,
    message: '소셜 로그인 토큰이 유효하지 않습니다.',
  },
  REFRESH_TOKEN_INVALID: {
    code: 'REFRESH_TOKEN_INVALID',
    status: HttpStatus.UNAUTHORIZED,
    message: '리프레시 토큰이 유효하지 않습니다.',
  },
  REFRESH_TOKEN_REVOKED: {
    code: 'REFRESH_TOKEN_REVOKED',
    status: HttpStatus.UNAUTHORIZED,
    message: '폐기된 리프레시 토큰입니다. 다시 로그인해 주세요.',
  },
  REFRESH_TOKEN_EXPIRED: {
    code: 'REFRESH_TOKEN_EXPIRED',
    status: HttpStatus.UNAUTHORIZED,
    message: '만료된 리프레시 토큰입니다. 다시 로그인해 주세요.',
  },
} as const satisfies Record<string, ErrorDefinition>;
