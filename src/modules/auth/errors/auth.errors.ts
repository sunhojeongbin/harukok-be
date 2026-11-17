import { HttpStatus } from '@nestjs/common';
import type { ErrorDefinition } from '../../../common/errors/business.exception';

export const AuthErrors = {
  SOCIAL_TOKEN_INVALID: {
    code: 'SOCIAL_TOKEN_INVALID',
    status: HttpStatus.UNAUTHORIZED,
    message: '소셜 로그인 토큰이 유효하지 않습니다.',
  },
  TERMS_AGREEMENT_REQUIRED: {
    code: 'TERMS_AGREEMENT_REQUIRED',
    status: HttpStatus.BAD_REQUEST,
    message: '신규 가입에는 현행 이용약관 동의가 필요합니다.',
  },
} as const satisfies Record<string, ErrorDefinition>;
