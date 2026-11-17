// 개발 전용 테스트 로그인 (켬) — 실제 앱 구성(검증기 교체 없음)으로 확인한다.
// 테스트 토큰은 JWT 형식이 아니라서 실제 검증기로 가면 JWKS 를 받기 전에 거부된다 (외부 호출 없음).
import './e2e/dev-test-login-on'; // AppModule 보다 먼저
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Client } from 'pg';
import request from 'supertest';
import type { App } from 'supertest/types';
import { seedTestAccount, TEST_ACCOUNT } from '../scripts/db-seed.cjs';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { DEV_TEST_ID_TOKEN } from '../src/modules/auth/social/dev-test-login';
import { testDatabaseUrl } from './e2e/test-db';

describe('개발 전용 테스트 로그인 — DEV_TEST_LOGIN=true (e2e)', () => {
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
  });

  beforeEach(async () => {
    await db.query('DELETE FROM users');
    await db.query('DELETE FROM terms');
    await db.query(
      `INSERT INTO terms (version, title, content_url, effective_from)
       VALUES ('1.0', '가짜 이용약관', 'https://example.com/terms', now() - interval '1 day')`,
    );
  });

  afterAll(async () => {
    await db.query('DELETE FROM users');
    await db.query('DELETE FROM terms');
    await db.end();
    await app.close();
  });

  const login = (body: Record<string, unknown> = {}) =>
    request(app.getHttpServer())
      .post('/auth/social/login')
      .send({
        provider: 'GOOGLE',
        idToken: DEV_TEST_ID_TOKEN,
        deviceId: 'swagger',
        ...body,
      });

  it('시드: 테스트 계정을 소셜 계정·약관 동의와 함께 만들고, 다시 실행하면 건너뛴다', async () => {
    const first = await seedTestAccount(db);
    const second = await seedTestAccount(db);

    expect(first.created).toBe(true);
    expect(second).toEqual({ userId: first.userId, created: false });
    const user = await db.query<{ name: string; email: string }>(
      'SELECT name, email FROM users WHERE id = $1',
      [first.userId],
    );
    expect(user.rows).toEqual([
      { name: TEST_ACCOUNT.name, email: TEST_ACCOUNT.email },
    ]);
    const social = await db.query(
      `SELECT 1 FROM user_social_accounts
        WHERE user_id = $1 AND provider = 'GOOGLE' AND provider_user_id = $2`,
      [first.userId, TEST_ACCOUNT.providerUserId],
    );
    expect(social.rowCount).toBe(1);
    const agreed = await db.query(
      'SELECT 1 FROM user_term_agreements WHERE user_id = $1',
      [first.userId],
    );
    expect(agreed.rowCount).toBe(1);
  });

  it('GOOGLE + 테스트 토큰으로 시드한 테스트 계정에 로그인한다', async () => {
    const { userId } = await seedTestAccount(db);

    const res = await login();

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      isNewUser: false,
      user: { id: userId, name: '테스트 계정', providers: ['GOOGLE'] },
    });
    expect((res.body as { accessToken: string }).accessToken).toBeTruthy();
  });

  it('시드하지 않았으면 첫 로그인 때 테스트 계정이 만들어진다', async () => {
    const res = await login();

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ isNewUser: true });
    expect((await db.query('SELECT 1 FROM users')).rowCount).toBe(1);
  });

  it.each(['KAKAO', 'APPLE'])(
    '%s 로 테스트 토큰을 보내면 실제 검증으로 거부된다',
    async (provider) => {
      const res = await login({ provider, authorizationCode: 'fake-code' });

      expect(res.status).toBe(401);
      expect(res.body).toMatchObject({ code: 'SOCIAL_TOKEN_INVALID' });
    },
  );

  it('GOOGLE 이라도 테스트 토큰이 아니면 실제 검증으로 거부된다', async () => {
    const res = await login({ idToken: 'not-the-test-token' });

    expect(res.status).toBe(401);
  });
});
