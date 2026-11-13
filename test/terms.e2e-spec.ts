import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Client } from 'pg';
import request from 'supertest';
import type { App } from 'supertest/types';
import { seedTerms, TEMP_TERMS } from '../scripts/db-seed.cjs';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { testDatabaseUrl } from './e2e/test-db';

describe('GET /terms (e2e)', () => {
  let app: INestApplication<App>;
  let db: Client;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    db = new Client({ connectionString: testDatabaseUrl() });
    await db.connect();
  });

  // 앱은 별도 연결이라 트랜잭션 롤백으로 격리할 수 없다. 테스트마다 비운다.
  beforeEach(async () => {
    await db.query('DELETE FROM terms');
  });

  afterAll(async () => {
    await db.query('DELETE FROM terms');
    await db.end();
    await app.close();
  });

  /** effectiveFrom·createdAt 은 SQL 식 (now() 기준 상대 시각) */
  async function insertTerm(
    version: string,
    effectiveFrom: string,
    createdAt = 'now()',
  ): Promise<string> {
    const r = await db.query<{ id: string }>(
      `INSERT INTO terms (version, title, content_url, effective_from, created_at)
       VALUES ($1, $2, $3, ${effectiveFrom}, ${createdAt}) RETURNING id`,
      [
        version,
        `가짜 이용약관 ${version}`,
        `https://example.com/terms/${version}`,
      ],
    );
    return r.rows[0].id;
  }

  const getTerms = () => request(app.getHttpServer()).get('/terms');

  it('시행 중인 이용약관이 없으면 404 { code: TERM_NOT_FOUND }', async () => {
    const res = await getTerms();

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ code: 'TERM_NOT_FOUND' });
  });

  it('개정 이력 중 현행 버전 1개를 { id, version, contentUrl } 로만 돌려준다', async () => {
    await insertTerm('1.0', `now() - interval '30 days'`);
    const currentId = await insertTerm('1.1', `now() - interval '1 day'`);

    const res = await getTerms();

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id: currentId,
      version: '1.1',
      contentUrl: 'https://example.com/terms/1.1',
    });
  });

  it('시행일이 미래인 개정본은 아직 내보내지 않는다', async () => {
    await insertTerm('1.0', `now() - interval '1 day'`);
    await insertTerm('2.0', `now() + interval '7 days'`);

    const res = await getTerms();

    expect(res.body).toMatchObject({ version: '1.0' });
  });

  it('미래 시행본만 있으면 404', async () => {
    await insertTerm('2.0', `now() + interval '7 days'`);

    expect((await getTerms()).status).toBe(404);
  });

  it('시행일이 같으면 나중에 등록된 버전을 고른다', async () => {
    const same = `date_trunc('day', now()) - interval '1 day'`;
    await insertTerm('1.1', same, `now() - interval '2 hours'`);
    await insertTerm('1.2', same, `now() - interval '1 hour'`);

    const res = await getTerms();

    expect(res.body).toMatchObject({ version: '1.2' });
  });

  it('인증 없이 호출할 수 있다 (Authorization 헤더 없음)', async () => {
    await insertTerm('1.0', `now() - interval '1 day'`);

    expect((await getTerms()).status).toBe(200);
  });

  describe('임시 시드 (npm run db:seed)', () => {
    it('두 번 실행해도 한 번만 들어가고, GET /terms 가 임시 이용약관을 돌려준다', async () => {
      await expect(seedTerms(db)).resolves.toBe(TEMP_TERMS.length);
      await expect(seedTerms(db)).resolves.toBe(0);

      const res = await getTerms();

      expect(res.status).toBe(200);
      expect(
        new URL((res.body as { contentUrl: string }).contentUrl).hostname,
      ).toBe('example.com');
    });
  });
});
