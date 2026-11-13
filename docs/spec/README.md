# 명세 사본 (docs/spec)

- 노션 → 저장소 한 방향 동기화다. 이 폴더의 파일은 노션 원본의 사본이다.
- 이 폴더의 파일을 직접 수정하지 않는다. 원문(오탈자 포함)을 보존한다.
- 변경은 노션을 먼저 수정한 뒤, 사본을 갱신하는 PR로 반영한다.

## 문서 우선순위

`DDL(.sql) → DB 표준 → DB 설계서 → ERD`

## 파일 목록

| 파일 | 내용 |
| --- | --- |
| [00-feature-spec.md](00-feature-spec.md) | MVP v1 기능 명세서 (재정의) |
| [01-api.md](01-api.md) | API 설계서 |
| [02-db-design.md](02-db-design.md) | DB 설계서 |
| [03-ddl.md](03-ddl.md) | DDL (001 통합판 + 005) |
| [04-erd.md](04-erd.md) | ERD |
| [05-db-standard.md](05-db-standard.md) | DB 표준 (용어사전 · 명명규칙) |
