// 보안 점검 #4 — 같은 IP 는 1분에 30번 (전체 API, /health 제외). 프록시 설정 없음(기본)
import './e2e/rate-limit-default'; // AppModule 보다 먼저
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';

describe('요청 제한 — 같은 IP 1분 30회 (e2e)', () => {
  let app: INestApplication<App>;

  // 제한 카운터는 앱(메모리)마다 따로라서 테스트마다 새 앱을 띄운다
  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  const hit = (path: string, forwardedFor?: string) => {
    const req = request(app.getHttpServer()).get(path);
    return forwardedFor ? req.set('X-Forwarded-For', forwardedFor) : req;
  };

  it('30번까지는 통과하고 31번째는 429 { code: TOO_MANY_REQUESTS } + Retry-After', async () => {
    for (let i = 0; i < 30; i++) {
      expect((await hit('/terms')).status).not.toBe(429);
    }

    const blocked = await hit('/terms');

    expect(blocked.status).toBe(429);
    expect(blocked.body).toMatchObject({ code: 'TOO_MANY_REQUESTS' });
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('제한은 API 전체에 함께 걸린다 (다른 경로로 바꿔도 31번째는 429)', async () => {
    for (let i = 0; i < 15; i++) await hit('/terms');
    for (let i = 0; i < 15; i++) await hit('/todos?date=2026-11-18');

    // 가드는 경로가 있을 때만 돈다 — 실제 경로(POST)로 확인
    const refresh = await request(app.getHttpServer())
      .post('/auth/token/refresh')
      .send({});

    expect(refresh.status).toBe(429);
  });

  it('/health 는 제한하지 않는다 (로드밸런서 헬스체크)', async () => {
    for (let i = 0; i < 40; i++) {
      expect((await hit('/health')).status).toBe(200);
    }
  });

  it('프록시 설정이 없으면 X-Forwarded-For 를 바꿔도 제한을 피할 수 없다', async () => {
    for (let i = 0; i < 30; i++) await hit('/terms', `198.51.100.${i}`);

    expect((await hit('/terms', '203.0.113.99')).status).toBe(429);
  });
});
