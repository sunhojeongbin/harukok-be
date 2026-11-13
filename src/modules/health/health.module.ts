import { Module } from '@nestjs/common';
import { HealthController } from './controller/health.controller';
import { CheckHealthUseCase } from './usecases/check-health.usecase';

@Module({
  controllers: [HealthController],
  providers: [CheckHealthUseCase],
})
export class HealthModule {}
