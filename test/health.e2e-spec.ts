import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { configureApp } from '../src/app.setup';
import { AppModule } from '../src/app.module';

describe('GET /health (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('DB 가 살아 있으면 200 { status: ok, db: up }', async () => {
    const res = await request(app.getHttpServer()).get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', db: 'up' });
  });

  it('없는 경로는 404 { code: NOT_FOUND }', async () => {
    const res = await request(app.getHttpServer()).get('/no-such-path');

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ code: 'NOT_FOUND' });
  });

  // 연결을 끊으므로 마지막에 둔다.
  it('DB 연결이 끊기면 503 { code: DB_UNAVAILABLE }', async () => {
    await app.get(DataSource).destroy();

    const res = await request(app.getHttpServer()).get('/health');

    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ code: 'DB_UNAVAILABLE' });
  });
});
