import { Inject, Injectable, Logger } from '@nestjs/common';
import { BATCH_STORE, type BatchStore } from '../repositories/batch.store';

/** 만료 토큰 정리 배치 (주 1회) — 만료 후 30일 지난 리프레시 토큰을 삭제한다 (DDL 운영 쿼리) */
@Injectable()
export class PurgeExpiredTokensUseCase {
  private readonly logger = new Logger(PurgeExpiredTokensUseCase.name);

  constructor(@Inject(BATCH_STORE) private readonly store: BatchStore) {}

  async execute(): Promise<number> {
    const purged = await this.store.purgeExpiredTokens();
    this.logger.log(`만료 토큰 정리: 만료 30일 지난 토큰 ${purged}건 삭제`);
    return purged;
  }
}
