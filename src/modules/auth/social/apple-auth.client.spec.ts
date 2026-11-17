import { decodeProtectedHeader, jwtVerify } from 'jose';
import { fakeAppleKeyPair } from '../../../../test/fixtures/fake-env';
import {
  type AppleAuthConfig,
  APPLE_REVOKE_URL,
  APPLE_TOKEN_URL,
  type FetchFn,
  HttpAppleAuthClient,
} from './apple-auth.client';

const NOW = Date.parse('2026-11-17T00:00:00Z');

function setup(response: () => Promise<Response>) {
  const { privateKeyPem, publicKey } = fakeAppleKeyPair();
  const config: AppleAuthConfig = {
    teamId: 'FAKETEAM01',
    keyId: 'FAKEKEY001',
    privateKeyPem,
    clientId: 'com.example.fake.harukok',
  };
  const fetchFn = jest.fn<ReturnType<FetchFn>, Parameters<FetchFn>>(response);
  const client = new HttpAppleAuthClient(config, fetchFn, () => NOW);
  return { client, fetchFn, publicKey };
}

const json = (status: number, body: unknown) => () =>
  Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  );

describe('HttpAppleAuthClient.exchangeCode', () => {
  it('코드를 /auth/token 에 form 으로 보내고 refresh_token 을 돌려준다', async () => {
    const { client, fetchFn } = setup(
      json(200, { refresh_token: 'fake-apple-refresh', access_token: 'x' }),
    );

    await expect(client.exchangeCode('fake-code')).resolves.toBe(
      'fake-apple-refresh',
    );

    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe(APPLE_TOKEN_URL);
    expect(init.method).toBe('POST');
    const body = new URLSearchParams(init.body as string);
    expect(body.get('grant_type')).toBe('authorization_code');
    expect(body.get('code')).toBe('fake-code');
    expect(body.get('client_id')).toBe('com.example.fake.harukok');
  });

  it('client_secret 은 ES256 서명 JWT 다 (kid · iss=팀 · sub=번들 · aud=애플 · 5분)', async () => {
    const { client, fetchFn, publicKey } = setup(
      json(200, { refresh_token: 'fake' }),
    );

    await client.exchangeCode('fake-code');

    const body = new URLSearchParams(fetchFn.mock.calls[0][1].body as string);
    const secret = body.get('client_secret') ?? '';
    expect(decodeProtectedHeader(secret)).toMatchObject({
      alg: 'ES256',
      kid: 'FAKEKEY001',
    });
    const { payload } = await jwtVerify(secret, publicKey, {
      currentDate: new Date(NOW),
      issuer: 'FAKETEAM01',
      subject: 'com.example.fake.harukok',
      audience: 'https://appleid.apple.com',
    });
    expect((payload.exp ?? 0) - (payload.iat ?? 0)).toBe(300);
  });

  it('요청할 때마다 client_secret 을 새로 서명한다 (캐시하지 않음)', async () => {
    const { client, fetchFn } = setup(json(200, { refresh_token: 'fake' }));

    await client.exchangeCode('a');
    await client.exchangeCode('b');

    const secrets = fetchFn.mock.calls.map(([, init]) =>
      new URLSearchParams(init.body as string).get('client_secret'),
    );
    expect(secrets[0]).not.toBe(secrets[1]);
  });

  it('애플이 오류(예: invalid_grant)를 주면 실패한다', async () => {
    const { client } = setup(json(400, { error: 'invalid_grant' }));

    await expect(client.exchangeCode('fake-code')).rejects.toThrow(
      /400.*invalid_grant/,
    );
  });

  it('응답에 refresh_token 이 없으면 실패한다', async () => {
    const { client } = setup(json(200, { access_token: 'x' }));

    await expect(client.exchangeCode('fake-code')).rejects.toThrow(
      /refresh_token/,
    );
  });

  it('네트워크 오류는 그대로 실패한다', async () => {
    const { client } = setup(() => Promise.reject(new Error('fake network')));

    await expect(client.exchangeCode('fake-code')).rejects.toThrow(
      'fake network',
    );
  });
});

describe('HttpAppleAuthClient.revoke (탈퇴)', () => {
  it('refresh token 을 /auth/revoke 에 form 으로 보낸다 (token_type_hint=refresh_token)', async () => {
    const { client, fetchFn } = setup(() =>
      Promise.resolve(new Response('', { status: 200 })),
    );

    await expect(client.revoke('fake-apple-refresh')).resolves.toBeUndefined();

    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe(APPLE_REVOKE_URL);
    expect(init.method).toBe('POST');
    const body = new URLSearchParams(init.body as string);
    expect(body.get('token')).toBe('fake-apple-refresh');
    expect(body.get('token_type_hint')).toBe('refresh_token');
    expect(body.get('client_id')).toBe('com.example.fake.harukok');
  });

  it('client_secret 은 교환과 같은 ES256 JWT 다 (요청마다 서명)', async () => {
    const { client, fetchFn, publicKey } = setup(() =>
      Promise.resolve(new Response('', { status: 200 })),
    );

    await client.revoke('fake-apple-refresh');

    const body = new URLSearchParams(fetchFn.mock.calls[0][1].body as string);
    await expect(
      jwtVerify(body.get('client_secret') ?? '', publicKey, {
        currentDate: new Date(NOW),
        issuer: 'FAKETEAM01',
        subject: 'com.example.fake.harukok',
        audience: 'https://appleid.apple.com',
      }),
    ).resolves.toBeDefined();
  });

  it('애플이 4xx 를 주면 실패한다 (상태만, 토큰 값은 메시지에 넣지 않음)', async () => {
    const { client } = setup(json(400, { error: 'invalid_client' }));

    const error = await client.revoke('fake-apple-refresh').then(
      () => null,
      (e: unknown) => e as Error,
    );

    expect(error?.message).toMatch(/400.*invalid_client/);
    expect(error?.message).not.toContain('fake-apple-refresh');
  });

  it('5xx 면 한 번 더 시도한다', async () => {
    const responses = [
      new Response('', { status: 503 }),
      new Response('', { status: 200 }),
    ];
    const { client, fetchFn } = setup(() =>
      Promise.resolve(responses.shift() as Response),
    );

    await expect(client.revoke('fake-apple-refresh')).resolves.toBeUndefined();
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
});
