import type { ExecutionContext } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { SignJWT, UnsecuredJWT } from 'jose';
import { BusinessException } from '../errors/business.exception';
import type { EnvironmentVariables } from '../config/env.validation';
import { AccessTokenErrors } from './access-token.errors';
import {
  AccessTokenGuard,
  type AuthenticatedRequest,
} from './access-token.guard';

const SECRET = 'fake-access-secret-for-tests-only-0123456789';
const key = (s: string) => new TextEncoder().encode(s);

const guard = new AccessTokenGuard({
  get: () => SECRET,
} as unknown as ConfigService<EnvironmentVariables, true>);

function contextWith(authorization?: string) {
  const request: AuthenticatedRequest = {
    headers: authorization === undefined ? {} : { authorization },
  };
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { context, request };
}

const sign = (
  claims: { sub?: string; exp?: number | string } = {},
  secret = SECRET,
) => {
  const jwt = new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(claims.exp ?? '1h');
  if (claims.sub !== undefined) jwt.setSubject(claims.sub);
  return jwt.sign(key(secret));
};

async function expectInvalid(authorization?: string) {
  const { context, request } = contextWith(authorization);
  const result = guard.canActivate(context);
  await expect(result).rejects.toBeInstanceOf(BusinessException);
  await expect(result).rejects.toMatchObject({
    definition: AccessTokenErrors.ACCESS_TOKEN_INVALID,
  });
  expect(request.user).toBeUndefined();
}

describe('AccessTokenGuard', () => {
  it('유효한 Bearer 토큰이면 통과하고 request.user.userId = sub', async () => {
    const { context, request } = contextWith(
      `Bearer ${await sign({ sub: 'fake-user-id' })}`,
    );

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user).toEqual({ userId: 'fake-user-id' });
  });

  it('Authorization 헤더가 없으면 ACCESS_TOKEN_INVALID', async () => {
    await expectInvalid(undefined);
  });

  it.each(['', 'Bearer', 'Bearer ', 'Basic abc', 'bearer-without-space'])(
    '형식이 틀린 헤더 %j 는 ACCESS_TOKEN_INVALID',
    async (header) => {
      await expectInvalid(header);
    },
  );

  it('만료된 토큰은 ACCESS_TOKEN_INVALID', async () => {
    const past = Math.floor(Date.now() / 1000) - 60;

    await expectInvalid(`Bearer ${await sign({ sub: 'u', exp: past })}`);
  });

  it('다른 비밀키로 서명한 토큰은 ACCESS_TOKEN_INVALID', async () => {
    await expectInvalid(
      `Bearer ${await sign({ sub: 'u' }, 'another-fake-secret-0123456789abcdef')}`,
    );
  });

  it('서명 없는(alg=none) 토큰은 ACCESS_TOKEN_INVALID', async () => {
    const unsigned = new UnsecuredJWT({ sub: 'u' })
      .setIssuedAt()
      .setExpirationTime('1h')
      .encode();

    await expectInvalid(`Bearer ${unsigned}`);
  });

  it('sub 가 없으면 ACCESS_TOKEN_INVALID', async () => {
    await expectInvalid(`Bearer ${await sign({})}`);
  });

  it('JWT 형식이 아니면 ACCESS_TOKEN_INVALID', async () => {
    await expectInvalid('Bearer not-a-jwt');
  });

  it('스킴은 대소문자를 가리지 않는다 (RFC 6750)', async () => {
    const { context, request } = contextWith(
      `bearer ${await sign({ sub: 'fake-user-id' })}`,
    );

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user).toEqual({ userId: 'fake-user-id' });
  });
});
