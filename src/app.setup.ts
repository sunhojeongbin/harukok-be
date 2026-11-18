import { INestApplication, ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { BusinessException } from './common/errors/business.exception';
import { CommonErrors } from './common/errors/common.errors';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';

/** main.ts 와 e2e 가 같은 전역 설정을 쓰도록 한 곳에 모은다. */
export function configureApp(app: INestApplication): void {
  // 보안 헤더 + X-Powered-By 제거 (보안 점검 #8). JSON API 라 CSP 는 끈다 — 켜면 Swagger UI 의 인라인 스크립트가 막힌다
  app.use(helmet({ contentSecurityPolicy: false }));
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: () =>
        new BusinessException(CommonErrors.VALIDATION_FAILED),
    }),
  );
  app.useGlobalFilters(new GlobalExceptionFilter());
  app.enableShutdownHooks();
}
