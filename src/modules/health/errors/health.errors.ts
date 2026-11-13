import { HttpStatus } from '@nestjs/common';
import type { ErrorDefinition } from '../../../common/errors/business.exception';

export const HealthErrors = {
  DB_UNAVAILABLE: {
    code: 'DB_UNAVAILABLE',
    status: HttpStatus.SERVICE_UNAVAILABLE,
    message: '데이터베이스에 연결할 수 없습니다.',
  },
} as const satisfies Record<string, ErrorDefinition>;
