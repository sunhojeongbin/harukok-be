// 개발 전용 테스트 로그인 (끔, 기본값) — 테스트 토큰이 통하지 않는지 실제 앱 구성으로 확인한다.
import './e2e/dev-test-login-off'; // AppModule 보다 먼저
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Client } from 'pg';
import request from 'supertest';
import type { App } from 'supertest/types';
import { seedTestAccount } from '../scripts/db-seed.cjs';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { DEV_TEST_ID_TOKEN } from '../src/modules/auth/social/dev-test-login';
import { testDatabaseUrl } from './e2e/test-db';

describe('개발 전용 테스트 로그인 — DEV_TEST_LOGIN 없음 (e2e)', () => {
  let app: INestApplication<App>;
  let db: Client;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    db = new Client({ connectionString: testDatabaseUrl() });
    await db.connect();
    await db.query('DELETE FROM users');
  });

  afterAll(async () => {
    await db.query('DELETE FROM users');
    await db.end();
    await app.close();
  });

  it('테스트 토큰은 401 SOCIAL_TOKEN_INVALID — 시드한 테스트 계정이 있어도 로그인되지 않는다', async () => {
    await seedTestAccount(db);

    const res = await request(app.getHttpServer())
      .post('/auth/social/login')
      .send({
        provider: 'GOOGLE',
        idToken: DEV_TEST_ID_TOKEN,
        deviceId: 'swagger',
      });

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ code: 'SOCIAL_TOKEN_INVALID' });
  });
});
