import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { setupSwagger } from '../src/common/swagger/setup-swagger';

interface OpenApiDoc {
  info: { title: string };
  paths: Record<
    string,
    Record<string, { responses: Record<string, unknown>; tags?: string[] }>
  >;
  components: { securitySchemes?: Record<string, { scheme?: string }> };
}

describe('Swagger /docs (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    setupSwagger(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /docs 는 Swagger UI 를 돌려준다', async () => {
    const res = await request(app.getHttpServer()).get('/docs').redirects(1);

    expect(res.status).toBe(200);
    expect(res.text).toContain('swagger-ui');
  });

  describe('GET /docs-json', () => {
    let doc: OpenApiDoc;

    beforeAll(async () => {
      const res = await request(app.getHttpServer()).get('/docs-json');
      expect(res.status).toBe(200);
      doc = res.body as OpenApiDoc;
    });

    it('제목이 하루콕 API 다', () => {
      expect(doc.info.title).toBe('하루콕 API');
    });

    it('GET /health 의 200·503 응답과 태그를 담는다', () => {
      const health = doc.paths['/health']?.get;

      expect(health?.tags).toEqual(['health']);
      expect(Object.keys(health?.responses ?? {}).sort()).toEqual([
        '200',
        '503',
      ]);
    });

    it('Bearer 인증 스키마를 등록한다', () => {
      expect(doc.components.securitySchemes?.bearer?.scheme).toBe('bearer');
    });
  });
});
