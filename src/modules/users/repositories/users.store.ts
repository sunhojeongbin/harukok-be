import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { SocialProvider } from '../../auth/social/social-identity';

export const USERS_STORE = Symbol('USERS_STORE');

export interface UserProfile {
  id: string;
  name: string | null;
  email: string | null;
  provider: SocialProvider;
  createdAt: Date;
}

/** 탈퇴 시 연동 해제에 필요한 값 */
export interface LinkedAccount {
  provider: SocialProvider;
  providerUserId: string;
  /** 애플만. NULL 이면 로그인 때 코드 교환이 실패했던 사용자 */
  appleRefreshTokenEnc: Buffer | null;
}

export interface UsersStore {
  findProfile(userId: string): Promise<UserProfile | null>;
  /** 사용자가 없으면 NULL */
  findLinkedAccounts(userId: string): Promise<LinkedAccount[] | null>;
  /** users 1행 삭제 (CASCADE). 지운 행이 없으면 false */
  deleteUser(userId: string): Promise<boolean>;
}

@Injectable()
export class PgUsersStore implements UsersStore {
  constructor(private readonly dataSource: DataSource) {}

  async findProfile(userId: string): Promise<UserProfile | null> {
    // 계정 연동이 없어 소셜 계정은 사용자당 하나 — 가장 먼저 연결된 것을 쓴다 (가입과 같은 트랜잭션에서 만들어져 항상 있다)
    const [row]: {
      id: string;
      name: string | null;
      email: string | null;
      provider: SocialProvider;
      created_at: Date;
    }[] = await this.dataSource.query(
      `SELECT u.id, u.name, u.email, s.provider, u.created_at
         FROM users u
         JOIN user_social_accounts s ON s.user_id = u.id
        WHERE u.id = $1
        ORDER BY s.created_at, s.provider
        LIMIT 1`,
      [userId],
    );
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      provider: row.provider,
      createdAt: row.created_at,
    };
  }

  async findLinkedAccounts(userId: string): Promise<LinkedAccount[] | null> {
    const exists: unknown[] = await this.dataSource.query(
      'SELECT 1 FROM users WHERE id = $1',
      [userId],
    );
    if (exists.length === 0) return null;
    const rows: {
      provider: SocialProvider;
      provider_user_id: string;
      provider_refresh_token_enc: Buffer | null;
    }[] = await this.dataSource.query(
      `SELECT provider, provider_user_id, provider_refresh_token_enc
         FROM user_social_accounts WHERE user_id = $1 ORDER BY created_at, provider`,
      [userId],
    );
    return rows.map((r) => ({
      provider: r.provider,
      providerUserId: r.provider_user_id,
      appleRefreshTokenEnc: r.provider_refresh_token_enc,
    }));
  }

  /** ON DELETE CASCADE 로 소셜 계정 · 약관 동의 · 토큰 · 할 일이 함께 지워진다 */
  async deleteUser(userId: string): Promise<boolean> {
    // TypeORM 은 DELETE 결과를 [행, 개수] 로 돌려준다 — CTE 로 감싸 SELECT 행으로 받는다
    const deleted: { id: string }[] = await this.dataSource.query(
      'WITH d AS (DELETE FROM users WHERE id = $1 RETURNING id) SELECT id FROM d',
      [userId],
    );
    return deleted.length === 1;
  }
}
