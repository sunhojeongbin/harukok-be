// GET /users/me · DELETE /users/me — 제공자(로그인 검증 · 애플 · 카카오)는 가짜, DB 는 실제 테스트 DB.
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Client } from 'pg';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { BusinessException } from '../src/common/errors/business.exception';
import { AuthErrors } from '../src/modules/auth/errors/auth.errors';
import {
  APPLE_AUTH_CLIENT,
  type AppleAuthClient,
  type AppleRevokeClient,
} from '../src/modules/auth/social/apple-auth.client';
import {
  KAKAO_UNLINK_CLIENT,
  type KakaoUnlinkClient,
} from '../src/modules/auth/social/kakao-unlink.client';
import {
  SOCIAL_TOKEN_VERIFIER,
  type SocialProvider,
} from '../src/modules/auth/social/social-identity';
import { testDatabaseUrl } from './e2e/test-db';

describe('사용자 — 내 정보 · 탈퇴 (e2e)', () => {
  let app: INestApplication<App>;
  let db: Client;

  // idToken = '<sub>|<email>|<name>' 이면 통과 (빈 칸은 NULL)
  const verifier = {
    verify: (_provider: SocialProvider, idToken: string) => {
      const [sub, email, name] = idToken.split('|');
      return sub
        ? Promise.resolve({
            providerUserId: sub,
            email: email || null,
            name: name || null,
          })
        : Promise.reject(
            new BusinessException(AuthErrors.SOCIAL_TOKEN_INVALID),
          );
    },
  };

  /** 호출되는 순간 사용자 행이 아직 있는지 기록한다 — "해제 → 삭제" 순서 확인 */
  const calls: { who: string; arg: string; userRowExists: boolean }[] = [];
  let currentUserId = '';
  const userRowExists = async () =>
    (await db.query('SELECT 1 FROM users WHERE id = $1', [currentUserId]))
      .rowCount === 1;

  const apple: AppleAuthClient & AppleRevokeClient & { fail: boolean } = {
    fail: false,
    exchangeCode: () => Promise.resolve('fake-apple-refresh-1'),
    revoke: async (token) => {
      calls.push({
        who: 'apple',
        arg: token,
        userRowExists: await userRowExists(),
      });
      if (apple.fail) throw new Error('fake apple revoke 400');
    },
  };
  const kakao: KakaoUnlinkClient & { fail: boolean } = {
    fail: false,
    unlink: async (id) => {
      calls.push({
        who: 'kakao',
        arg: id,
        userRowExists: await userRowExists(),
      });
      if (kakao.fail) throw new Error('fake kakao unlink 401');
    },
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(SOCIAL_TOKEN_VERIFIER)
      .useValue(verifier)
      .overrideProvider(APPLE_AUTH_CLIENT)
      .useValue(apple)
      .overrideProvider(KAKAO_UNLINK_CLIENT)
      .useValue(kakao)
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    db = new Client({ connectionString: testDatabaseUrl() });
    await db.connect();
  });

  beforeEach(async () => {
    await db.query('DELETE FROM users');
    calls.length = 0;
    apple.fail = false;
    kakao.fail = false;
  });

  afterAll(async () => {
    await db.query('DELETE FROM users');
    await db.end();
    await app.close();
  });

  type LoginBody = {
    accessToken: string;
    refreshToken: string;
    user: { id: string };
  };

  async function login(
    provider: SocialProvider,
    idToken: string,
    deviceId = 'dev-1',
  ): Promise<LoginBody> {
    const res = await request(app.getHttpServer())
      .post('/auth/social/login')
      .send({
        provider,
        idToken,
        deviceId,
        ...(provider === 'APPLE' ? { authorizationCode: 'fake-code' } : {}),
      });
    expect(res.status).toBe(200);
    return res.body as LoginBody;
  }

  const me = (accessToken?: string) => {
    const req = request(app.getHttpServer()).get('/users/me');
    return accessToken
      ? req.set('Authorization', `Bearer ${accessToken}`)
      : req;
  };
  const withdraw = (accessToken?: string) => {
    const req = request(app.getHttpServer()).delete('/users/me');
    return accessToken
      ? req.set('Authorization', `Bearer ${accessToken}`)
      : req;
  };

  const countFor = async (table: string, userId: string) =>
    (
      await db.query<{ n: string }>(
        `SELECT count(*) AS n FROM ${table} WHERE user_id = $1`,
        [userId],
      )
    ).rows[0].n;

  describe('GET /users/me', () => {
    it('{ id, name, email, providers, createdAt } 를 돌려준다', async () => {
      const a = await login('GOOGLE', 'g-1|Fake@Example.com|가짜 사용자');

      const res = await me(a.accessToken);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        id: a.user.id,
        name: '가짜 사용자',
        email: 'fake@example.com',
        providers: ['GOOGLE'],
        createdAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T.*Z$/) as unknown,
      });
    });

    it('name · email 은 NULL 일 수 있다', async () => {
      const a = await login('KAKAO', 'k-1||');

      expect((await me(a.accessToken)).body).toMatchObject({
        name: null,
        email: null,
        providers: ['KAKAO'],
      });
    });

    it('Bearer 가 없으면 401 ACCESS_TOKEN_INVALID', async () => {
      const res = await me();

      expect(res.status).toBe(401);
      expect(res.body).toMatchObject({ code: 'ACCESS_TOKEN_INVALID' });
    });

    it('탈퇴 후 남은 액세스 토큰이면 404 USER_NOT_FOUND', async () => {
      const a = await login('GOOGLE', 'g-1||');
      await db.query('DELETE FROM users WHERE id = $1', [a.user.id]);

      const res = await me(a.accessToken);

      expect(res.status).toBe(404);
      expect(res.body).toMatchObject({ code: 'USER_NOT_FOUND' });
    });
  });

  describe('DELETE /users/me', () => {
    /** 애플로 가입하고, 같은 사용자에 카카오 연결 행을 하나 더 붙인다 */
    async function appleAndKakaoUser() {
      const a = await login('APPLE', 'a-1|fake@privaterelay.appleid.com|');
      currentUserId = a.user.id;
      await db.query(
        `INSERT INTO user_social_accounts (user_id, provider, provider_user_id)
         VALUES ($1, 'KAKAO', '1234567890')`,
        [a.user.id],
      );
      await db.query(
        `INSERT INTO todos (user_id, title, due_date) VALUES ($1, '가짜 할 일', '2026-11-17')`,
        [a.user.id],
      );
      return a;
    }

    it('애플 revoke(복호화한 원문) · 카카오 unlink(회원번호)를 users 삭제 **전에** 호출하고 204', async () => {
      const a = await appleAndKakaoUser();

      const res = await withdraw(a.accessToken);

      expect(res.status).toBe(204);
      expect(calls.sort((x, y) => x.who.localeCompare(y.who))).toEqual([
        { who: 'apple', arg: 'fake-apple-refresh-1', userRowExists: true },
        { who: 'kakao', arg: '1234567890', userRowExists: true },
      ]);
    });

    it('CASCADE: 사용자 · 소셜 계정 · 약관 동의 · 토큰 · 할 일이 모두 지워지고, 다른 사용자는 그대로', async () => {
      const a = await appleAndKakaoUser();
      const other = await login('GOOGLE', 'g-other||', 'dev-9');

      await withdraw(a.accessToken);

      expect(
        (await db.query('SELECT 1 FROM users WHERE id = $1', [a.user.id]))
          .rowCount,
      ).toBe(0);
      for (const table of [
        'user_social_accounts',
        'user_term_agreements',
        'refresh_tokens',
        'todos',
      ]) {
        expect({ table, n: await countFor(table, a.user.id) }).toEqual({
          table,
          n: '0',
        });
      }
      expect(await countFor('refresh_tokens', other.user.id)).toBe('1');
      expect((await me(other.accessToken)).status).toBe(200);
    });

    it('연동 해제가 모두 실패해도 탈퇴는 진행한다 (204, 삭제됨)', async () => {
      const a = await appleAndKakaoUser();
      apple.fail = true;
      kakao.fail = true;

      const res = await withdraw(a.accessToken);

      expect(res.status).toBe(204);
      expect(
        (await db.query('SELECT 1 FROM users WHERE id = $1', [a.user.id]))
          .rowCount,
      ).toBe(0);
    });

    it('애플 토큰이 없으면(로그인 때 교환 실패) revoke 없이 탈퇴한다', async () => {
      const a = await appleAndKakaoUser();
      await db.query(
        `UPDATE user_social_accounts SET provider_refresh_token_enc = NULL
          WHERE user_id = $1 AND provider = 'APPLE'`,
        [a.user.id],
      );

      expect((await withdraw(a.accessToken)).status).toBe(204);
      expect(calls.map((c) => c.who)).toEqual(['kakao']);
    });

    it('구글만 연결된 사용자는 서버 해제 호출 없이 삭제한다', async () => {
      const g = await login('GOOGLE', 'g-1||');

      expect((await withdraw(g.accessToken)).status).toBe(204);
      expect(calls).toEqual([]);
    });

    it('탈퇴 후: 남은 액세스 토큰으로 조회·탈퇴는 404, 리프레시 토큰은 401 INVALID', async () => {
      const a = await appleAndKakaoUser();
      await withdraw(a.accessToken);

      expect((await me(a.accessToken)).body).toMatchObject({
        code: 'USER_NOT_FOUND',
      });
      expect((await withdraw(a.accessToken)).status).toBe(404);
      const refresh = await request(app.getHttpServer())
        .post('/auth/token/refresh')
        .send({ refreshToken: a.refreshToken, deviceId: 'dev-1' });
      expect(refresh.body).toMatchObject({ code: 'REFRESH_TOKEN_INVALID' });
    });

    // 보안 점검 #6: 액세스 토큰은 탈퇴 후에도 1시간 유효하다 — 할 일 등록이 FK 위반 500 이 아니라 404
    it('탈퇴 후 남은 액세스 토큰으로 할 일을 등록하면 404 USER_NOT_FOUND', async () => {
      const g = await login('GOOGLE', 'g-1||');
      await withdraw(g.accessToken);

      const res = await request(app.getHttpServer())
        .post('/todos')
        .set('Authorization', `Bearer ${g.accessToken}`)
        .send({ title: '가짜', dueDate: '2026-11-18' });

      expect(res.status).toBe(404);
      expect(res.body).toMatchObject({ code: 'USER_NOT_FOUND' });
    });

    it('Bearer 가 없으면 401, 아무것도 지우지 않는다', async () => {
      await login('GOOGLE', 'g-1||');

      expect((await withdraw()).status).toBe(401);
      expect((await db.query('SELECT 1 FROM users')).rowCount).toBe(1);
    });
  });
});
