import { HttpException, HttpStatus } from '@nestjs/common';

// 비즈니스 오류 정의. 도메인별 errors/ 의 ErrorDefinition 을 넣어 던진다.
export interface ErrorDefinition {
  code: string;
  status: HttpStatus;
  message: string;
}

// 비즈니스 오류 바디 정의. ErrorDefinition 을 기반으로 NestJS HttpException 에 넣어 던진다.
export interface ErrorBody {
  code: string;
  message: string;
}

/**
 * @description 업무 오류. 도메인별 errors/ 의 ErrorDefinition 을 넣어 던진다.
 * @returns {BusinessException}
 */
export class BusinessException extends HttpException {
  constructor(readonly definition: ErrorDefinition) {
    const body: ErrorBody = {
      code: definition.code,
      message: definition.message,
    };
    super(body, definition.status);
  }
}
