import { HttpException, HttpStatus } from '@nestjs/common';

export interface ErrorDefinition {
  code: string;
  status: HttpStatus;
  message: string;
}

export interface ErrorBody {
  code: string;
  message: string;
}

/** 업무 오류. 도메인별 errors/ 의 ErrorDefinition 을 넣어 던진다. */
export class BusinessException extends HttpException {
  constructor(readonly definition: ErrorDefinition) {
    const body: ErrorBody = {
      code: definition.code,
      message: definition.message,
    };
    super(body, definition.status);
  }
}
