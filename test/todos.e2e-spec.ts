// 할 일 6개 API — 로그인은 가짜 제공자, DB 는 실제 테스트 DB.
// CLAUDE.md 8장이 5단위에 배정한 DB 설계서 9장 항목: 소프트 삭제 → 목록 제외 / 되돌리기 복구 · 재호출 멱등 / 남의 할 일 삭제 0건
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Client } from 'pg';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { SOCIAL_TOKEN_VERIFIER } from '../src/modules/auth/social/social-identity';
import { LIST_TODOS_SQL } from '../src/modules/todos/repositories/todos.store';
import { testDatabaseUrl } from './e2e/test-db';

type Todo = {
  id: string;
  title: string;
  dueDate: string;
  completedAt: string | null;
  createdAt: string;
};

describe('할 일 (e2e)', () => {
  let app: INestApplication<App>;
  let db: Client;
  let me: { token: string; id: string };
  let other: { token: string; id: string };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(SOCIAL_TOKEN_VERIFIER)
      .useValue({
        verify: (_p: string, idToken: string) =>
          Promise.resolve({ providerUserId: idToken, email: null, name: null }),
      })
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    db = new Client({ connectionString: testDatabaseUrl() });
    await db.connect();
  });

  async function login(sub: string) {
    const res = await request(app.getHttpServer())
      .post('/auth/social/login')
      .send({ provider: 'GOOGLE', idToken: sub, deviceId: 'dev-1' });
    const body = res.body as { accessToken: string; user: { id: string } };
    return { token: body.accessToken, id: body.user.id };
  }

  beforeEach(async () => {
    await db.query('DELETE FROM users');
    me = await login('me');
    other = await login('other');
  });

  afterAll(async () => {
    await db.query('DELETE FROM users');
    await db.end();
    await app.close();
  });

  const http = () => request(app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function create(
    title: string,
    dueDate = '2026-11-17',
    token = me.token,
  ): Promise<Todo> {
    const res = await http()
      .post('/todos')
      .set(auth(token))
      .send({ title, dueDate });
    expect(res.status).toBe(201);
    return res.body as Todo;
  }

  const list = async (date = '2026-11-17', token = me.token) => {
    const res = await http().get('/todos').query({ date }).set(auth(token));
    expect(res.status).toBe(200);
    return res.body as Todo[];
  };

  const row = async (id: string) =>
    (
      await db.query<{
        title: string;
        due_date: string;
        completed_at: Date | null;
        deleted_at: Date | null;
      }>(
        'SELECT title, due_date::text AS due_date, completed_at, deleted_at FROM todos WHERE id = $1',
        [id],
      )
    ).rows[0];

  describe('인증', () => {
    it('Bearer 가 없으면 401 ACCESS_TOKEN_INVALID', async () => {
      const res = await http().get('/todos').query({ date: '2026-11-17' });

      expect(res.status).toBe(401);
      expect(res.body).toMatchObject({ code: 'ACCESS_TOKEN_INVALID' });
    });
  });

  describe('POST /todos', () => {
    it('201: { id, title, dueDate, completedAt: null, createdAt }, 날짜는 그대로 저장된다', async () => {
      const todo = await create('가짜 할 일', '2026-11-17');

      expect(todo).toEqual({
        id: expect.any(String) as unknown,
        title: '가짜 할 일',
        dueDate: '2026-11-17',
        completedAt: null,
        createdAt: expect.stringMatching(/Z$/) as unknown,
      });
      expect((await row(todo.id)).due_date).toBe('2026-11-17');
    });

    it('title 의 HTML 은 지우고 앞뒤 공백도 지운다', async () => {
      const todo = await create('  <b>장</b>보기<script>x</script>  ');

      expect(todo.title).toBe('장보기x');
      expect((await row(todo.id)).title).toBe('장보기x');
    });

    it('이모지 250자는 받는다 (DB char_length 와 같은 기준)', async () => {
      const todo = await create('😀'.repeat(250));

      expect([...todo.title]).toHaveLength(250);
    });

    it.each([
      ['공백만', { title: '   ', dueDate: '2026-11-17' }],
      ['HTML 만 (지우면 빈 값)', { title: '<p></p>', dueDate: '2026-11-17' }],
      ['251자', { title: '가'.repeat(251), dueDate: '2026-11-17' }],
      ['title 누락', { dueDate: '2026-11-17' }],
      [
        'dueDate 에 시각·타임존',
        { title: 'x', dueDate: '2026-11-17T00:00:00+09:00' },
      ],
      ['없는 날짜', { title: 'x', dueDate: '2026-02-30' }],
      ['dueDate 누락', { title: 'x' }],
      [
        '정의되지 않은 필드',
        {
          title: 'x',
          dueDate: '2026-11-17',
          completedAt: '2026-11-17T00:00:00Z',
        },
      ],
    ])('%s → 400 VALIDATION_FAILED', async (_label, body) => {
      const res = await http().post('/todos').set(auth(me.token)).send(body);

      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ code: 'VALIDATION_FAILED' });
    });
  });

  describe('GET /todos?date=', () => {
    it('그 날짜의 내 할 일만, 생성순(ORDER BY id), 완료·미완료 포함', async () => {
      const a = await create('첫째');
      const b = await create('둘째');
      await create('다른 날', '2026-11-18');
      await create('남의 것', '2026-11-17', other.token);
      await http()
        .patch(`/todos/${b.id}/completion`)
        .set(auth(me.token))
        .send({ completed: true });

      const todos = await list();

      expect(todos.map((t) => t.title)).toEqual(['첫째', '둘째']);
      expect(todos[0].id).toBe(a.id);
      expect(todos[1].completedAt).not.toBeNull();
    });

    it('할 일이 없으면 []', async () => {
      await expect(list('2030-01-01')).resolves.toEqual([]);
    });

    it.each([
      ['누락', {}],
      ['시각 포함', { date: '2026-11-17T00:00:00Z' }],
      ['없는 날짜', { date: '2026-13-01' }],
    ])('date %s → 400 VALIDATION_FAILED', async (_label, query) => {
      const res = await http().get('/todos').query(query).set(auth(me.token));

      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ code: 'VALIDATION_FAILED' });
    });

    it('목록 쿼리는 부분 인덱스 idx_todos_user_id_due_date 를 탄다 (deleted_at IS NULL 포함)', async () => {
      await db.query('BEGIN');
      try {
        await db.query('SET LOCAL enable_seqscan = off');
        const plan = await db.query<{ 'QUERY PLAN': string }>(
          `EXPLAIN ${LIST_TODOS_SQL}`,
          [me.id, '2026-11-17'],
        );
        expect(plan.rows.map((r) => r['QUERY PLAN']).join('\n')).toContain(
          'idx_todos_user_id_due_date',
        );
      } finally {
        await db.query('ROLLBACK');
      }
    });
  });

  describe('PATCH /todos/{todoId}', () => {
    it('title 만 바꾼다', async () => {
      const t = await create('원래');

      const res = await http()
        .patch(`/todos/${t.id}`)
        .set(auth(me.token))
        .send({ title: '<i>바뀜</i>' });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        id: t.id,
        title: '바뀜',
        dueDate: '2026-11-17',
      });
    });

    it('dueDate 를 바꾸면 다른 날짜 목록으로 옮겨진다', async () => {
      const t = await create('옮길 것');

      await http()
        .patch(`/todos/${t.id}`)
        .set(auth(me.token))
        .send({ dueDate: '2026-11-20' });

      expect(await list('2026-11-17')).toEqual([]);
      expect((await list('2026-11-20')).map((x) => x.id)).toEqual([t.id]);
    });

    it('title · dueDate 둘 다 없으면 400 VALIDATION_FAILED', async () => {
      const t = await create('x');

      const res = await http()
        .patch(`/todos/${t.id}`)
        .set(auth(me.token))
        .send({});

      expect(res.body).toMatchObject({ code: 'VALIDATION_FAILED' });
    });

    it('남의 할 일 · 삭제된 할 일 · 없는 id · UUID 아닌 id 는 모두 404 TODO_NOT_FOUND', async () => {
      const others = await create('남의 것', '2026-11-17', other.token);
      const deleted = await create('삭제됨');
      await http().delete(`/todos/${deleted.id}`).set(auth(me.token));

      for (const id of [
        others.id,
        deleted.id,
        '00000000-0000-7000-8000-000000000000',
        'not-a-uuid',
      ]) {
        const res = await http()
          .patch(`/todos/${id}`)
          .set(auth(me.token))
          .send({ title: '시도' });
        expect({
          id,
          status: res.status,
          body: res.body as unknown,
        }).toMatchObject({
          status: 404,
          body: { code: 'TODO_NOT_FOUND' },
        });
      }
      expect((await row(others.id)).title).toBe('남의 것');
    });
  });

  describe('PATCH /todos/{todoId}/completion', () => {
    const complete = (id: string, completed: boolean, token = me.token) =>
      http()
        .patch(`/todos/${id}/completion`)
        .set(auth(token))
        .send({ completed });

    it('true → 서버 시각으로 완료, 다시 true 를 보내도 처음 완료 시각 유지 (멱등)', async () => {
      const t = await create('x');

      const first = await complete(t.id, true);
      await new Promise((r) => setTimeout(r, 20));
      const again = await complete(t.id, true);

      expect(first.status).toBe(200);
      const at = (first.body as { completedAt: string }).completedAt;
      expect(Math.abs(Date.parse(at) - Date.now())).toBeLessThan(60_000);
      expect(again.body).toEqual({ id: t.id, completedAt: at });
    });

    it('false → completedAt: null, 다시 false 도 200', async () => {
      const t = await create('x');
      await complete(t.id, true);

      expect((await complete(t.id, false)).body).toEqual({
        id: t.id,
        completedAt: null,
      });
      expect((await complete(t.id, false)).status).toBe(200);
    });

    it('completed 가 boolean 이 아니면 400', async () => {
      const t = await create('x');

      const res = await http()
        .patch(`/todos/${t.id}/completion`)
        .set(auth(me.token))
        .send({ completed: 'yes' });

      expect(res.body).toMatchObject({ code: 'VALIDATION_FAILED' });
    });

    it('남의 할 일 · 삭제된 할 일은 404, 남의 할 일은 바뀌지 않는다', async () => {
      const others = await create('남의 것', '2026-11-17', other.token);
      const deleted = await create('삭제됨');
      await http().delete(`/todos/${deleted.id}`).set(auth(me.token));

      expect((await complete(others.id, true)).status).toBe(404);
      expect((await complete(deleted.id, true)).status).toBe(404);
      expect((await row(others.id)).completed_at).toBeNull();
    });
  });

  describe('DELETE /todos/{todoId} · POST /todos/{todoId}/restore', () => {
    const remove = (id: string, token = me.token) =>
      http().delete(`/todos/${id}`).set(auth(token));
    const restore = (id: string, token = me.token) =>
      http().post(`/todos/${id}/restore`).set(auth(token));

    it('소프트 삭제 → 목록에서 빠지고 행은 남는다 (deleted_at 기록)', async () => {
      const t = await create('지울 것');

      expect((await remove(t.id)).status).toBe(204);

      expect(await list()).toEqual([]);
      expect((await row(t.id)).deleted_at).not.toBeNull();
    });

    it('이미 삭제한 내 할 일을 다시 삭제해도 204, 삭제 시각은 처음 것 유지 (멱등)', async () => {
      const t = await create('x');
      await remove(t.id);
      const firstDeletedAt = (await row(t.id)).deleted_at;

      expect((await remove(t.id)).status).toBe(204);
      expect((await row(t.id)).deleted_at).toEqual(firstDeletedAt);
    });

    it('남의 할 일 삭제는 404, 그 할 일은 0건 영향', async () => {
      const others = await create('남의 것', '2026-11-17', other.token);

      const res = await remove(others.id);

      expect(res.status).toBe(404);
      expect(res.body).toMatchObject({ code: 'TODO_NOT_FOUND' });
      expect((await row(others.id)).deleted_at).toBeNull();
    });

    it('없는 id 삭제는 404', async () => {
      expect(
        (await remove('00000000-0000-7000-8000-000000000000')).status,
      ).toBe(404);
    });

    it('되돌리기 → 200, 같은 행이 같은 자리(생성순)로 돌아온다', async () => {
      const a = await create('첫째');
      const b = await create('둘째');
      await remove(a.id);

      const res = await restore(a.id);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ id: a.id, title: '첫째' });
      expect((await list()).map((t) => t.id)).toEqual([a.id, b.id]);
    });

    it('되돌리기 재호출 · 삭제한 적 없는 할 일도 200 (멱등, 0건 영향)', async () => {
      const t = await create('x');
      await remove(t.id);
      await restore(t.id);

      expect((await restore(t.id)).status).toBe(200);
      const never = await create('삭제 안 함');
      expect((await restore(never.id)).body).toMatchObject({ id: never.id });
    });

    it('남의 할 일 되돌리기는 404, 그 할 일은 삭제된 채로', async () => {
      const others = await create('남의 것', '2026-11-17', other.token);
      await remove(others.id, other.token);

      expect((await restore(others.id)).status).toBe(404);
      expect((await row(others.id)).deleted_at).not.toBeNull();
    });

    it('정리 배치로 하드 삭제된 뒤에는 404', async () => {
      const t = await create('x');
      await remove(t.id);
      await db.query('DELETE FROM todos WHERE id = $1', [t.id]);

      expect((await restore(t.id)).status).toBe(404);
    });
  });
});
