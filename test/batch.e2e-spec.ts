// 정리 배치 — DB 설계서 9장 "정리 배치(7일 경과분) 하드 삭제" (CLAUDE.md 8장이 6단위에 배정) + 만료 토큰 정리
import { createHash } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { Test } from '@nestjs/testing';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';
import {
  BATCH_JOBS,
  BATCH_TIME_ZONE,
} from '../src/modules/batch/jobs/batch.jobs';
import { PurgeDeletedTodosUseCase } from '../src/modules/batch/usecases/purge-deleted-todos.usecase';
import { PurgeExpiredTokensUseCase } from '../src/modules/batch/usecases/purge-expired-tokens.usecase';
import { testDatabaseUrl } from './e2e/test-db';

describe('정리 배치 (e2e)', () => {
  let app: INestApplication;
  let db: Client;
  let userId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    db = new Client({ connectionString: testDatabaseUrl() });
    await db.connect();
  });

  beforeEach(async () => {
    await db.query('DELETE FROM users');
    const r = await db.query<{ id: string }>(
      'INSERT INTO users DEFAULT VALUES RETURNING id',
    );
    userId = r.rows[0].id;
  });

  afterAll(async () => {
    await db.query('DELETE FROM users');
    await db.end();
    await app.close();
  });

  describe('할 일 정리 — 소프트 삭제 후 7일 지난 것만 하드 삭제', () => {
    async function todo(title: string, deletedAt: string | null) {
      await db.query(
        `INSERT INTO todos (user_id, title, due_date, deleted_at)
         VALUES ($1, $2, '2026-11-01', ${deletedAt ?? 'NULL'})`,
        [userId, title],
      );
    }

    it('8일 전 삭제분만 지우고, 6일 전 삭제분 · 살아 있는 것은 남긴다', async () => {
      await todo('8일 전 삭제', `now() - interval '8 days'`);
      await todo('6일 전 삭제', `now() - interval '6 days'`);
      await todo('살아 있음', null);

      const purged = await app.get(PurgeDeletedTodosUseCase).execute();

      expect(purged).toBe(1);
      const left = await db.query<{ title: string }>('SELECT title FROM todos');
      // 정렬은 DB 로캘(콜레이션)에 따라 달라지므로 JS 에서 정렬해 비교한다
      expect(left.rows.map((r) => r.title).sort()).toEqual([
        '6일 전 삭제',
        '살아 있음',
      ]);
    });

    it('다시 실행하면 0건 (멱등)', async () => {
      await todo('8일 전 삭제', `now() - interval '8 days'`);
      const purge = app.get(PurgeDeletedTodosUseCase);

      await expect(purge.execute()).resolves.toBe(1);
      await expect(purge.execute()).resolves.toBe(0);
    });
  });

  describe('만료 토큰 정리 — 만료 후 30일 지난 것만 삭제', () => {
    async function token(
      device: string,
      createdAt: string,
      expiresAt: string,
      revokedAt: string | null = null,
    ) {
      await db.query(
        `INSERT INTO refresh_tokens (user_id, token_hash, device_id, created_at, expires_at, revoked_at)
         VALUES ($1, $2, $3, ${createdAt}, ${expiresAt}, ${revokedAt ?? 'NULL'})`,
        [userId, createHash('sha256').update(device).digest(), device],
      );
    }

    it('만료 31일 지난 것만 지우고, 29일 지난 것 · 활성 · 최근 폐기는 남긴다', async () => {
      await token(
        'expired-31d',
        `now() - interval '61 days'`,
        `now() - interval '31 days'`,
        `now() - interval '40 days'`,
      );
      await token(
        'expired-29d',
        `now() - interval '59 days'`,
        `now() - interval '29 days'`,
        `now() - interval '35 days'`,
      );
      await token('active', `now()`, `now() + interval '30 days'`);
      await token(
        'revoked-recently',
        `now() - interval '1 day'`,
        `now() + interval '29 days'`,
        `now()`,
      );

      const purged = await app.get(PurgeExpiredTokensUseCase).execute();

      expect(purged).toBe(1);
      const left = await db.query<{ device_id: string }>(
        'SELECT device_id FROM refresh_tokens ORDER BY device_id',
      );
      expect(left.rows.map((r) => r.device_id)).toEqual([
        'active',
        'expired-29d',
        'revoked-recently',
      ]);
    });
  });

  describe('스케줄 등록', () => {
    it.each([
      [BATCH_JOBS.PURGE_DELETED_TODOS.name, '0 4 * * *'],
      [BATCH_JOBS.PURGE_EXPIRED_TOKENS.name, '30 4 * * 1'],
    ])('%s 는 %s (Asia/Seoul) 로 등록된다', (name, cron) => {
      const job = app.get(SchedulerRegistry).getCronJob(name);

      expect(job.cronTime.source).toBe(cron);
      expect(job.cronTime.timeZone).toBe(BATCH_TIME_ZONE);
    });
  });
});
