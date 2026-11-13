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

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f migrations/20261110_001__init_schema.sql
```

롤백도 같은 방식으로 `.down.sql` 을 지정한다. 파괴적 작업은 `harukok_test`, `harukok_check` 에서만 허용된다 (`scripts/lib/db-guard.cjs`).
