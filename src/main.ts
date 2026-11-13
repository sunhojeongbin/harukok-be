import { existsSync } from 'node:fs';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { configureApp } from './app.setup';
import type { EnvironmentVariables } from './common/config/env.validation';

async function bootstrap() {
  // 로컬 개발용. 이미 설정된 환경변수(운영·CI)는 덮어쓰지 않는다.
  if (existsSync('.env')) process.loadEnvFile('.env');

  // AppModule 은 import 시점에 환경변수를 검증하므로 .env 를 읽은 뒤 불러온다.
  const { AppModule } = await import('./app.module.js');
  const app = await NestFactory.create(AppModule);
  configureApp(app);
  const config = app.get(ConfigService<EnvironmentVariables, true>);
  await app.listen(config.get('PORT', { infer: true }));
}
void bootstrap();
