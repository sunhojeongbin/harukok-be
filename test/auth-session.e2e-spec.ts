// POST /auth/token/refresh · POST /auth/logout — 로그인은 가짜 제공자로, 세션 판정·DB 상태는 실제 테스트 DB 로 검증한다.
import { createHash } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { jwtVerify, SignJWT } from 'jose';
import { Client } from 'pg';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { BusinessException } from '../src/common/errors/business.exception';
import { AuthErrors } from '../src/modules/auth/errors/auth.errors';
import {
  SESSION_STORE,
  type SessionStore,
} from '../src/modules/auth/repositories/session.store';
import {
  SOCIAL_TOKEN_VERIFIER,
  type SocialProvider,
} from '../src/modules/auth/social/social-identity';
import { testDatabaseUrl } from './e2e/test-db';

const hash = (token: string) => createHash('sha256').update(token).digest();

describe('세션 — 재발급 · 로그아웃 (e2e)', () => {
  let app: INestApplication<App>;
  let db: Client;

  // idToken = 'user:<sub>' 이면 그 sub 로 통과
  const verifier = {
    verify: (_provider: SocialProvider, idToken: string) =>
      idToken.startsWith('user:')
        ? Promise.resolve({
            providerUserId: idToken.slice(5),
            email: null,
            name: null,
          })
        : Promise.reject(
            new BusinessException(AuthErrors.SOCIAL_TOKEN_INVALID),
          ),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(SOCIAL_TOKEN_VERIFIER)
      .useValue(verifier)
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    db = new Client({ connectionString: testDatabaseUrl() });
    await db.connect();
  });

  beforeEach(async () => {
    await db.query('DELETE FROM users');
  });

  afterAll(async () => {
    await db.query('DELETE FROM users');
    await db.end();
    await app.close();
  });

  type Tokens = { accessToken: string; refreshToken: string };
  type LoginBody = Tokens & { user: { id: string } };

  async function login(sub: string, deviceId: string): Promise<LoginBody> {
    const res = await request(app.getHttpServer())
      .post('/auth/social/login')
      .send({ provider: 'GOOGLE', idToken: `user:${sub}`, deviceId });
    expect(res.status).toBe(200);
    return res.body as LoginBody;
  }

  const refresh = (refreshToken: string, deviceId: string) =>
    request(app.getHttpServer())
      .post('/auth/token/refresh')
      .send({ refreshToken, deviceId });

  const logout = (
    accessToken: string | null,
    refreshToken: string,
    deviceId: string,
  ) => {
    const req = request(app.getHttpServer()).post('/auth/logout');
    if (accessToken) void req.set('Authorization', `Bearer ${accessToken}`);
    return req.send({ refreshToken, deviceId });
  };

  async function tokenRow(refreshToken: string) {
    const r = await db.query<{
      revoked: boolean;
      device_id: string;
      days: string;
    }>(
      `SELECT revoked_at IS NOT NULL AS revoked, device_id,
              round(extract(epoch FROM expires_at - now()) / 86400)::text AS days
         FROM refresh_tokens WHERE token_hash = $1`,
      [hash(refreshToken)],
    );
    return r.rows[0];
  }

  const activeDevices = async (userId: string) =>
    (
      await db.query<{ device_id: string }>(
        `SELECT device_id FROM refresh_tokens
          WHERE user_id = $1 AND revoked_at IS NULL ORDER BY device_id`,
        [userId],
      )
    ).rows.map((r) => r.device_id);

  /** 다른 세션이 이 DB 에서 행 잠금을 기다리기 시작할 때까지 기다린다 (최대 3초) */
  async function waitForLockWait(): Promise<void> {
    for (let i = 0; i < 60; i++) {
      const r = await db.query<{ n: string }>(
        `SELECT count(*) AS n FROM pg_stat_activity
          WHERE datname = current_database() AND wait_event_type = 'Lock'`,
      );
      if (r.rows[0].n !== '0') return;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error('잠금 대기가 시작되지 않았다');
  }

  describe('POST /auth/token/refresh', () => {
    it('성공: 새 토큰 쌍을 주고, 이전 토큰은 폐기, 새 토큰은 같은 기기에 30일 (슬라이딩)', async () => {
      const first = await login('u1', 'dev-1');
      // 슬라이딩 확인용: 기존 토큰의 만료를 앞당겨 둔다
      await db.query(
        `UPDATE refresh_tokens SET expires_at = now() + interval '1 day' WHERE token_hash = $1`,
        [hash(first.refreshToken)],
      );

      const res = await refresh(first.refreshToken, 'dev-1');

      expect(res.status).toBe(200);
      const next = res.body as Tokens;
      expect(next.refreshToken).not.toBe(first.refreshToken);
      expect(await tokenRow(first.refreshToken)).toMatchObject({
        revoked: true,
      });
      expect(await tokenRow(next.refreshToken)).toEqual({
        revoked: false,
        device_id: 'dev-1',
        days: '30',
      });
      const { payload } = await jwtVerify(
        next.accessToken,
        new TextEncoder().encode(process.env.JWT_ACCESS_SECRET),
      );
      expect(payload.sub).toBe(first.user.id);
    });

    it('새 토큰으로 다시 재발급할 수 있다 (연속 로테이션)', async () => {
      const first = await login('u1', 'dev-1');
      const second = (await refresh(first.refreshToken, 'dev-1'))
        .body as Tokens;

      const third = await refresh(second.refreshToken, 'dev-1');

      expect(third.status).toBe(200);
    });

    it('NOT_FOUND: 모르는 토큰은 401 REFRESH_TOKEN_INVALID', async () => {
      const res = await refresh('unknown-refresh-token', 'dev-1');

      expect(res.status).toBe(401);
      expect(res.body).toMatchObject({ code: 'REFRESH_TOKEN_INVALID' });
    });

    it('권한: 다른 기기로 보내면 401 REFRESH_TOKEN_INVALID, 토큰은 폐기하지 않는다', async () => {
      const first = await login('u1', 'dev-1');

      const res = await refresh(first.refreshToken, 'dev-other');

      expect(res.body).toMatchObject({ code: 'REFRESH_TOKEN_INVALID' });
      expect(await tokenRow(first.refreshToken)).toMatchObject({
        revoked: false,
      });
      expect((await refresh(first.refreshToken, 'dev-1')).status).toBe(200);
    });

    it('재사용: 폐기된 토큰을 다시 보내면 401 REVOKED, 그 기기의 새 세션도 폐기 — 다른 기기는 그대로', async () => {
      const a = await login('u1', 'dev-1');
      await login('u1', 'dev-2');
      const rotated = (await refresh(a.refreshToken, 'dev-1')).body as Tokens;

      const reuse = await refresh(a.refreshToken, 'dev-1');

      expect(reuse.status).toBe(401);
      expect(reuse.body).toMatchObject({ code: 'REFRESH_TOKEN_REVOKED' });
      expect(await tokenRow(rotated.refreshToken)).toMatchObject({
        revoked: true,
      });
      expect((await refresh(rotated.refreshToken, 'dev-1')).body).toMatchObject(
        { code: 'REFRESH_TOKEN_REVOKED' },
      );
      expect(await activeDevices(a.user.id)).toEqual(['dev-2']);
    });

    it('같은 토큰의 동시 재발급은 토큰 행 잠금(FOR UPDATE)으로 직렬화된다 — 늦은 쪽은 폐기된 토큰을 보고 REVOKED', async () => {
      const a = await login('u1', 'dev-1');
      const store = app.get<SessionStore>(SESSION_STORE);
      // 먼저 진행 중인 재발급을 흉내 낸다: 다른 연결이 토큰 행을 잠그고 있다
      const locker = new Client({ connectionString: testDatabaseUrl() });
      await locker.connect();
      try {
        await locker.query('BEGIN');
        await locker.query(
          'SELECT 1 FROM refresh_tokens WHERE token_hash = $1 FOR UPDATE',
          [hash(a.refreshToken)],
        );

        const pending = store.rotate({
          tokenHash: hash(a.refreshToken),
          deviceId: 'dev-1',
          newTokenHash: hash('fake-next-token'),
        });
        await waitForLockWait();
        // 먼저 온 쪽이 로테이션을 끝낸다 (기존 토큰 폐기 후 커밋)
        await locker.query(
          'UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = $1',
          [hash(a.refreshToken)],
        );
        await locker.query('COMMIT');

        await expect(pending).resolves.toEqual({ outcome: 'REVOKED' });
      } finally {
        await locker.end();
      }
    });

    it('만료된 토큰은 401 REFRESH_TOKEN_EXPIRED', async () => {
      const first = await login('u1', 'dev-1');
      await db.query(
        `UPDATE refresh_tokens
            SET created_at = now() - interval '31 days', expires_at = now() - interval '1 day'
          WHERE token_hash = $1`,
        [hash(first.refreshToken)],
      );

      const res = await refresh(first.refreshToken, 'dev-1');

      expect(res.status).toBe(401);
      expect(res.body).toMatchObject({ code: 'REFRESH_TOKEN_EXPIRED' });
    });

    it('탈퇴로 사용자가 지워지면 남은 토큰은 401 REFRESH_TOKEN_INVALID (CASCADE 로 행이 없다)', async () => {
      const first = await login('u1', 'dev-1');
      await db.query('DELETE FROM users WHERE id = $1', [first.user.id]);

      const res = await refresh(first.refreshToken, 'dev-1');

      expect(res.body).toMatchObject({ code: 'REFRESH_TOKEN_INVALID' });
    });

    it.each([
      ['deviceId 누락', { refreshToken: 'x' }],
      ['refreshToken 누락', { deviceId: 'dev-1' }],
      ['공백 deviceId', { refreshToken: 'x', deviceId: '  ' }],
    ])('%s → 400 VALIDATION_FAILED', async (_label, body) => {
      const res = await request(app.getHttpServer())
        .post('/auth/token/refresh')
        .send(body);

      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ code: 'VALIDATION_FAILED' });
    });
  });

  describe('POST /auth/logout', () => {
    it('성공: 204, 그 기기 토큰만 폐기 (행은 남는다), 다른 기기는 그대로', async () => {
      const a = await login('u1', 'dev-1');
      await login('u1', 'dev-2');

      const res = await logout(a.accessToken, a.refreshToken, 'dev-1');

      expect(res.status).toBe(204);
      expect(await tokenRow(a.refreshToken)).toMatchObject({ revoked: true });
      expect(await activeDevices(a.user.id)).toEqual(['dev-2']);
    });

    it('멱등: 같은 토큰으로 두 번 로그아웃해도 둘 다 204', async () => {
      const a = await login('u1', 'dev-1');

      expect(
        (await logout(a.accessToken, a.refreshToken, 'dev-1')).status,
      ).toBe(204);
      expect(
        (await logout(a.accessToken, a.refreshToken, 'dev-1')).status,
      ).toBe(204);
    });

    it('만료된 토큰으로도 204 로 폐기된다', async () => {
      const a = await login('u1', 'dev-1');
      await db.query(
        `UPDATE refresh_tokens
            SET created_at = now() - interval '31 days', expires_at = now() - interval '1 day'
          WHERE token_hash = $1`,
        [hash(a.refreshToken)],
      );

      const res = await logout(a.accessToken, a.refreshToken, 'dev-1');

      expect(res.status).toBe(204);
      expect(await tokenRow(a.refreshToken)).toMatchObject({ revoked: true });
    });

    it('로그아웃한 토큰으로 재발급하면 401 REVOKED', async () => {
      const a = await login('u1', 'dev-1');
      await logout(a.accessToken, a.refreshToken, 'dev-1');

      expect((await refresh(a.refreshToken, 'dev-1')).body).toMatchObject({
        code: 'REFRESH_TOKEN_REVOKED',
      });
    });

    it('Bearer 가 없으면 401 ACCESS_TOKEN_INVALID, 토큰은 그대로', async () => {
      const a = await login('u1', 'dev-1');

      const res = await logout(null, a.refreshToken, 'dev-1');

      expect(res.status).toBe(401);
      expect(res.body).toMatchObject({ code: 'ACCESS_TOKEN_INVALID' });
      expect(await tokenRow(a.refreshToken)).toMatchObject({ revoked: false });
    });

    it('만료된 Bearer 는 401 ACCESS_TOKEN_INVALID', async () => {
      const a = await login('u1', 'dev-1');
      const past = Math.floor(Date.now() / 1000) - 60;
      const expired = await new SignJWT({})
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject(a.user.id)
        .setIssuedAt(past - 3600)
        .setExpirationTime(past)
        .sign(new TextEncoder().encode(process.env.JWT_ACCESS_SECRET));

      const res = await logout(expired, a.refreshToken, 'dev-1');

      expect(res.body).toMatchObject({ code: 'ACCESS_TOKEN_INVALID' });
    });

    it('권한: 다른 사용자의 리프레시 토큰이면 401 REFRESH_TOKEN_INVALID, 그 사용자 토큰은 폐기하지 않는다', async () => {
      const me = await login('u1', 'dev-1');
      const other = await login('u2', 'dev-9');

      const res = await logout(me.accessToken, other.refreshToken, 'dev-9');

      expect(res.status).toBe(401);
      expect(res.body).toMatchObject({ code: 'REFRESH_TOKEN_INVALID' });
      expect(await tokenRow(other.refreshToken)).toMatchObject({
        revoked: false,
      });
    });

    it('권한: 토큰의 기기와 deviceId 가 다르면 401 REFRESH_TOKEN_INVALID', async () => {
      const a = await login('u1', 'dev-1');

      const res = await logout(a.accessToken, a.refreshToken, 'dev-2');

      expect(res.body).toMatchObject({ code: 'REFRESH_TOKEN_INVALID' });
      expect(await tokenRow(a.refreshToken)).toMatchObject({ revoked: false });
    });

    it('NOT_FOUND: 모르는 리프레시 토큰은 401 REFRESH_TOKEN_INVALID', async () => {
      const a = await login('u1', 'dev-1');

      const res = await logout(a.accessToken, 'unknown-refresh-token', 'dev-1');

      expect(res.body).toMatchObject({ code: 'REFRESH_TOKEN_INVALID' });
    });
  });
});
