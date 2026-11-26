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
    Record<
      string,
      {
        responses: Record<string, unknown>;
        tags?: string[];
        security?: Record<string, string[]>[];
        parameters?: { name: string; in: string; description?: string }[];
      }
    >
  >;
  components: {
    securitySchemes?: Record<string, { scheme?: string }>;
    schemas?: Record<
      string,
      { properties?: Record<string, { description?: string }> }
    >;
  };
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

    it('GET /terms 를 terms 태그와 200·404 응답으로 담는다', () => {
      const terms = doc.paths['/terms']?.get;

      expect(terms?.tags).toEqual(['terms']);
      expect(Object.keys(terms?.responses ?? {}).sort()).toEqual([
        '200',
        '404',
      ]);
    });

    it('POST /auth/social/login 을 auth 태그와 200·400·401 응답으로 담는다', () => {
      const login = doc.paths['/auth/social/login']?.post;

      expect(login?.tags).toEqual(['auth']);
      expect(Object.keys(login?.responses ?? {}).sort()).toEqual([
        '200',
        '400',
        '401',
      ]);
    });

    it('POST /auth/token/refresh 는 200·400·401, 인증 없음', () => {
      const refresh = doc.paths['/auth/token/refresh']?.post;

      expect(refresh?.tags).toEqual(['auth']);
      expect(Object.keys(refresh?.responses ?? {}).sort()).toEqual([
        '200',
        '400',
        '401',
      ]);
      expect(refresh?.security).toBeUndefined();
    });

    it('POST /auth/logout 은 204·400·401 이고 Bearer 를 요구한다', () => {
      const logout = doc.paths['/auth/logout']?.post;

      expect(logout?.tags).toEqual(['auth']);
      expect(Object.keys(logout?.responses ?? {}).sort()).toEqual([
        '204',
        '400',
        '401',
      ]);
      expect(logout?.security).toEqual([{ bearer: [] }]);
    });

    it('GET·DELETE /users/me 는 users 태그, Bearer 필요, 401·404 를 담는다', () => {
      const get = doc.paths['/users/me']?.get;
      const del = doc.paths['/users/me']?.delete;

      expect(get?.tags).toEqual(['users']);
      expect(Object.keys(get?.responses ?? {}).sort()).toEqual([
        '200',
        '401',
        '404',
      ]);
      expect(get?.security).toEqual([{ bearer: [] }]);
      expect(del?.tags).toEqual(['users']);
      expect(Object.keys(del?.responses ?? {}).sort()).toEqual([
        '204',
        '401',
        '404',
      ]);
      expect(del?.security).toEqual([{ bearer: [] }]);
    });

    it('GET /todos/stats 200 응답 예시는 날짜 3개짜리 배열이다 (할 일이 없는 날 0 · 0 포함)', () => {
      const ok = doc.paths['/todos/stats']?.get?.responses['200'] as
        { content?: Record<string, { example?: unknown }> } | undefined;

      expect(ok?.content?.['application/json']?.example).toEqual([
        { date: '2026-11-22', totalCount: 2, completedCount: 1 },
        { date: '2026-11-23', totalCount: 0, completedCount: 0 },
        { date: '2026-11-24', totalCount: 3, completedCount: 3 },
      ]);
    });

    // 앱 개발자가 Swagger 만 보고 값의 의미를 알 수 있게 — 설명이 빠진 필드 · 파라미터가 없어야 한다
    it('모든 DTO 필드에 한 줄 설명이 있다', () => {
      const missing = Object.entries(doc.components.schemas ?? {}).flatMap(
        ([schema, { properties }]) =>
          Object.entries(properties ?? {})
            .filter(([, prop]) => !prop.description?.trim())
            .map(([field]) => `${schema}.${field}`),
      );
      const multiLine = Object.entries(doc.components.schemas ?? {}).flatMap(
        ([schema, { properties }]) =>
          Object.entries(properties ?? {})
            .filter(([, prop]) => prop.description?.includes('\n'))
            .map(([field]) => `${schema}.${field}`),
      );

      expect({ missing, multiLine }).toEqual({ missing: [], multiLine: [] });
    });

    it('모든 경로 · 쿼리 파라미터에 설명이 있다', () => {
      const missing = Object.entries(doc.paths).flatMap(([path, ops]) =>
        Object.entries(ops).flatMap(([method, op]) =>
          (op.parameters ?? [])
            .filter((p) => !p.description?.trim())
            .map((p) => `${method.toUpperCase()} ${path} ${p.in}:${p.name}`),
        ),
      );

      expect(missing).toEqual([]);
    });

    it('날짜 필드는 정한 설명을 쓴다', () => {
      const props = (schema: string) =>
        doc.components.schemas?.[schema]?.properties ?? {};
      const param = (path: string, name: string) =>
        doc.paths[path]?.get?.parameters?.find((p) => p.name === name)
          ?.description;

      expect({
        date: param('/todos', 'date'),
        createDueDate: props('CreateTodoDto').dueDate?.description,
        startDate: param('/todos/stats', 'startDate'),
        endDate: param('/todos/stats', 'endDate'),
        title: props('CreateTodoDto').title?.description,
        updateTitle: props('UpdateTodoDto').title?.description,
      }).toEqual({
        date: '할 일 목록 조회 날짜',
        createDueDate: '할 일 등록 날짜',
        startDate: '할 일 조회 시작 날짜(YYYY-MM-DD)',
        endDate: '할 일 조회 마지막 날짜(YYYY-MM-DD)',
        title: '할 일 제목(HTML 제거 후 1~250자, 공백 거부)',
        updateTitle: '할 일 제목(HTML 제거 후 1~250자, 공백 거부)',
      });
    });

    it('Bearer 인증 스키마를 등록한다', () => {
      expect(doc.components.securitySchemes?.bearer?.scheme).toBe('bearer');
    });
  });
});
