import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

export const BATCH_STORE = Symbol('BATCH_STORE');

/** 정리 배치 SQL — API 설계서 8장 · DDL 운영 쿼리 그대로. 둘 다 멱등이라 여러 인스턴스가 함께 돌아도 된다 */
export interface BatchStore {
  /** 소프트 삭제 후 7일 지난 할 일 하드 삭제. 지운 건수 */
  purgeDeletedTodos(): Promise<number>;
  /** 만료 후 30일 지난 리프레시 토큰 삭제. 지운 건수 */
  purgeExpiredTokens(): Promise<number>;
}

@Injectable()
export class PgBatchStore implements BatchStore {
  constructor(private readonly dataSource: DataSource) {}

  // DELETE 결과는 TypeORM 이 [행, 개수] 로 돌려주므로 CTE 로 감싸 건수만 SELECT 한다
  async purgeDeletedTodos(): Promise<number> {
    return this.count(
      `WITH d AS (
         DELETE FROM todos WHERE deleted_at < now() - interval '7 days' RETURNING 1
       ) SELECT count(*)::int AS n FROM d`,
    );
  }

  async purgeExpiredTokens(): Promise<number> {
    return this.count(
      `WITH d AS (
         DELETE FROM refresh_tokens WHERE expires_at < now() - interval '30 days' RETURNING 1
       ) SELECT count(*)::int AS n FROM d`,
    );
  }

  private async count(sql: string): Promise<number> {
    const [row]: { n: number }[] = await this.dataSource.query(sql);
    return row.n;
  }
}
