// POST /auth/social/login — 외부 제공자는 가짜 구현, DB 트랜잭션·제약은 실제 테스트 DB 로 검증한다.
import { createHash } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { jwtVerify } from 'jose';
import { Client } from 'pg';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { TokenCipher } from '../src/common/crypto/token-cipher';
import { BusinessException } from '../src/common/errors/business.exception';
import { AuthErrors } from '../src/modules/auth/errors/auth.errors';
import {
  LOGIN_STORE,
  type LoginCommand,
  type LoginStore,
} from '../src/modules/auth/repositories/login.store';
import {
  APPLE_AUTH_CLIENT,
  type AppleAuthClient,
} from '../src/modules/auth/social/apple-auth.client';
import {
  SOCIAL_TOKEN_VERIFIER,
  type SocialIdentity,
  type SocialProvider,
  type SocialTokenVerifier,
} from '../src/modules/auth/social/social-identity';
import { testDatabaseUrl } from './e2e/test-db';

/** idToken 문자열 → 신원. 등록되지 않은 토큰은 SOCIAL_TOKEN_INVALID */
class FakeVerifier implements SocialTokenVerifier {
  readonly tokens = new Map<
    string,
    SocialIdentity & { provider: SocialProvider }
  >();

  verify(provider: SocialProvider, idToken: string): Promise<SocialIdentity> {
    const found = this.tokens.get(idToken);
    if (!found || found.provider !== provider) {
      return Promise.reject(
        new BusinessException(AuthErrors.SOCIAL_TOKEN_INVALID),
      );
    }
    const { providerUserId, email, name } = found;
    return Promise.resolve({ providerUserId, email, name });
  }
}

class FakeApple implements AppleAuthClient {
  next: () => Promise<string> = () => Promise.resolve('fake-apple-refresh-1');
  exchangeCode = jest.fn((code: string) => {
    void code;
    return this.next();
  });
}

describe('POST /auth/social/login (e2e)', () => {
  let app: INestApplication<App>;
  let db: Client;
  const verifier = new FakeVerifier();
  const apple = new FakeApple();
  let termId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(SOCIAL_TOKEN_VERIFIER)
      .useValue(verifier)
      .overrideProvider(APPLE_AUTH_CLIENT)
      .useValue(apple)
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    db = new Client({ connectionString: testDatabaseUrl() });
    await db.connect();
  });

  // 앱은 별도 연결이라 트랜잭션 롤백으로 격리할 수 없다. 테스트마다 비운다 (users → CASCADE).
  beforeEach(async () => {
    await db.query('DELETE FROM users');
    await db.query('DELETE FROM terms');
    verifier.tokens.clear();
    apple.next = () => Promise.resolve('fake-apple-refresh-1');
    apple.exchangeCode.mockClear();
    await db.query(
      `INSERT INTO terms (version, title, content_url, effective_from)
       VALUES ('0.9', '가짜 구버전', 'https://example.com/terms/0.9', now() - interval '30 days')`,
    );
    const r = await db.query<{ id: string }>(
      `INSERT INTO terms (version, title, content_url, effective_from)
       VALUES ('1.0', '가짜 이용약관', 'https://example.com/terms/1.0', now() - interval '1 day')
       RETURNING id`,
    );
    termId = r.rows[0].id;
  });

  afterAll(async () => {
    await db.query('DELETE FROM users');
    await db.query('DELETE FROM terms');
    await db.end();
    await app.close();
  });

  function identity(
    token: string,
    provider: SocialProvider,
    providerUserId: string,
    profile: { email?: string | null; name?: string | null } = {},
  ) {
    verifier.tokens.set(token, {
      provider,
      providerUserId,
      email: profile.email ?? null,
      name: profile.name ?? null,
    });
  }

  const login = (body: Record<string, unknown>) =>
    request(app.getHttpServer()).post('/auth/social/login').send(body);

  type LoginBody = {
    accessToken: string;
    refreshToken: string;
    isNewUser: boolean;
    user: { id: string; name: string | null; providers: string[] };
  };

  async function loginOk(body: Record<string, unknown>): Promise<LoginBody> {
    const res = await login(body);
    expect({ status: res.status, body: res.body as unknown }).toMatchObject({
      status: 200,
    });
    return res.body as LoginBody;
  }

  const activeDevices = async (userId: string) =>
    (
      await db.query<{ device_id: string }>(
        `SELECT device_id FROM refresh_tokens
          WHERE user_id = $1 AND revoked_at IS NULL ORDER BY device_id`,
        [userId],
      )
    ).rows.map((r) => r.device_id);

  describe('신규 가입', () => {
    it('사용자·소셜 계정·약관 동의·기기 토큰을 만들고, 이메일·이름을 정규화해 저장한다', async () => {
      identity('g-1', 'GOOGLE', 'fake-google-sub-1', {
        email: ' Fake@Example.COM ',
        name: '<b>가짜</b> 사용자',
      });

      const body = await loginOk({
        provider: 'GOOGLE',
        idToken: 'g-1',
        deviceId: 'dev-1',
      });

      expect(body).toMatchObject({
        isNewUser: true,
        user: { name: '가짜 사용자', providers: ['GOOGLE'] },
      });
      const user = await db.query<{ email: string; name: string }>(
        'SELECT email, name FROM users WHERE id = $1',
        [body.user.id],
      );
      expect(user.rows[0]).toEqual({
        email: 'fake@example.com',
        name: '가짜 사용자',
      });
      const social = await db.query(
        `SELECT 1 FROM user_social_accounts
          WHERE user_id = $1 AND provider = 'GOOGLE' AND provider_user_id = 'fake-google-sub-1'`,
        [body.user.id],
      );
      expect(social.rowCount).toBe(1);
      const agreed = await db.query<{ term_id: string }>(
        'SELECT term_id FROM user_term_agreements WHERE user_id = $1',
        [body.user.id],
      );
      expect(agreed.rows).toEqual([{ term_id: termId }]);
    });

    it('리프레시 토큰은 SHA-256 해시로만 저장하고 30일 뒤 만료, 액세스 토큰은 sub = 사용자ID', async () => {
      identity('g-1', 'GOOGLE', 'fake-google-sub-1');

      const body = await loginOk({
        provider: 'GOOGLE',
        idToken: 'g-1',
        deviceId: 'dev-1',
      });

      const token = await db.query<{ token_hash: Buffer; days: string }>(
        `SELECT token_hash,
                round(extract(epoch FROM expires_at - created_at) / 86400)::text AS days
           FROM refresh_tokens WHERE user_id = $1`,
        [body.user.id],
      );
      expect(token.rows).toHaveLength(1);
      expect(token.rows[0].token_hash).toEqual(
        createHash('sha256').update(body.refreshToken).digest(),
      );
      expect(token.rows[0].days).toBe('30');
      const { payload } = await jwtVerify(
        body.accessToken,
        new TextEncoder().encode(process.env.JWT_ACCESS_SECRET),
      );
      expect(payload.sub).toBe(body.user.id);
    });

    it('요청에 약관 동의를 담지 않아도 현행 이용약관(구버전 아님)에 자동 동의로 기록한다', async () => {
      identity('g-1', 'GOOGLE', 'fake-google-sub-1');

      const body = await loginOk({
        provider: 'GOOGLE',
        idToken: 'g-1',
        deviceId: 'dev-1',
      });

      const agreed = await db.query<{ version: string }>(
        `SELECT t.version FROM user_term_agreements a JOIN terms t ON t.id = a.term_id
          WHERE a.user_id = $1`,
        [body.user.id],
      );
      expect(agreed.rows).toEqual([{ version: '1.0' }]);
    });

    it('시행 중인 이용약관이 없어도 가입을 막지 않는다 — 동의 기록 없이 200', async () => {
      await db.query('DELETE FROM terms');
      identity('g-1', 'GOOGLE', 'fake-google-sub-1');

      const body = await loginOk({
        provider: 'GOOGLE',
        idToken: 'g-1',
        deviceId: 'dev-1',
      });

      expect(body.isNewUser).toBe(true);
      expect(
        (await db.query('SELECT 1 FROM user_term_agreements')).rowCount,
      ).toBe(0);
    });

    it('이메일이 254자를 넘으면 NULL 로 저장한다 (가입은 진행)', async () => {
      identity('g-1', 'GOOGLE', 'fake-google-sub-1', {
        email: `${'a'.repeat(250)}@example.com`,
      });

      const body = await loginOk({
        provider: 'GOOGLE',
        idToken: 'g-1',
        deviceId: 'dev-1',
      });

      const user = await db.query<{ email: string | null }>(
        'SELECT email FROM users WHERE id = $1',
        [body.user.id],
      );
      expect(user.rows[0].email).toBeNull();
    });

    it('같은 소셜 계정으로 동시에 첫 로그인해도 사용자는 1명만 생긴다', async () => {
      identity('g-1', 'GOOGLE', 'fake-google-sub-1');
      const body = (deviceId: string) => ({
        provider: 'GOOGLE',
        idToken: 'g-1',
        deviceId,
      });

      const [a, b] = await Promise.all([
        login(body('dev-a')),
        login(body('dev-b')),
      ]);

      expect([a.status, b.status]).toEqual([200, 200]);
      const aBody = a.body as LoginBody;
      const bBody = b.body as LoginBody;
      expect(aBody.user.id).toBe(bBody.user.id);
      expect([aBody.isNewUser, bBody.isNewUser].sort()).toEqual([false, true]);
      expect((await db.query('SELECT 1 FROM users')).rowCount).toBe(1);
      expect(await activeDevices(aBody.user.id)).toEqual(['dev-a', 'dev-b']);
    });
  });

  describe('동시 첫 가입 (저장소 직접 호출로 경합을 강제)', () => {
    it('두 트랜잭션이 같은 소셜 계정으로 동시에 가입해도 사용자 1명, 둘 다 토큰을 받는다', async () => {
      const store = app.get<LoginStore>(LOGIN_STORE);
      const command = (deviceId: string): LoginCommand => ({
        provider: 'GOOGLE',
        providerUserId: 'fake-race-sub',
        email: null,
        name: null,
        currentTermId: termId,
        appleRefreshTokenEnc: null,
        deviceId,
        refreshTokenHash: createHash('sha256').update(deviceId).digest(),
      });

      const results = await Promise.all([
        store.login(command('dev-a')),
        store.login(command('dev-b')),
      ]);

      expect(new Set(results.map((r) => r.userId)).size).toBe(1);
      expect(results.map((r) => r.isNewUser).sort()).toEqual([false, true]);
      expect((await db.query('SELECT 1 FROM users')).rowCount).toBe(1);
      expect(await activeDevices(results[0].userId)).toEqual([
        'dev-a',
        'dev-b',
      ]);
    });
  });

  describe('기존 사용자', () => {
    async function signUp(deviceId = 'dev-1') {
      identity('k-1', 'KAKAO', 'fake-kakao-1', { name: '카카오 닉' });
      return loginOk({
        provider: 'KAKAO',
        idToken: 'k-1',
        deviceId,
      });
    }

    it('같은 사용자로 로그인하고 isNewUser=false', async () => {
      const first = await signUp();

      const again = await loginOk({
        provider: 'KAKAO',
        idToken: 'k-1',
        deviceId: 'dev-2',
      });

      expect(again).toMatchObject({
        isNewUser: false,
        user: { id: first.user.id, name: '카카오 닉', providers: ['KAKAO'] },
      });
      expect((await db.query('SELECT 1 FROM users')).rowCount).toBe(1);
    });

    it('가입 때 약관이 없어 빠진 동의 기록은 다음 로그인 때 현행 약관으로 보충한다', async () => {
      await db.query('DELETE FROM terms');
      const first = await signUp('dev-1');
      expect(
        (await db.query('SELECT 1 FROM user_term_agreements')).rowCount,
      ).toBe(0);
      await db.query(
        `INSERT INTO terms (version, title, content_url, effective_from)
         VALUES ('2.0', '가짜 이용약관', 'https://example.com/terms/2.0', now() - interval '1 minute')`,
      );

      await loginOk({ provider: 'KAKAO', idToken: 'k-1', deviceId: 'dev-2' });
      await loginOk({ provider: 'KAKAO', idToken: 'k-1', deviceId: 'dev-3' });

      const agreed = await db.query<{ version: string }>(
        `SELECT t.version FROM user_term_agreements a JOIN terms t ON t.id = a.term_id
          WHERE a.user_id = $1`,
        [first.user.id],
      );
      expect(agreed.rows).toEqual([{ version: '2.0' }]);
    });

    it('이미 동의 이력이 있으면 약관이 개정돼도 로그인으로 다시 기록하지 않는다 (재동의는 범위 밖)', async () => {
      const first = await signUp('dev-1');
      await db.query(
        `INSERT INTO terms (version, title, content_url, effective_from)
         VALUES ('1.1', '가짜 개정', 'https://example.com/terms/1.1', now() - interval '1 minute')`,
      );

      await loginOk({ provider: 'KAKAO', idToken: 'k-1', deviceId: 'dev-2' });

      const agreed = await db.query<{ version: string }>(
        `SELECT t.version FROM user_term_agreements a JOIN terms t ON t.id = a.term_id
          WHERE a.user_id = $1`,
        [first.user.id],
      );
      expect(agreed.rows).toEqual([{ version: '1.0' }]);
    });

    it('기존 사용자의 이름·이메일은 로그인으로 덮어쓰지 않는다', async () => {
      const first = await signUp();
      identity('k-1', 'KAKAO', 'fake-kakao-1', {
        name: '바뀐 닉',
        email: 'new@example.com',
      });

      await loginOk({ provider: 'KAKAO', idToken: 'k-1', deviceId: 'dev-2' });

      const user = await db.query<{ name: string; email: string | null }>(
        'SELECT name, email FROM users WHERE id = $1',
        [first.user.id],
      );
      expect(user.rows[0]).toEqual({ name: '카카오 닉', email: null });
    });

    it('같은 기기로 다시 로그인하면 이전 토큰을 폐기하고 활성 토큰은 1개', async () => {
      const first = await signUp('dev-1');

      await loginOk({ provider: 'KAKAO', idToken: 'k-1', deviceId: 'dev-1' });

      const rows = await db.query<{ revoked: boolean }>(
        `SELECT revoked_at IS NOT NULL AS revoked FROM refresh_tokens
          WHERE user_id = $1 ORDER BY created_at, id`,
        [first.user.id],
      );
      expect(rows.rows).toEqual([{ revoked: true }, { revoked: false }]);
    });

    it('4대째 로그인하면 활성 기기는 3대, 가장 오래된 기기가 폐기된다 (DB 설계서 6장)', async () => {
      const first = await signUp('dev-1');
      for (const d of ['dev-2', 'dev-3', 'dev-4']) {
        await loginOk({ provider: 'KAKAO', idToken: 'k-1', deviceId: d });
      }

      expect(await activeDevices(first.user.id)).toEqual([
        'dev-2',
        'dev-3',
        'dev-4',
      ]);
    });
  });

  describe('애플', () => {
    const cipher = () =>
      new TokenCipher(process.env.TOKEN_ENCRYPTION_KEY ?? '');

    async function storedAppleToken(): Promise<Buffer | null> {
      const r = await db.query<{ enc: Buffer | null }>(
        `SELECT provider_refresh_token_enc AS enc FROM user_social_accounts WHERE provider = 'APPLE'`,
      );
      return r.rows[0].enc;
    }

    const appleLogin = (extra: Record<string, unknown> = {}) =>
      loginOk({
        provider: 'APPLE',
        idToken: 'a-1',
        authorizationCode: 'fake-code',
        deviceId: 'dev-1',
        ...extra,
      });

    it('코드를 교환한 refresh token 을 평문이 아닌 암호문으로 저장하고, 이름은 요청 name 을 쓴다', async () => {
      identity('a-1', 'APPLE', 'fake-apple-sub', {
        email: 'fake@privaterelay.appleid.com',
      });

      const body = await appleLogin({ name: '<i>애플</i> 사용자' });

      expect(apple.exchangeCode).toHaveBeenCalledWith('fake-code');
      expect(body.user.name).toBe('애플 사용자');
      const enc = await storedAppleToken();
      expect(enc).not.toBeNull();
      expect((enc as Buffer).toString('utf8')).not.toContain(
        'fake-apple-refresh-1',
      );
      expect(cipher().decrypt(enc as Buffer)).toBe('fake-apple-refresh-1');
    });

    it('코드 교환이 실패해도 가입은 진행하고 암호문은 NULL', async () => {
      identity('a-1', 'APPLE', 'fake-apple-sub');
      apple.next = () => Promise.reject(new Error('fake invalid_grant'));

      const body = await appleLogin();

      expect(body.isNewUser).toBe(true);
      expect(await storedAppleToken()).toBeNull();
    });

    it('재로그인 시 교환에 성공하면 새 토큰으로 바꾸고, 실패하면 기존 토큰을 유지한다', async () => {
      identity('a-1', 'APPLE', 'fake-apple-sub');
      await appleLogin();

      apple.next = () => Promise.resolve('fake-apple-refresh-2');
      await appleLogin({ deviceId: 'dev-2' });
      expect(cipher().decrypt((await storedAppleToken()) as Buffer)).toBe(
        'fake-apple-refresh-2',
      );

      apple.next = () => Promise.reject(new Error('fake invalid_grant'));
      await appleLogin({ deviceId: 'dev-3' });
      expect(cipher().decrypt((await storedAppleToken()) as Buffer)).toBe(
        'fake-apple-refresh-2',
      );
    });
  });

  describe('거부', () => {
    it('검증되지 않는 idToken 은 401 SOCIAL_TOKEN_INVALID', async () => {
      const res = await login({
        provider: 'GOOGLE',
        idToken: 'unknown-token',
        deviceId: 'dev-1',
      });

      expect(res.status).toBe(401);
      expect(res.body).toMatchObject({ code: 'SOCIAL_TOKEN_INVALID' });
    });

    it.each([
      ['허용되지 않은 provider', { provider: 'NAVER' }],
      ['idToken 누락', { idToken: undefined }],
      ['공백뿐인 deviceId', { deviceId: '   ' }],
      ['129자 deviceId', { deviceId: 'd'.repeat(129) }],
      ['애플인데 authorizationCode 누락', { provider: 'APPLE' }],
      [
        '더 이상 받지 않는 agreement 필드',
        {
          agreement: {
            termId: '00000000-0000-7000-8000-000000000001',
            version: '1.0',
          },
        },
      ],
      ['정의되지 않은 필드', { extra: 1 }],
    ])('%s → 400 VALIDATION_FAILED', async (_label, override) => {
      const res = await login({
        provider: 'GOOGLE',
        idToken: 'g-1',
        deviceId: 'dev-1',
        ...override,
      });

      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ code: 'VALIDATION_FAILED' });
    });
  });
});
