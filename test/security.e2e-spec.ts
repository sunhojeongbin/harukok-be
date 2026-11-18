// 보안 점검 #5 · #8 — 응답 헤더와 본문 크기 초과 처리
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';

describe('보안 헤더 · 요청 처리 (e2e)', () => {
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

  it('X-Powered-By 로 서버 프레임워크를 알리지 않는다', async () => {
    const res = await request(app.getHttpServer()).get('/health');

    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('보안 헤더를 붙인다 (nosniff · frame 차단 · HSTS)', async () => {
    const res = await request(app.getHttpServer()).get('/health');

    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(res.headers['strict-transport-security']).toMatch(/max-age=/);
  });

  it('본문이 100KB 를 넘으면 500 이 아니라 413 { code: PAYLOAD_TOO_LARGE }', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/social/login')
      .send({
        provider: 'GOOGLE',
        idToken: 'a'.repeat(200_000),
        deviceId: 'd',
      });

    expect(res.status).toBe(413);
    expect(res.body).toMatchObject({ code: 'PAYLOAD_TOO_LARGE' });
  });

  it('깨진 JSON 은 400 VALIDATION_FAILED (그대로)', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/social/login')
      .set('content-type', 'application/json')
      .send('{"provider":');

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: 'VALIDATION_FAILED' });
  });
});
