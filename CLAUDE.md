# CLAUDE.md — 하루콕 백엔드 규칙서

## 1. 프로젝트

- 하루콕: 일정(할 일) 관리 앱 백엔드. NestJS + PostgreSQL 18. 출시 목표 2026-11-30
- 명세 원본: `docs/spec/` (노션 사본, 수정 금지)
- 문서 우선순위: DDL(.sql) → DB 표준 → DB 설계서 → ERD. 충돌하면 앞쪽을 따른다
- 로컬 DB: Mac 에 Homebrew 로 설치한 PostgreSQL 18 (Docker 미사용). 설정은 `docs/setup-local.md`

## 2. 명령어

| 명령                                                              | 용도                                                         |
| ----------------------------------------------------------------- | ------------------------------------------------------------ |
| `npm run lint` / `npm run lint:fix`                               | ESLint 검사 / 자동 수정                                      |
| `npm run format` / `npm run format:check`                         | Prettier 적용 / 검사                                         |
| `npm run typecheck`                                               | 타입 검사                                                    |
| `npm run test`                                                    | 단위 테스트                                                  |
| `npm run test:e2e`                                                | DB 통합 테스트                                               |
| `npm run test:integrity`                                          | 테스트 약화 감지 (G6)                                        |
| `npm run db:setup`                                                | 로컬 DB 생성                                                 |
| `npm run db:migrate` / `npm run db:rollback` / `npm run db:check` | 마이그레이션 적용 / 되돌리기 / 왕복 검증 (0단위 전까지 스텁) |
| `npm run verify:fast`                                             | lint + format + typecheck + test + integrity                 |
| `npm run verify`                                                  | verify:fast + db:check + test:e2e (완료 기준)                |
| `npm run build` / `npm run start:dev`                             | 빌드 / 개발 서버                                             |

## 3. 폴더 구조 · 모듈 규칙

- `src/modules/<도메인>/{controller,usecases,dto,entities,errors}`, 공통 코드는 `src/common/`
- UseCase 는 1파일 1유스케이스. 컨트롤러는 UseCase 만 호출한다
- 업무 오류는 도메인별 `errors/` 에 정의하고 `BusinessException` 으로 던진다
- 마이그레이션은 `migrations/*.sql`. `synchronize` 는 끈다

## 4. 명세 코드 규칙 (놓치기 쉬운 것)

- `todos` 조회·수정·완료변경 쿼리 전부에 `deleted_at IS NULL` (누락 시 삭제된 할 일 노출 + Seq Scan)
- 자유 텍스트(`title`, 소셜 `name`)에 `@StripHtml()` 필수
- 소셜 이메일은 저장 전 `lower(btrim())`
- 타인 소유·없는 리소스는 403 이 아니라 **404** 로 통일
- `dueDate` 는 `YYYY-MM-DD` 만 허용, 타임존 포함 문자열 거부
- 회원 탈퇴는 **연동 해제 → `users` 삭제** 순서. 해제 실패해도 삭제 진행, 카카오 `-101` 은 성공 처리
- 기기 3대 제한은 DB 설계서 6장 트랜잭션 그대로
- 완료 시각·삭제 시각은 서버 `now()` (클라이언트 시각 신뢰 금지)

## 5. 테스트 규칙

- UseCase 마다 `.spec.ts`, 최소 4케이스: 성공 / NOT_FOUND / 권한 / 저장 실패
- DB 제약·인덱스·트랜잭션이 걸린 동작은 e2e (`test/`) 로 검증
- 외부 제공자(애플·카카오·구글)는 인터페이스 + 가짜 구현으로 테스트. 실제 호출은 하지 않는다
- 테스트·로그에는 가짜 값만 쓴다
- 버그 수정과 기능 추가는 실패하는 테스트를 먼저 작성하고 실패를 확인한 뒤 구현한다

## 6. 금지 사항

- 테스트 삭제, skip, only, x/f 접두사 변형(`.each` 포함), 단언 약화
- `origin/main` 에 병합된 마이그레이션 수정 (바꿀 땐 새 번호로 추가)
- 명세의 "안 만들 것" 기능 추가
- `.env` 읽기, 시크릿 하드코딩 (키 이름만 `.env.example` 에)
- `docs/spec/` 수정
- 위험 명령: force push, `git reset --hard`, `git clean -f`, 위험한 `rm -rf`, `harukok_test`·`harukok_check` 외 DB 생성·삭제, 로컬 외 호스트 psql

## 7. 자동 게이트 (막히면 이유를 여기서 확인)

- 수정 직후 훅(`post-edit-format.cjs`): 수정 파일에 eslint --fix + prettier. 남은 eslint 오류가 있으면 차단 → 즉시 수정
- 종료 훅(`stop-verify.cjs`): `npm run verify:fast` 실행. 실패하면 "검증 실패 (n/3)" 으로 종료 차단
- 3회 연속 실패하면 차단을 풀고 `.claude/state/STUCK-<세션>.md` 를 남긴다 → 아래 "막혔을 때" 로 이동
- 편집 차단: `docs/spec/**`, `.env`·`.env.*`(`.env.example` 제외), `.claude/settings.json`, `.claude/settings.local.json`, `.claude/hooks/**`, `.claude/state/**`, `.github/workflows/**`, `scripts/lib/**`, `scripts/check-test-integrity.cjs`, `origin/main` 에 있는 `migrations/*.sql` (대소문자 구분 없이 판정)
- Bash 차단: 6장의 위험 명령, `.env` 읽기, 위 보호 경로에 대한 Bash 쓰기(`rm`·`mv`·`cp`·`sed -i`·`tee`·`>` 리다이렉션·`git checkout/restore` 등)
- 가드는 최선의 방어선일 뿐이다. 우회하지 않는다. 차단되면 규칙을 지키는 다른 방법을 찾는다
- 게이트 설정(`package.json` 검증 스크립트, `jest.config.js`, `eslint.config.mjs`, `tsconfig*.json`, `.prettierrc` 등)을 바꾸면 `test:integrity` 가 경고한다. PR 본문에 바꾼 이유를 적는다
- 마이그레이션 001·005 에서 결함을 발견하면 멈추고 보고한다. 사람이 직접 수정한다

## 8. 루프 절차 (한 작업 단위)

1. 사람이 단위 지정 → `docs/spec/` 해당 절을 읽고 구현 계획 작성 → **사람 승인 ①** 전에는 구현하지 않는다
2. 브랜치 `feat/<단위>` 생성 → 테스트 먼저 작성(실패 확인) → 구현 → 훅이 G1~G3·G6 강제
3. `npm run verify` 통과 → 셀프 리뷰(명세 대조) → PR 생성 (본문에 명세 항목 체크리스트)
4. CI(`ci` 잡) 통과 → **사람 확인 후 병합 ②**. 병합은 사람이 한다

작업 단위 (의존성 순, 각 단위가 PR 1개)

| #   | 단위        | 포함                                                                                           |
| --- | ----------- | ---------------------------------------------------------------------------------------------- |
| 0   | 기반        | 골격, config, DB 연결, `GET /health`, 마이그레이션 001·005 + `db:check`, CI                    |
| 1   | 약관        | `GET /terms`                                                                                   |
| 2   | 소셜 로그인 | `POST /auth/social/login` (제공자 전략 3종, 약관 선동의, 3대 제한, 애플 코드 교환·암호화 저장) |
| 3   | 세션        | `POST /auth/token/refresh`, `POST /auth/logout`                                                |
| 4   | 사용자      | `GET /users/me`, `DELETE /users/me`                                                            |
| 5   | 할 일       | 6개 API (목록·등록·수정·완료·삭제·되돌리기)                                                    |
| 6   | 배치        | 할 일 정리(일 1회), 만료 토큰 정리(주 1회)                                                     |

- DB 설계서 9장 검증 항목: 스키마 수준은 0단위 `test/schema.e2e-spec.ts` 가 맡는다. 앱 쿼리 수준은 해당 단위 e2e 로 옮긴다 — 2: 4대째 로그인 → 활성 3대 유지(가장 오래된 기기 폐기) / 5: 소프트 삭제 → 목록 제외, 되돌리기 복구·재호출 멱등, 남의 할 일 삭제 0건 / 6: 7일 경과분 하드 삭제
- 완료의 정의: `npm run verify` 통과 + PR 생성
- 막혔을 때: STUCK 파일이 생기면 작업을 멈추고, 파일 내용과 시도한 방법을 사람에게 보고한다. 계속 시도하지 않는다

## 9. 커밋 · 브랜치

- 브랜치 `feat/<단위>` (설정·문서 작업은 `chore/`, `docs/`), `main` 직접 push 금지
- Conventional Commits (`feat:`, `fix:`, `test:`, `docs:`, `chore:` …), 메시지는 한국어
