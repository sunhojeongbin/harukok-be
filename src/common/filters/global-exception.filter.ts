import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { BusinessException, ErrorBody } from '../errors/business.exception';
import { CommonErrors } from '../errors/common.errors';

/** 모든 오류를 { code, message } 로 응답한다. */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const [status, body] = this.toResponse(exception);
    res.status(status).json(body);
  }

  private toResponse(exception: unknown): [number, ErrorBody] {
    if (exception instanceof BusinessException) {
      const { status, code, message } = exception.definition;
      return [status, { code, message }];
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      if (status === 400) {
        const { code, message } = CommonErrors.VALIDATION_FAILED;
        return [status, { code, message }];
      }
      const code = (HttpStatus[status] as string | undefined) ?? 'HTTP_ERROR';
      return [status, { code, message: exception.message }];
    }
    this.logger.error(
      '처리되지 않은 예외',
      exception instanceof Error ? exception.stack : String(exception),
    );
    const { status, code, message } = CommonErrors.INTERNAL_ERROR;
    return [status, { code, message }];
  }
}
