import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { BatchJobs } from './jobs/batch.jobs';
import { BATCH_STORE, PgBatchStore } from './repositories/batch.store';
import { PurgeDeletedTodosUseCase } from './usecases/purge-deleted-todos.usecase';
import { PurgeExpiredTokensUseCase } from './usecases/purge-expired-tokens.usecase';

/** 정리 배치 — 앱 안의 cron. SQL 이 멱등이라 여러 인스턴스가 함께 실행해도 결과가 같다 */
@Module({
  imports: [ScheduleModule.forRoot()],
  providers: [
    PurgeDeletedTodosUseCase,
    PurgeExpiredTokensUseCase,
    BatchJobs,
    { provide: BATCH_STORE, useClass: PgBatchStore },
  ],
})
export class BatchModule {}
