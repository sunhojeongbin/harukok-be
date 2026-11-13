import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

/** UI 는 /docs, OpenAPI JSON 은 /docs-json. 전역 prefix(/api 등)와 겹치지 않는다. */
export const SWAGGER_PATH = 'docs';

/** 운영에서는 API 구조를 노출하지 않는다. */
export function isSwaggerEnabled(nodeEnv: string | undefined): boolean {
  return nodeEnv !== 'production';
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
