import { Controller, Get } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ErrorResponseDto } from '../../../common/swagger/error-response.dto';
import { HealthResponseDto } from '../dto/health-response.dto';
import {
  CheckHealthUseCase,
  HealthResult,
} from '../usecases/check-health.usecase';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly checkHealth: CheckHealthUseCase) {}

  @Get()
  @ApiOperation({ summary: '헬스체크 (DB 연결 포함)' })
  @ApiOkResponse({ type: HealthResponseDto })
  @ApiServiceUnavailableResponse({
    type: ErrorResponseDto,
    description: 'DB_UNAVAILABLE — DB 오류 또는 2초 초과',
  })
  check(): Promise<HealthResult> {
    return this.checkHealth.execute();
  }
}
