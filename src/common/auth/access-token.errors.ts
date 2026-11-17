import { HttpStatus } from '@nestjs/common';
import type { ErrorDefinition } from '../errors/business.exception';

/** Bearer 가드는 여러 도메인(4·5단위)이 같이 쓰므로 common 에 둔다 */
export const AccessTokenErrors = {
  ACCESS_TOKEN_INVALID: {
    code: 'ACCESS_TOKEN_INVALID',
    status: HttpStatus.UNAUTHORIZED,
    message: '액세스 토큰이 없거나 유효하지 않습니다.',
  },
} as const satisfies Record<string, ErrorDefinition>;
