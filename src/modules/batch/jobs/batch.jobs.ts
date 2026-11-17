import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PurgeDeletedTodosUseCase } from '../usecases/purge-deleted-todos.usecase';
import { PurgeExpiredTokensUseCase } from '../usecases/purge-expired-tokens.usecase';

export const BATCH_TIME_ZONE = 'Asia/Seoul';
export const BATCH_JOBS = {
  PURGE_DELETED_TODOS: { name: 'purge-deleted-todos', cron: '0 4 * * *' }, // 매일 04:00
  PURGE_EXPIRED_TOKENS: { name: 'purge-expired-tokens', cron: '30 4 * * 1' }, // 매주 월 04:30
} as const;

/** 실패해도 예외를 밖으로 던지지 않는다 — 서버는 계속 돌고 다음 주기에 다시 실행된다 */
@Injectable()
export class BatchJobs {
  private readonly logger = new Logger(BatchJobs.name);

  constructor(
    private readonly purgeDeletedTodos: PurgeDeletedTodosUseCase,
    private readonly purgeExpiredTokens: PurgeExpiredTokensUseCase,
  ) {}

  @Cron(BATCH_JOBS.PURGE_DELETED_TODOS.cron, {
    name: BATCH_JOBS.PURGE_DELETED_TODOS.name,
    timeZone: BATCH_TIME_ZONE,
  })
  runPurgeDeletedTodos(): Promise<void> {
    return this.run(BATCH_JOBS.PURGE_DELETED_TODOS.name, () =>
      this.purgeDeletedTodos.execute(),
    );
  }

  @Cron(BATCH_JOBS.PURGE_EXPIRED_TOKENS.cron, {
    name: BATCH_JOBS.PURGE_EXPIRED_TOKENS.name,
    timeZone: BATCH_TIME_ZONE,
  })
  runPurgeExpiredTokens(): Promise<void> {
    return this.run(BATCH_JOBS.PURGE_EXPIRED_TOKENS.name, () =>
      this.purgeExpiredTokens.execute(),
    );
  }

  private async run(name: string, job: () => Promise<number>): Promise<void> {
    try {
      await job();
    } catch (error) {
      this.logger.error(
        `배치 ${name} 실패 — 다음 주기에 다시 실행된다`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
