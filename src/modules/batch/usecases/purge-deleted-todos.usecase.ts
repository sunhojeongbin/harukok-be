import { Inject, Injectable, Logger } from '@nestjs/common';
import { BATCH_STORE, type BatchStore } from '../repositories/batch.store';

/** 할 일 정리 배치 (일 1회) — 소프트 삭제 후 7일 지난 할 일을 하드 삭제한다 (DB 설계서 7장) */
@Injectable()
export class PurgeDeletedTodosUseCase {
  private readonly logger = new Logger(PurgeDeletedTodosUseCase.name);

  constructor(@Inject(BATCH_STORE) private readonly store: BatchStore) {}

  async execute(): Promise<number> {
    const purged = await this.store.purgeDeletedTodos();
    this.logger.log(`할 일 정리: 7일 지난 삭제분 ${purged}건 삭제`);
    return purged;
  }
}
