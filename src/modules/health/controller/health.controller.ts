import { Controller, Get } from '@nestjs/common';
import {
  CheckHealthUseCase,
  HealthResult,
} from '../usecases/check-health.usecase';

@Controller('health')
export class HealthController {
  constructor(private readonly checkHealth: CheckHealthUseCase) {}

  @Get()
  check(): Promise<HealthResult> {
    return this.checkHealth.execute();
  }
}
