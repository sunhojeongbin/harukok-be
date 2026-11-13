import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './common/config/env.validation';
import { DatabaseModule } from './common/database/database.module';
import { HealthModule } from './modules/health/health.module';

@Module({
  imports: [
    // .env 는 main.ts 가 읽는다. 모듈은 process.env 만 보므로 테스트가 .env 에 영향받지 않는다.
    ConfigModule.forRoot({
      isGlobal: true,
      ignoreEnvFile: true,
      validate: validateEnv,
    }),
    DatabaseModule,
    HealthModule,
  ],
})
export class AppModule {}
