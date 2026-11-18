import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import type { EnvironmentVariables } from './common/config/env.validation';
import { isSwaggerEnabled, setupSwagger } from './common/swagger/setup-swagger';

/**
 * @description 백엔드 서버 부트스트랩
 * @returns {Promise<void>}
 */
async function bootstrap(): Promise<void> {
  // NestFactory.create() 에서 에러 발생 시, NestJS 내부에서 process.exit(1) 호출하므로, 여기서도 동일하게 처리
  const app = await NestFactory.create(AppModule, {
    abortOnError: false,
  });

  const config = app.get(ConfigService<EnvironmentVariables, true>);
  configureApp(app);

  const nodeEnv = config.get('NODE_ENV', { infer: true });
  const port = config.get('PORT', { infer: true });

  if (isSwaggerEnabled(nodeEnv)) {
    setupSwagger(app);
  }

  await app.listen(port);

  Logger.log(`Application started on port ${port} (${nodeEnv})`, 'Bootstrap');
}

void bootstrap().catch(() => {
  // NestFactory.create() 에서 에러 발생 시, NestJS 내부에서 process.exit(1) 호출하므로, 여기서도 동일하게 처리
  Logger.error('Application bootstrap failed', 'Bootstrap');
  process.exit(1);
});
