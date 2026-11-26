import { ApiProperty } from '@nestjs/swagger';
import type { ErrorBody } from '../errors/business.exception';

/** 모든 오류 응답 형식 (GlobalExceptionFilter). Swagger 문서용. */
export class ErrorResponseDto implements ErrorBody {
  @ApiProperty({
    example: 'VALIDATION_FAILED',
    description: '오류 종류를 나타내는 고정 코드. 앱은 이 값으로 분기한다',
  })
  code: string;

  @ApiProperty({
    example: '요청 값이 올바르지 않습니다.',
    description: '사람이 읽는 오류 설명. 화면 문구로 그대로 쓰지 않는다',
  })
  message: string;
}
