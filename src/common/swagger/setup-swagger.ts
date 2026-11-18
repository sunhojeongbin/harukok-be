import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { isDevelopmentLike } from '../config/env.validation';

/** UI 는 /docs, OpenAPI JSON 은 /docs-json. 전역 prefix(/api 등)와 겹치지 않는다. */
export const SWAGGER_PATH = 'docs';

/** 개발 · 테스트에서만 켠다 — NODE_ENV 가 빠지거나 낯선 값이면 끈다 (보안 점검 #2) */
export function isSwaggerEnabled(nodeEnv: string | undefined): boolean {
  return isDevelopmentLike(nodeEnv);
}

export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('하루콕 API')
    .setVersion('v1')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup(SWAGGER_PATH, app, document);
}
