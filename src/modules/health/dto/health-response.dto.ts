import { ApiProperty } from '@nestjs/swagger';
import type { HealthResult } from '../usecases/check-health.usecase';

export class HealthResponseDto implements HealthResult {
  @ApiProperty({
    enum: ['ok'],
    description: '서버가 요청을 처리할 수 있으면 ok',
  })
  status: 'ok';

  @ApiProperty({ enum: ['up'], description: 'DB 연결이 정상이면 up' })
  db: 'up';
}
