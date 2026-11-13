# 마이그레이션

## 파일명 규칙

- 적용: `YYYYMMDD_NNN__name.sql`
- 롤백: `YYYYMMDD_NNN__name.down.sql`
- 예: `20261110_001__init_schema.sql`, `20261110_001__init_schema.down.sql`

## 002~004 가 없는 이유

002~004 는 적용된 DB 가 없어서 001 통합판으로 대체했다. 번호가 비어 있는 것은 의도된 것이다.

## 수정 규칙

- `main` 에 병합된 파일은 수정 금지. 변경은 새 번호 파일로 추가한다.

## 적용 명령

| 명령                  | 대상                   | 동작                                                                      |
| --------------------- | ---------------------- | ------------------------------------------------------------------------- |
| `npm run db:migrate`  | `DATABASE_URL`         | 미적용분을 버전 순으로 적용, `schema_migrations` 에 기록                  |
| `npm run db:rollback` | `TEST_DATABASE_URL`    | 마지막 1개를 `.down.sql` 로 롤백                                          |
| `npm run db:check`    | `harukok_check` (임시) | 생성 → 전체 적용 → 전체 롤백(잔여 객체 0) → 재적용(첫 적용과 동일) → 삭제 |

실행기는 `scripts/db-migrate.cjs` 이고 Node `pg` 로 파일 내용을 그대로 보낸다(각 파일이 자체 `BEGIN`/`COMMIT` 을 가진다). 파괴적 작업은 `harukok_test`, `harukok_check` 에서만 허용된다 (`scripts/lib/db-guard.cjs`).
