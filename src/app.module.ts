import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import {
  type EnvironmentVariables,
  validateEnv,
} from './common/config/env.validation';
import { DatabaseModule } from './common/database/database.module';
import { AuthModule } from './modules/auth/auth.module';
import { BatchModule } from './modules/batch/batch.module';
import { HealthModule } from './modules/health/health.module';
import { TermsModule } from './modules/terms/terms.module';
import { TodosModule } from './modules/todos/todos.module';
import { UsersModule } from './modules/users/users.module';

@Module({
  imports: [
    // .env 는 nest start --env-file 이 읽는다. 모듈은 process.env 만 보므로 테스트가 .env 에 영향받지 않는다.
    ConfigModule.forRoot({
      isGlobal: true,
      ignoreEnvFile: true,
      validate: validateEnv,
    }),
    // 같은 IP 1분 RATE_LIMIT_PER_MINUTE 회 (기본 30). /health 는 @SkipThrottle (보안 점검 #4)
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvironmentVariables, true>) => ({
        throttlers: [
          {
            ttl: 60_000,
            limit: config.get('RATE_LIMIT_PER_MINUTE', { infer: true }),
          },
        ],
        errorMessage: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.',
        // 기본 키는 '경로 + IP' 라 경로마다 따로 센다. 같은 IP 의 전체 API 를 함께 세도록 경로를 뺀다
        generateKey: (_context, tracker, throttlerName) =>
          `${throttlerName}:${tracker}`,
      }),
    }),
    DatabaseModule,
    HealthModule,
    TermsModule,
    AuthModule,
    UsersModule,
    TodosModule,
    BatchModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
