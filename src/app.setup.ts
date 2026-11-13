import { INestApplication, ValidationPipe } from '@nestjs/common';
import { BusinessException } from './common/errors/business.exception';
import { CommonErrors } from './common/errors/common.errors';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';

/** main.ts 와 e2e 가 같은 전역 설정을 쓰도록 한 곳에 모은다. */
export function configureApp(app: INestApplication): void {
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
