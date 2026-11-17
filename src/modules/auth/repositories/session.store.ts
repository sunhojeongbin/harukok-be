import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { REFRESH_TOKEN_TTL_DAYS } from '../tokens/token-issuer';

export const SESSION_STORE = Symbol('SESSION_STORE');

/** 재발급 판정에 쓰는 토큰 행 (refresh_tokens) */
export interface StoredRefreshToken {
  userId: string;
  deviceId: string;
  revoked: boolean;
  expired: boolean;
}

export type RefreshJudgement = 'OK' | 'INVALID' | 'REVOKED' | 'EXPIRED';

/**
 * 재발급 판정 (API 설계서 4장 2번 판정 순서).
 * 없음 → INVALID / 기기 불일치 → INVALID / 이미 폐기 = 재사용 → REVOKED / 만료 → EXPIRED
 */
export function judgeRefresh(
  token: StoredRefreshToken | null,
  deviceId: string,
): RefreshJudgement {
  if (!token || token.deviceId !== deviceId) return 'INVALID';
  if (token.revoked) return 'REVOKED';
  if (token.expired) return 'EXPIRED';
  return 'OK';
}

interface TokenRow {
  id: string;
  user_id: string;
  device_id: string;
  revoked: boolean;
  expired: boolean;
}

export type RotateResult =
  | { outcome: 'OK'; userId: string }
  | { outcome: Exclude<RefreshJudgement, 'OK'> };

export interface SessionStore {
  /** 판정 후 OK 면 기존 토큰 폐기 + 같은 기기에 새 토큰. REVOKED 면 그 기기 활성 세션 폐기(커밋)까지 한다 */
  rotate(command: {
    tokenHash: Buffer;
    deviceId: string;
    newTokenHash: Buffer;
  }): Promise<RotateResult>;
  /** 로그아웃: 해당 기기 활성 토큰 폐기. 토큰 없음 · 다른 사용자 · 기기 불일치면 INVALID */
  logout(command: {
    userId: string;
    tokenHash: Buffer;
    deviceId: string;
  }): Promise<'OK' | 'INVALID'>;
}

@Injectable()
export class PgSessionStore implements SessionStore {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * 한 트랜잭션. 토큰 행을 FOR UPDATE 로 잠가 같은 토큰의 동시 재발급을 직렬화한다
   * (늦은 쪽은 폐기된 토큰을 보게 되어 재사용으로 판정된다 — 명세의 의도된 동작).
   * REVOKED 의 세션 폐기는 커밋해야 하므로 예외가 아니라 결과로 돌려준다
   */
  rotate(command: {
    tokenHash: Buffer;
    deviceId: string;
    newTokenHash: Buffer;
  }): Promise<RotateResult> {
    return this.dataSource.transaction(async (m) => {
      const [row]: TokenRow[] = await m.query(
        `SELECT id, user_id, device_id,
                revoked_at IS NOT NULL AS revoked,
                expires_at <= now() AS expired
           FROM refresh_tokens WHERE token_hash = $1
            FOR UPDATE`,
        [command.tokenHash],
      );
      const outcome = judgeRefresh(
        row && {
          userId: row.user_id,
          deviceId: row.device_id,
          revoked: row.revoked,
          expired: row.expired,
        },
        command.deviceId,
      );
      if (outcome === 'REVOKED') {
        // 재사용 감지 — 그 기기의 활성 세션(로테이션으로 받은 새 토큰 포함)을 폐기한다
        await revokeDevice(m, row.user_id, row.device_id);
        return { outcome };
      }
      if (outcome !== 'OK') return { outcome };
      await m.query(
        'UPDATE refresh_tokens SET revoked_at = now() WHERE id = $1',
        [row.id],
      );
      // 슬라이딩: 새 토큰은 지금부터 다시 30일
      await m.query(
        `INSERT INTO refresh_tokens (user_id, token_hash, device_id, expires_at)
         VALUES ($1, $2, $3, now() + make_interval(days => $4))`,
        [
          row.user_id,
          command.newTokenHash,
          row.device_id,
          REFRESH_TOKEN_TTL_DAYS,
        ],
      );
      return { outcome, userId: row.user_id };
    });
  }

  /** 멱등 — 이미 폐기·만료된 토큰도 OK. 남의 토큰 존재 여부는 INVALID 하나로만 알린다 */
  async logout(command: {
    userId: string;
    tokenHash: Buffer;
    deviceId: string;
  }): Promise<'OK' | 'INVALID'> {
    return this.dataSource.transaction(async (m) => {
      const [row]: Pick<TokenRow, 'user_id' | 'device_id'>[] = await m.query(
        'SELECT user_id, device_id FROM refresh_tokens WHERE token_hash = $1',
        [command.tokenHash],
      );
      if (
        !row ||
        row.user_id !== command.userId ||
        row.device_id !== command.deviceId
      ) {
        return 'INVALID';
      }
      await revokeDevice(m, row.user_id, row.device_id);
      return 'OK';
    });
  }
}

/** DDL 운영 쿼리 [로그아웃] — 해당 기기의 활성 토큰 폐기 (행 삭제 아님) */
async function revokeDevice(
  m: EntityManager,
  userId: string,
  deviceId: string,
): Promise<void> {
  await m.query(
    `UPDATE refresh_tokens SET revoked_at = now()
      WHERE user_id = $1 AND device_id = $2 AND revoked_at IS NULL`,
    [userId, deviceId],
  );
}
