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
    // Express 미들웨어(body-parser 등)가 던지는 http-errors — 예: 본문 크기 초과 413.
    // 클라이언트 잘못이므로 그 상태로 응답하고 error 로그를 남기지 않는다 (누구나 로그를 쌓을 수 있게 두지 않는다, 보안 점검 #5)
    const clientError = asExposedClientError(exception);
    if (clientError) {
      if (clientError.status === 400) {
        const { code, message } = CommonErrors.VALIDATION_FAILED;
        return [400, { code, message }];
      }
      const code =
        (HttpStatus[clientError.status] as string | undefined) ?? 'HTTP_ERROR';
      return [clientError.status, { code, message: clientError.message }];
    }
    this.logger.error(
      '처리되지 않은 예외',
      exception instanceof Error ? exception.stack : String(exception),
    );
    const { status, code, message } = CommonErrors.INTERNAL_ERROR;
    return [status, { code, message }];
  }
}

/** http-errors 규약: expose=true 인 4xx 만 클라이언트에 그대로 보여도 되는 오류다 */
function asExposedClientError(
  exception: unknown,
): { status: number; message: string } | null {
  if (!(exception instanceof Error)) return null;
  const { status, expose } = exception as Error & {
    status?: unknown;
    expose?: unknown;
  };
  if (
    expose !== true ||
    typeof status !== 'number' ||
    status < 400 ||
    status > 499
  ) {
    return null;
  }
  return { status, message: exception.message };
}
