import { HttpStatus } from '@nestjs/common';
import type { ErrorDefinition } from '../../../common/errors/business.exception';

export const TermsErrors = {
  TERM_NOT_FOUND: {
    code: 'TERM_NOT_FOUND',
    status: HttpStatus.NOT_FOUND,
    message: '시행 중인 이용약관이 없습니다.',
  },
} as const satisfies Record<string, ErrorDefinition>;
