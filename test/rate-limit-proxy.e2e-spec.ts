// 보안 점검 #4 — 프록시 뒤(TRUST_PROXY=1)에서는 X-Forwarded-For 의 클라이언트 IP 별로 센다
import './e2e/rate-limit-behind-proxy'; // AppModule 보다 먼저
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';

describe('요청 제한 — 프록시 1단 뒤 (e2e)', () => {
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

  const hit = (clientIp: string) =>
    request(app.getHttpServer()).get('/terms').set('X-Forwarded-For', clientIp);

  it('클라이언트 IP 마다 따로 30번 — 한 사용자가 막혀도 다른 사용자는 통과', async () => {
    for (let i = 0; i < 30; i++) await hit('198.51.100.1');

    expect((await hit('198.51.100.1')).status).toBe(429);
    expect((await hit('198.51.100.2')).status).not.toBe(429);
  });
});
