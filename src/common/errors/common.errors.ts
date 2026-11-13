import { HttpStatus } from '@nestjs/common';
import type { ErrorDefinition } from './business.exception';

export const CommonErrors = {
  VALIDATION_FAILED: {
    code: 'VALIDATION_FAILED',
    status: HttpStatus.BAD_REQUEST,
    message: '요청 값이 올바르지 않습니다.',
  },
  INTERNAL_ERROR: {
    code: 'INTERNAL_ERROR',
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    message: '서버 오류가 발생했습니다.',
  },
} as const satisfies Record<string, ErrorDefinition>;
