import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Client } from 'pg';
import request from 'supertest';
import type { App } from 'supertest/types';
import { seedTerms, TEMP_TERMS } from '../scripts/db-seed.cjs';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { testDatabaseUrl } from './e2e/test-db';

interface TermBody {
  id: string;
  type: string;
  version: string;
  required: boolean;
  contentUrl: string;
}

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

  async function insertTerm(
    type: string,
    version: string,
    effectiveFrom: string,
    isRequired = true,
  ): Promise<string> {
    const r = await db.query<{ id: string }>(
      `INSERT INTO terms (type, version, title, content_url, is_required, effective_from)
       VALUES ($1, $2, $3, $4, $5, ${effectiveFrom}) RETURNING id`,
      [
        type,
        version,
        `가짜 ${type} ${version}`,
        `https://example.com/${type}/${version}`,
        isRequired,
      ],
    );
    return r.rows[0].id;
  }

  const getTerms = async () => {
    const res = await request(app.getHttpServer()).get('/terms');
    return { status: res.status, body: res.body as TermBody[] };
  };

  it('약관이 없으면 200 []', async () => {
    await expect(getTerms()).resolves.toEqual({ status: 200, body: [] });
  });

  it('유형별 현행 버전만 SERVICE → PRIVACY 순으로, 명세 필드만 돌려준다', async () => {
    await insertTerm('PRIVACY', '1.0', `now() - interval '30 days'`, false);
    await insertTerm('SERVICE', '1.0', `now() - interval '30 days'`);
    const serviceId = await insertTerm(
      'SERVICE',
      '1.1',
      `now() - interval '1 day'`,
    );
    const privacyId = await insertTerm(
      'PRIVACY',
      '1.1',
      `now() - interval '1 day'`,
      false,
    );

    const { status, body } = await getTerms();

    expect(status).toBe(200);
    expect(body).toEqual([
      {
        id: serviceId,
        type: 'SERVICE',
        version: '1.1',
        required: true,
        contentUrl: 'https://example.com/SERVICE/1.1',
      },
      {
        id: privacyId,
        type: 'PRIVACY',
        version: '1.1',
        required: false,
        contentUrl: 'https://example.com/PRIVACY/1.1',
      },
    ]);
  });

  it('시행일이 미래인 개정본은 아직 내보내지 않는다', async () => {
    await insertTerm('SERVICE', '1.0', `now() - interval '1 day'`);
    await insertTerm('SERVICE', '2.0', `now() + interval '7 days'`);

    const { body } = await getTerms();

    expect(body.map((t) => t.version)).toEqual(['1.0']);
  });

  it('인증 없이 호출할 수 있다 (Authorization 헤더 없음)', async () => {
    await insertTerm('SERVICE', '1.0', `now() - interval '1 day'`);

    const res = await request(app.getHttpServer()).get('/terms');

    expect(res.status).toBe(200);
  });

  describe('임시 시드 (npm run db:seed)', () => {
    it('두 번 실행해도 한 번만 들어가고, GET /terms 가 임시 약관 2개를 돌려준다', async () => {
      await expect(seedTerms(db)).resolves.toBe(TEMP_TERMS.length);
      await expect(seedTerms(db)).resolves.toBe(0);

      const { body } = await getTerms();

      expect(body.map((t) => t.type)).toEqual(['SERVICE', 'PRIVACY']);
      for (const t of body) {
        expect(new URL(t.contentUrl).hostname).toBe('example.com');
      }
    });
  });
});
