import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { BusinessException } from '../../../common/errors/business.exception';
import { AuthErrors } from '../errors/auth.errors';
import type { SocialProvider } from '../social/social-identity';
import { REFRESH_TOKEN_TTL_DAYS } from '../tokens/token-issuer';

export const LOGIN_STORE = Symbol('LOGIN_STORE');

export interface LoginCommand {
  provider: SocialProvider;
  providerUserId: string;
  /** 정규화된 값. 신규 가입에만 저장한다 */
  email: string | null;
  name: string | null;
  /** 신규 가입 시 동의한 현행 이용약관. 기존 사용자면 무시 */
  agreedTermId: string | null;
  /** 애플 refresh token 암호문. NULL 이면 기존 값을 건드리지 않는다 */
  appleRefreshTokenEnc: Buffer | null;
  deviceId: string;
  refreshTokenHash: Buffer;
}

export interface LoginResult {
  userId: string;
  isNewUser: boolean;
  name: string | null;
  providers: SocialProvider[];
}

/** 로그인 1건을 한 트랜잭션으로 처리한다 (가입 · 동의 기록 · DB 설계서 6장 기기 토큰). */
export interface LoginStore {
  findUserId(
    provider: SocialProvider,
    providerUserId: string,
  ): Promise<string | null>;
  login(command: LoginCommand): Promise<LoginResult>;
}

const SOCIAL_UNIQUE = 'uq_user_social_accounts_provider_user_id';

/** 같은 소셜 계정의 동시 첫 로그인: 늦은 쪽이 이 UNIQUE 에 걸린다 */
function isSocialUniqueViolation(error: unknown): boolean {
  const e = error as {
    driverError?: { code?: string; constraint?: string };
    code?: string;
    constraint?: string;
  };
  const pg = e.driverError ?? e;
  return pg.code === '23505' && pg.constraint === SOCIAL_UNIQUE;
}

@Injectable()
export class PgLoginStore implements LoginStore {
  constructor(private readonly dataSource: DataSource) {}

  async findUserId(
    provider: SocialProvider,
    providerUserId: string,
  ): Promise<string | null> {
    return findSocialUser(this.dataSource.manager, provider, providerUserId);
  }

  async login(command: LoginCommand): Promise<LoginResult> {
    try {
      return await this.runLogin(command);
    } catch (error) {
      // 동시에 먼저 가입한 쪽이 있다 → 롤백됐으니 기존 사용자 로그인으로 한 번 더 처리한다
      if (isSocialUniqueViolation(error)) return this.runLogin(command);
      throw error;
    }
  }

  private runLogin(cmd: LoginCommand): Promise<LoginResult> {
    return this.dataSource.transaction(async (m) => {
      const existing = await findSocialUser(
        m,
        cmd.provider,
        cmd.providerUserId,
      );
      const userId = existing ?? (await signUp(m, cmd));
      if (existing && cmd.appleRefreshTokenEnc) {
        await m.query(
          `UPDATE user_social_accounts SET provider_refresh_token_enc = $1
            WHERE provider = $2 AND provider_user_id = $3`,
          [cmd.appleRefreshTokenEnc, cmd.provider, cmd.providerUserId],
        );
      }
      await issueDeviceToken(m, userId, cmd);
      return {
        userId,
        isNewUser: existing === null,
        ...(await profile(m, userId)),
      };
    });
  }
}

async function findSocialUser(
  m: EntityManager,
  provider: SocialProvider,
  providerUserId: string,
): Promise<string | null> {
  const rows: { user_id: string }[] = await m.query(
    `SELECT user_id FROM user_social_accounts
      WHERE provider = $1 AND provider_user_id = $2`,
    [provider, providerUserId],
  );
  return rows[0]?.user_id ?? null;
}

async function signUp(m: EntityManager, cmd: LoginCommand): Promise<string> {
  // 유스케이스가 기존 사용자로 판정했는데 그 사이 탈퇴한 경우 — 동의 없이 가입시키지 않는다
  if (!cmd.agreedTermId) {
    throw new BusinessException(AuthErrors.TERMS_AGREEMENT_REQUIRED);
  }
  const [user]: { id: string }[] = await m.query(
    'INSERT INTO users (name, email) VALUES ($1, $2) RETURNING id',
    [cmd.name, cmd.email],
  );
  await m.query(
    `INSERT INTO user_social_accounts (user_id, provider, provider_user_id, provider_refresh_token_enc)
     VALUES ($1, $2, $3, $4)`,
    [user.id, cmd.provider, cmd.providerUserId, cmd.appleRefreshTokenEnc],
  );
  await m.query(
    'INSERT INTO user_term_agreements (user_id, term_id) VALUES ($1, $2)',
    [user.id, cmd.agreedTermId],
  );
  return user.id;
}

/** DB 설계서 6장 그대로 — 기기당 1개, 최대 3대 (초과 시 가장 오래된 기기 폐기) */
async function issueDeviceToken(
  m: EntityManager,
  userId: string,
  cmd: LoginCommand,
): Promise<void> {
  // (1) 동시 로그인 레이스 차단
  await m.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [userId]);
  // (2) 같은 기기의 기존 토큰 폐기
  await m.query(
    `UPDATE refresh_tokens SET revoked_at = now()
      WHERE user_id = $1 AND device_id = $2 AND revoked_at IS NULL`,
    [userId, cmd.deviceId],
  );
  // (3) 활성 토큰이 3개 이상이면 최신 2개만 남기고 폐기
  await m.query(
    `UPDATE refresh_tokens SET revoked_at = now()
      WHERE id IN (
        SELECT id FROM refresh_tokens
         WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now()
         ORDER BY created_at DESC, id DESC   -- 동일 시각 타이브레이커 필수
        OFFSET 2
      )`,
    [userId],
  );
  // (4) 신규 발급 → 결과적으로 정확히 3개
  await m.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, device_id, expires_at)
     VALUES ($1, $2, $3, now() + make_interval(days => $4))`,
    [userId, cmd.refreshTokenHash, cmd.deviceId, REFRESH_TOKEN_TTL_DAYS],
  );
}

async function profile(
  m: EntityManager,
  userId: string,
): Promise<Pick<LoginResult, 'name' | 'providers'>> {
  const [user]: { name: string | null }[] = await m.query(
    'SELECT name FROM users WHERE id = $1',
    [userId],
  );
  const providers: { provider: SocialProvider }[] = await m.query(
    `SELECT provider FROM user_social_accounts
      WHERE user_id = $1 ORDER BY created_at, provider`,
    [userId],
  );
  return { name: user.name, providers: providers.map((p) => p.provider) };
}
