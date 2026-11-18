import { HttpStatus } from '@nestjs/common';
import type { ErrorDefinition } from '../../../common/errors/business.exception';

/**
 * @description 할 일 모듈 오류 정의
 * @returns {Record<string, ErrorDefinition>}
 */
export const TodosErrors = {
  /** 없음 · 타인 소유 · 소프트 삭제 — 403 대신 404 로 통일해 존재 여부를 노출하지 않는다 (API 설계서 6-3) */
  TODO_NOT_FOUND: {
    code: 'TODO_NOT_FOUND',
    status: HttpStatus.NOT_FOUND,
    message: '할 일을 찾을 수 없습니다.',
  },
} as const satisfies Record<string, ErrorDefinition>;
