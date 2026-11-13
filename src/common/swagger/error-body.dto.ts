import { ApiProperty } from '@nestjs/swagger';
import type { ErrorBody } from '../errors/business.exception';

/** 모든 오류 응답 형식 (GlobalExceptionFilter). Swagger 문서용. */
export class ErrorBodyDto implements ErrorBody {
  @ApiProperty({ example: 'VALIDATION_FAILED' })
  code: string;

  @ApiProperty({ example: '요청 값이 올바르지 않습니다.' })
  message: string;
}
