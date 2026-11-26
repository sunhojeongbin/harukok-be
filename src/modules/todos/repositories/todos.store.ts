import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

export const TODOS_STORE = Symbol('TODOS_STORE');

/** due_date 는 'YYYY-MM-DD' 문자열로 꺼낸다 — Date 로 받으면 서버 타임존에 따라 하루 밀릴 수 있다 */
export interface TodoRecord {
  id: string;
  title: string;
  dueDate: string;
  completedAt: Date | null;
  createdAt: Date;
}

export type DeleteOutcome = 'DELETED' | 'ALREADY_DELETED' | 'NOT_FOUND';

// due_date 는 ::text 로 꺼낸다 (Date 로 받으면 서버 타임존에 따라 하루 밀린다)
const COLUMNS =
  'id, title, due_date::text AS due_date, completed_at, created_at';

/** 홈 목록. 부분 인덱스 idx_todos_user_id_due_date 를 타려면 deleted_at IS NULL 이 반드시 있어야 한다 (e2e 가 EXPLAIN 으로 확인) */
export const LIST_TODOS_SQL = `SELECT ${COLUMNS} FROM todos
  WHERE user_id = $1 AND due_date = $2 AND deleted_at IS NULL
  ORDER BY id`;

interface TodoRow {
  id: string;
  title: string;
  due_date: string;
  completed_at: Date | null;
  created_at: Date;
}

const toRecord = (r: TodoRow): TodoRecord => ({
  id: r.id,
  title: r.title,
  dueDate: r.due_date,
  completedAt: r.completed_at,
  createdAt: r.created_at,
});

/**
 * 홈 달력 날짜별 개수 (API 설계서 4장 13번). generate_series + LEFT JOIN 으로 빈 날짜를 0 으로 채운다.
 * COUNT 는 bigint 라 드라이버가 문자열로 주므로 ::int, 날짜는 JS Date 변환 시 타임존 밀림을 피하려 to_char.
 * $1 startDate, $2 endDate, $3 userId
 */
export const TODO_STATS_SQL = `SELECT
  to_char(d::date, 'YYYY-MM-DD')                              AS date,
  COUNT(t.id)::int                                            AS "totalCount",
  COUNT(t.id) FILTER (WHERE t.completed_at IS NOT NULL)::int  AS "completedCount"
FROM generate_series($1::date, $2::date, interval '1 day') AS d
LEFT JOIN todos t
  ON  t.due_date   = d::date
  AND t.user_id    = $3
  AND t.deleted_at IS NULL
GROUP BY d
ORDER BY d`;

export interface TodoDayCount {
  date: string;
  totalCount: number;
  completedCount: number;
}

/** 모든 조회 · 수정 · 완료 변경은 user_id 와 deleted_at IS NULL 을 조건에 넣는다 (CLAUDE.md 4장) */
export interface TodosStore {
  list(userId: string, dueDate: string): Promise<TodoRecord[]>;
  /** 사용자가 없으면(탈퇴 후 남은 액세스 토큰) NULL */
  create(
    userId: string,
    title: string,
    dueDate: string,
  ): Promise<TodoRecord | null>;
  /** 제목만 바꾼다 — 날짜는 수정 대상이 아니다 */
  update(
    userId: string,
    todoId: string,
    title: string,
  ): Promise<TodoRecord | null>;
  setCompleted(
    userId: string,
    todoId: string,
    completed: boolean,
  ): Promise<{ id: string; completedAt: Date | null } | null>;
  softDelete(userId: string, todoId: string): Promise<DeleteOutcome>;
  /** 복구 후(또는 이미 살아 있으면 그대로) 살아 있는 할 일. 없거나 타인 소유면 NULL */
  restore(userId: string, todoId: string): Promise<TodoRecord | null>;
  /** startDate ~ endDate 의 모든 날짜(오름차순)와 그날의 내 할 일 개수 · 완료 개수 */
  countByDate(
    userId: string,
    startDate: string,
    endDate: string,
  ): Promise<TodoDayCount[]>;
}

@Injectable()
export class PgTodosStore implements TodosStore {
  constructor(private readonly dataSource: DataSource) {}

  async list(userId: string, dueDate: string): Promise<TodoRecord[]> {
    const rows: TodoRow[] = await this.dataSource.query(LIST_TODOS_SQL, [
      userId,
      dueDate,
    ]);
    return rows.map(toRecord);
  }

  async create(
    userId: string,
    title: string,
    dueDate: string,
  ): Promise<TodoRecord | null> {
    try {
      const [row]: TodoRow[] = await this.dataSource.query(
        `INSERT INTO todos (user_id, title, due_date) VALUES ($1, $2, $3)
         RETURNING ${COLUMNS}`,
        [userId, title, dueDate],
      );
      return toRecord(row);
    } catch (error) {
      // 액세스 토큰은 탈퇴 후에도 1시간 유효하다 — 사용자 FK 위반은 500 이 아니라 '사용자 없음' (보안 점검 #6)
      if (isUserForeignKeyViolation(error)) return null;
      throw error;
    }
  }

  // UPDATE … RETURNING 은 TypeORM 이 [행, 개수] 로 돌려주므로 CTE 로 감싸 SELECT 행으로 받는다
  async update(
    userId: string,
    todoId: string,
    title: string,
  ): Promise<TodoRecord | null> {
    const [row]: TodoRow[] = await this.dataSource.query(
      `WITH u AS (
         UPDATE todos
            SET title = $3
          WHERE id = $2 AND user_id = $1 AND deleted_at IS NULL
         RETURNING ${COLUMNS}
       ) SELECT * FROM u`,
      [userId, todoId, title],
    );
    return row ? toRecord(row) : null;
  }

  /** true 는 COALESCE — 이미 완료면 처음 완료 시각 유지 (멱등). 시각은 서버 now() */
  async setCompleted(
    userId: string,
    todoId: string,
    completed: boolean,
  ): Promise<{ id: string; completedAt: Date | null } | null> {
    const [row]: Pick<TodoRow, 'id' | 'completed_at'>[] =
      await this.dataSource.query(
        `WITH u AS (
           UPDATE todos
              SET completed_at = CASE WHEN $3 THEN COALESCE(completed_at, now()) END
            WHERE id = $2 AND user_id = $1 AND deleted_at IS NULL
           RETURNING id, completed_at
         ) SELECT * FROM u`,
        [userId, todoId, completed],
      );
    return row ? { id: row.id, completedAt: row.completed_at } : null;
  }

  /**
   * 한 문장으로 세 경우를 가른다. 같은 문장의 SELECT 는 UPDATE 전 스냅샷을 본다 —
   * 방금 지운 행은 두 번째 SELECT 에 잡히지 않고, 이미 지워져 있던 행만 잡힌다
   */
  async softDelete(userId: string, todoId: string): Promise<DeleteOutcome> {
    const [row]: { outcome: DeleteOutcome }[] = await this.dataSource.query(
      `WITH u AS (
         UPDATE todos SET deleted_at = now()
          WHERE id = $2 AND user_id = $1 AND deleted_at IS NULL
         RETURNING id
       )
       SELECT 'DELETED' AS outcome FROM u
       UNION ALL
       SELECT 'ALREADY_DELETED' FROM todos
        WHERE id = $2 AND user_id = $1 AND deleted_at IS NOT NULL`,
      [userId, todoId],
    );
    return row?.outcome ?? 'NOT_FOUND';
  }

  /** 삭제돼 있으면 되살리고, 이미 살아 있으면 그대로 (스냅샷 규칙은 softDelete 와 같다) */
  async restore(userId: string, todoId: string): Promise<TodoRecord | null> {
    const [row]: TodoRow[] = await this.dataSource.query(
      `WITH u AS (
         UPDATE todos SET deleted_at = NULL
          WHERE id = $2 AND user_id = $1 AND deleted_at IS NOT NULL
         RETURNING ${COLUMNS}
       )
       SELECT * FROM u
       UNION ALL
       SELECT ${COLUMNS} FROM todos
        WHERE id = $2 AND user_id = $1 AND deleted_at IS NULL`,
      [userId, todoId],
    );
    return row ? toRecord(row) : null;
  }

  async countByDate(
    userId: string,
    startDate: string,
    endDate: string,
  ): Promise<TodoDayCount[]> {
    return this.dataSource.query(TODO_STATS_SQL, [startDate, endDate, userId]);
  }
}

function isUserForeignKeyViolation(error: unknown): boolean {
  const e = error as {
    driverError?: { code?: string; constraint?: string };
    code?: string;
    constraint?: string;
  };
  const pg = e.driverError ?? e;
  return pg.code === '23503' && pg.constraint === 'todos_user_id_fkey';
}
