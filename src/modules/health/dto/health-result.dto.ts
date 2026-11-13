import { ApiProperty } from '@nestjs/swagger';
import type { HealthResult } from '../usecases/check-health.usecase';

export class HealthResultDto implements HealthResult {
  @ApiProperty({ enum: ['ok'] })
  status: 'ok';

  @ApiProperty({ enum: ['up'] })
  db: 'up';
}
