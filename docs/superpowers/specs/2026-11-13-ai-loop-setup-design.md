# 하루콕 백엔드 — Claude Code AI 루프 개발 환경 설계

- 작성일: 2026-11-13
- 대상 저장소: `sunhojeongbin/harukok-be` (현재 빈 저장소)
- 상태: 승인 대기 (구현자 관점 검토 반영 완료)
- 근거 문서: 노션 `하루콕 / Todo / MVP 백엔드 & DB 설계` 5개 + `MVP v1 기능 명세서 (재정의)`

---

## 1. 의도와 이유

- 하루콕 출시가 계속 밀렸다. 기능 명세서(재정의)가 정한 **목표 출시일은 2026-11-30**이고, "날짜를 못 지키면 기능을 뺀다"가 원칙이다.
- 백엔드 범위는 이미 고정되어 있다: **엔드포인트 12개, 테이블 6개** (노션 `MVP 백엔드 & DB 설계` 5개 문서).
- 남은 문제는 **구현과 검수를 짧은 기간에 끝내는 것**이다. 이를 위해 Claude Code가 기능 단위로 "명세 읽기 → 테스트 작성 → 구현 → 자동 검증 → 실패 시 수정"을 **사람 개입 없이 반복**하는 환경을 만든다.
- 이 문서는 그 환경을 만들기 위한 **준비 항목**을 정의한다. 기능 구현 자체는 이 문서의 범위가 아니다.

## 2. 목표 · 비목표 · 반목표

### 목표
1. Claude가 혼자 루프를 돌 수 있는 저장소 기반(골격·명령어·규칙)을 갖춘다.
2. "끝났다"의 기준을 사람이 아니라 **자동 검증**이 판정한다 (린트·타입·단위 테스트·DB 통합 테스트·마이그레이션 왕복).
3. 사람의 개입은 **두 지점**으로 줄인다: ① 기능 시작 전 계획 승인 ② PR 확인 후 병합.
4. 루프가 명세 문서를 그대로 입력으로 쓰도록 명세를 저장소 안에 둔다.

### 비목표 (이번에 하지 않음)
- 기능 구현 (12개 엔드포인트) — 이 환경 위에서 별도 계획으로 진행
- CI 안에서 Claude 실행 (B안: PR 자동 리뷰, C안: 이슈 기반 자동 구현) — 루프 안정화 후 재검토
- 네이버 클라우드 배포 자동화 (GitHub Actions 배포 워크플로) — 별도 작업
- 프론트엔드(`harukok-mobile`) 연동

### 반목표 (기술적으로 돌아가도 실패로 보는 것)
- Claude가 테스트를 **지우거나 skip/약화**해서 검증을 통과시키는 것
- 루프가 **끝없이 반복**되며 같은 실패를 계속 고치려 드는 것
- 명세서 "안 만들 것" 목록에 있는 기능이 추가되는 것 (범위 재팽창)
- 시크릿(애플 `.p8`, 카카오 어드민 키, 암호화 키)이 저장소·로그·대화에 노출되는 것
- 이미 적용된 마이그레이션 파일이 수정되는 것

## 3. 제약 (명세 문서에서 확정된 것)

| 항목 | 내용 | 출처 |
| --- | --- | --- |
| DBMS | PostgreSQL **18+** (`uuidv7()` 내장 함수 의존, 001에 버전 검사 포함) | DB 설계서 1장, DDL |
| 스택 | NestJS + TypeORM | API 설계서 |
| 마이그레이션 | **순수 SQL 파일** `YYYYMMDD_NNN__name.sql` + `.down.sql`, `psql -v ON_ERROR_STOP=1`로 적용 | DDL |
| 신규 환경 적용 | 001(통합판) + 005만 실행. 005는 **미검증** | DB 설계서 머리말 |
| 원본 우선순위 | `DDL(.sql) → DB 표준 → DB 설계서 → ERD`. 노션 DDL과 실제 `.sql`이 다르면 **파일이 기준** | DB 표준, DDL 경고 |
| 기존 자산 | 예전 `.sql` 파일·`CLAUDE.md`·`common/` 모듈은 **가져오지 않는다**. 전부 새로 작성 | 선호님 결정 (2026-11-13) |
| 적용된 DB | **없음**. 선호님 Mac에 설치한 PostgreSQL 18에 새로 만든다 (Docker 미사용) | 선호님 결정 (2026-11-13) |
| `updated_at` | DB 트리거로 갱신 (TypeORM `@UpdateDateColumn`에 의존하지 않음) | DB 설계서 5-4 |
| 명세 동결 | "개발 시작 후 기능 명세서를 수정하지 않는다" | 기능 명세서 7장 |
| 출시일 | 2026-11-30 | 기능 명세서 2장 |

## 4. 접근 방식 (Approaches)

| 안 | 내용 | 장점 | 단점 | 판단 |
| --- | --- | --- | --- | --- |
| **A** | 로컬 PC에서 Claude 루프 + GitHub Actions는 자동 검사만 | Mac에 설치한 PostgreSQL 18로 실제 DB 테스트 가능, 진행 상황을 바로 보고 끊을 수 있음, 추가 비용 없음 | PC가 켜져 있어야 루프가 돈다 | ✅ **선택** |
| B | A + PR마다 `claude-code-action` 자동 리뷰 | 검수자 1명 추가 효과 | API 키·비용·워크플로 권한 관리 추가 | 루프 안정화 후 추가 검토 |
| C | 이슈에 `@claude` → CI 안에서 구현·PR 생성 | 사람 손이 가장 적음 | 막혔을 때 원인 파악 어려움, CI 안 DB 설정 부담, 비용 최대 | 제외 |

선택 이유: 출시가 급할수록 초기 세팅은 가벼워야 하고, 루프 품질은 결국 **검증 기준의 두께**에서 나온다. A안은 그 검증 장치에 집중할 수 있다.

---

## 5. 설계 — 준비 항목

전체 구조:

```
명세(docs/spec) ──▶ Claude 루프 ──▶ 자동 검증(게이트) ──▶ PR ──▶ CI 재검증 ──▶ 사람 병합
                     ▲       │
                     └─실패──┘  (훅이 실패 내용을 Claude에게 되돌림)
```

### P1. 저장소 골격

```
harukok-be/
├── CLAUDE.md                      # 루프의 규칙서 (P3)
├── .claude/
│   ├── settings.json              # 훅·권한 (P5)
│   └── hooks/                     # 훅 스크립트
├── docs/
│   ├── spec/                      # 노션 명세 사본 (P2)
│   └── superpowers/{specs,plans}/ # 설계·계획 문서
├── migrations/                    # 순수 SQL (up / down)
├── scripts/                       # db-migrate, verify 등
├── src/
│   ├── main.ts / app.module.ts
│   ├── config/                    # 환경변수 검증
│   ├── common/                    # crypto, errors(BusinessException), response, pipes(StripHtml)
│   └── modules/
│       ├── auth/                  # 소셜 로그인, 토큰 재발급, 로그아웃
│       ├── users/                 # /users/me 조회·탈퇴
│       ├── terms/                 # /terms
│       ├── todos/                 # 할 일 6개 API
│       └── health/                # GET /health
│           └── (모듈 내부) controller / usecases / dto / entities / errors
├── test/                          # DB 통합(e2e) 테스트
├── .env.example
└── .github/workflows/ci.yml       # P7
```

- **명령어 계약** — 루프·훅·CI가 모두 같은 명령을 쓴다. Claude가 추측하지 않도록 `package.json` 스크립트 이름을 고정한다.

| 스크립트 | 역할 |
| --- | --- |
| `lint` / `format` | ESLint / Prettier |
| `typecheck` | `tsc --noEmit` |
| `test` | 단위 테스트 (DB 없음, 빠름) |
| `test:e2e` | 실제 PostgreSQL 18 대상 통합 테스트 |
| `db:setup` | 로컬 서버 버전이 18인지 확인 → `harukok_dev`·`harukok_test` DB 생성 (이미 있으면 건너뜀) |
| `db:migrate` / `db:rollback` | 마이그레이션 적용/롤백 |
| `db:check` | 임시 DB `harukok_check` 생성 → 전체 up → 전체 down → 다시 up, 잔여 객체 0 확인 → 임시 DB 삭제 |
| `verify:fast` | `lint` + `typecheck` + `test` |
| `verify` | `verify:fast` + `db:check` + `test:e2e` (PR 전 필수) |

- TypeORM은 **엔티티 매핑과 쿼리만** 담당한다. `synchronize: false` 고정, TypeORM 마이그레이션 기능은 쓰지 않는다 (스키마 원본은 `migrations/*.sql`).

**로컬 DB (Mac 직접 설치)**
- 설치: Homebrew `postgresql@18` → `brew services start postgresql@18`. 버전 고정 공식이라 실수로 19로 올라가지 않는다. 다른 버전이 이미 깔려 있으면 PATH에서 18의 `psql`이 먼저 잡히는지 `db:setup`이 확인한다
- DB 3개를 역할별로 분리한다

| DB | 용도 | 지워도 되나 |
| --- | --- | --- |
| `harukok_dev` | 개발 중 직접 실행 | 사람만 |
| `harukok_test` | `test:e2e` — 테스트마다 테이블 비움 | 스크립트 |
| `harukok_check` | `db:check` 전용 — 매번 생성·삭제 | 스크립트 |

- **안전장치**: Mac에 다른 프로젝트 DB가 함께 있을 수 있으므로, DB를 만들거나 지우는 스크립트는 **호스트가 `localhost`이고 DB 이름이 `harukok_test`·`harukok_check`일 때만** 동작한다. 그 외에는 즉시 실패한다. 같은 규칙을 PreToolUse 훅에도 건다 (`dropdb`·`DROP DATABASE` 대상 검사)
- 접속 정보는 `.env`의 `DATABASE_URL`·`TEST_DATABASE_URL`로 받는다. Homebrew 기본 설치는 Mac 사용자 이름으로 비밀번호 없이 접속되므로 `.env.example`에는 그 형태를 예시로 둔다
- CI는 Mac이 없으므로 GitHub Actions의 PostgreSQL 18 서비스 컨테이너를 쓴다. 로컬과 CI 모두 같은 `db:setup`·`db:check` 스크립트를 쓰고, 접속 문자열만 다르다
- 참고: [Homebrew postgresql@18](https://formulae.brew.sh/formula/postgresql@18)

### P2. 명세를 저장소로 옮기기

- 노션 문서 6개를 Claude가 노션 연결로 읽어 `docs/spec/`에 마크다운으로 저장한다 (준비 작업에 포함):
  `00-feature-spec.md`(기능 명세서 재정의), `01-api.md`, `02-db-design.md`, `03-ddl.md`, `04-erd.md`, `05-db-standard.md`
- **기준 문서 원칙**: 개발 시작 후에는 저장소 사본이 루프의 기준이다. 기능 명세서 운영 규칙(개발 중 수정 금지)과 맞물려, 노션 → 저장소 **한 방향 동기화**만 허용한다. 명세가 바뀌어야 하면 사람이 노션을 고치고 사본을 갱신하는 PR을 따로 연다.
- Claude는 `docs/spec/`을 **수정하지 않는다** (P5 훅으로 차단).

**마이그레이션 원본 만들기** — 기존 `.sql` 파일을 쓰지 않으므로 노션 DDL 페이지가 원본이 된다.
- 적용된 DB가 없으니 002~004는 만들지 않는다. 노션 DDL의 **001 통합판**과 **005**를 `migrations/20261110_001__init_schema.sql`, `20261112_005__social_unlink.sql`로 옮기고, `.down.sql`을 함께 둔다
- 001 롤백 스크립트는 노션에 없으므로 새로 작성한다 (테이블·함수 역순 DROP)
- 노션 DDL은 "설계 문서를 근거로 재구성한 것"이라는 경고가 있다. 비교할 실제 파일이 없으므로 **`db:check` + DB 설계서 9장 검증 항목을 옮긴 e2e 테스트가 그 대조 역할**을 한다
- 번호 체계(`YYYYMMDD_NNN__name`)는 노션 표기를 그대로 따른다. 003·004 번호가 비는 것은 의도된 것이며 `migrations/README.md`에 이유를 적는다

### P3. CLAUDE.md (루프의 규칙서)

짧고 강제력 있는 규칙만 담는다. 들어갈 내용:

1. **프로젝트 한 줄 정의**와 명세 위치 (`docs/spec/`), 원본 우선순위
2. **명령어** (P1 표 그대로)
3. **폴더 구조와 모듈 규칙** — UseCase 단위 파일, 모듈별 `errors/`, `BusinessException`
4. **명세에서 뽑은 코드 규칙** (루프가 가장 놓치기 쉬운 것들)
   - `todos` 조회·수정·완료변경 쿼리 전부에 `deleted_at IS NULL` — 누락 시 삭제된 할 일 노출 + Seq Scan
   - 자유 텍스트(`title`, 소셜 `name`)에 `@StripHtml()` 필수
   - 소셜 이메일은 저장 전 `lower(btrim())`
   - 타인 소유·없는 리소스는 403이 아니라 **404**로 통일
   - `dueDate`는 `YYYY-MM-DD`만 허용, 타임존 포함 문자열 거부
   - 회원 탈퇴는 **연동 해제 → `users` 삭제** 순서, 해제 실패해도 삭제 진행, 카카오 `-101`은 성공 처리
   - 기기 3대 제한은 DB 설계서 6장 트랜잭션 그대로
   - 완료 시각·삭제 시각은 서버 `now()` (클라이언트 시각 신뢰 금지)
5. **테스트 규칙** — UseCase마다 `.spec.ts`, 최소 4케이스(성공 / NOT_FOUND / 권한 / 저장 실패). DB 제약·인덱스·트랜잭션이 걸린 동작은 e2e로 검증
6. **금지 사항** — 테스트 삭제·`skip`·`only`·단언 약화 금지, 적용된 마이그레이션 수정 금지(새 번호로 추가), "안 만들 것" 기능 추가 금지, `.env` 읽기·시크릿 하드코딩 금지
7. **루프 절차** (P6) 와 "완료"의 정의: `npm run verify` 통과 + PR 생성

### P4. 자동 검증 장치 (게이트)

| 게이트 | 검사 | 실행 시점 | 실패 시 |
| --- | --- | --- | --- |
| G1 | ESLint + Prettier (수정된 파일만) | 파일 수정 직후 (PostToolUse 훅) | Claude에게 오류 전달 → 즉시 수정 |
| G2 | 타입 체크 | 작업 종료 시도 시 (Stop 훅) | 종료 차단, 계속 수정 |
| G3 | 단위 테스트 | 작업 종료 시도 시 (Stop 훅) | 종료 차단, 계속 수정 |
| G4 | 마이그레이션 왕복 (`db:check`) | PR 전 `verify`, CI | PR 불가 |
| G5 | DB 통합 테스트 (`test:e2e`) | PR 전 `verify`, CI | PR 불가 |
| G6 | 테스트 약화 감지 | Stop 훅 + CI | 아래 참고 |

- **G5에 반드시 들어갈 명세 기반 테스트** (설계서 9장 검증 표를 그대로 테스트로 옮긴다):
  제목 250/251자·공백만, 이메일 정규화 거부 4종, provider CHECK, 소셜 계정 중복 연결 거부, 기기당 활성 토큰 1개, 4대째 로그인 → 활성 3대 유지, 탈퇴 CASCADE, 소프트 삭제 → 목록 제외, 되돌리기 멱등, 남의 할 일 0건, 정리 배치 7일, 005 제약(애플 외 provider에 토큰 저장 거부)
- **G6 테스트 약화 감지**: 변경된 테스트 파일에서 `.skip(`, `.only(`, `xit(`, `xdescribe(` 추가, 또는 `main` 대비 테스트 파일 삭제를 찾으면 실패시킨다. 단순 문자열 검사로 충분하다.
- 외부 API(애플·카카오·구글)는 루프에서 실제로 부를 수 없다 → 제공자별 **인터페이스 + 테스트용 가짜 구현**으로 검증하고, 실제 호출 확인은 사람이 하는 출시 체크리스트 항목으로 남긴다.

### P5. Claude Code 훅·권한 (`.claude/settings.json`)

| 훅 | 대상 | 동작 |
| --- | --- | --- |
| PostToolUse | `Edit\|Write` | 수정된 파일에 `eslint --fix` + `prettier --write`. 남은 오류를 Claude에게 반환 |
| Stop | — | `verify:fast` + G6 실행. 실패하면 종료 차단(오류 내용 반환) |
| PreToolUse | `Edit\|Write` | `docs/spec/**`, **`origin/main`에 이미 있는** `migrations/*.sql`, `.env*`(`.env.example` 제외) 수정 차단 |
| PreToolUse | `Bash` | `git push --force`, `git reset --hard`, `rm -rf` (프로젝트 밖·루트), 로컬 외 DB 접속 문자열 사용 차단 |

- **무한 반복 방지**: Stop 훅은 `stop_hook_active`만 보지 않고 **세션별 재시도 횟수(최대 3회)** 를 파일에 기록한다. 3회 연속 같은 게이트에서 실패하면 차단을 풀고 "막힘 보고"를 남기도록 한다. 이유: `stop_hook_active`만 쓰면 1회 재시도 후 그냥 끝나 버려 검증이 약해지고, 아무 제한이 없으면 같은 실패를 계속 고친다.
- **"적용된 마이그레이션" 판정 기준**: 운영 DB가 아직 없으므로 "`main`에 병합된 파일"을 적용된 것으로 본다. 즉 마이그레이션은 그 파일을 처음 추가하는 PR 안에서는 자유롭게 고칠 수 있고(0단위에서 005 수정 포함), 병합 뒤에는 새 번호로만 바꾼다.
- **권한**: `npm run *`, `psql`(localhost 한정), `git` 일반 명령은 허용 목록에 넣어 루프가 승인 대기로 멈추지 않게 한다. `.env` 읽기는 거부 목록.
- 참고: [Hooks reference](https://code.claude.com/docs/en/hooks)

### P6. 작업 단위와 루프 절차

**준비 작업과 0단위의 경계** — 훅이 돌려면 골격이 먼저 있어야 하므로 둘로 나눈다.
- **준비 작업(이 설계의 구현 범위, 사람과 함께)**: NestJS 최소 골격, `package.json` 스크립트(P1 표), ESLint·Prettier·Jest, `scripts/db-setup`, `.claude/` 훅·권한, `CLAUDE.md`, `docs/spec/`, `migrations/` 원본 파일 배치, CI 워크플로, `.env.example`. 각 게이트가 "일부러 실패시키면 실제로 막는지" 확인까지 포함
- **0단위(루프의 첫 시험)**: config 검증, DB 연결, `GET /health`, 마이그레이션 실행 스크립트 + `db:check` 통과(005 검증 포함). 위험이 낮은 작업으로 루프가 실제로 도는지 먼저 확인한다

**작업 순서** (의존성 순, 각 줄이 PR 1개):

| # | 단위 | 포함 |
| --- | --- | --- |
| 0 | 기반 | 골격, config, DB 연결, `GET /health`, 마이그레이션 001·005 + `db:check`, CI |
| 1 | 약관 | `GET /terms` |
| 2 | 소셜 로그인 | `POST /auth/social/login` (제공자 전략 3종, 약관 선동의, 3대 제한, 애플 코드 교환·암호화 저장) |
| 3 | 세션 | `POST /auth/token/refresh`, `POST /auth/logout` |
| 4 | 사용자 | `GET /users/me`, `DELETE /users/me` (연동 해제 순서) |
| 5 | 할 일 | 6개 API (목록·등록·수정·완료·삭제·되돌리기) |
| 6 | 배치 | 할 일 정리(일 1회), 만료 토큰 정리(주 1회) |

**한 단위의 루프:**
1. 사람: 단위 지정 → Claude가 `docs/spec/` 해당 절을 읽고 **구현 계획** 작성 → **사람 승인 ①**
2. Claude: 브랜치 `feat/<단위>` 생성 → 테스트 먼저 작성(실패 확인) → 구현 → 훅이 G1~G3·G6 강제
3. Claude: `npm run verify` 통과 → 셀프 리뷰(명세 대조) → PR 생성 (본문에 명세 항목 체크리스트)
4. CI 재검증 통과 → **사람 확인 후 병합 ②**

- 이 절차는 이미 쓰고 있는 superpowers 스킬 흐름(계획 작성 → TDD → 코드 리뷰 요청)과 같다. 로컬 Claude Code에도 같은 플러그인이 설치돼 있어야 한다.

### P7. 브랜치 · PR · CI

- `main` 보호: 직접 push 금지, PR + CI 통과 필수 (저장소가 공개라 브랜치 보호 규칙 사용 가능). 1인 개발이라 "승인 리뷰 필수"는 걸지 않고 **CI 상태 검사 필수**만 건다 — 본인 PR은 본인이 승인할 수 없기 때문
- `.github/workflows/ci.yml`: PR·`main` push 시 실행
  - PostgreSQL 18 서비스 컨테이너
  - `npm ci` → `lint` → `typecheck` → `test` → `db:check` → `test:e2e` → G6
- 커밋 메시지: Conventional Commits (`feat:`, `fix:`, `test:` …)

### P8. 시크릿 · 보안

- 저장소에는 `.env.example`(키 이름만)만 둔다. `.env`는 `.gitignore`
- 필요한 시크릿 목록: DB 접속, JWT 서명 키, 암호화 키(AES-256-GCM, DB와 별도 보관), 애플 `.p8`·Key ID·Team ID·번들 ID, 카카오 어드민 키, 구글 OAuth 클라이언트 ID
- 루프와 테스트는 **가짜 값**만 사용. 실제 값은 서버 환경변수로만 주입
- `config/`에서 시작 시 환경변수 검증 — 누락 시 부팅 실패

---

## 6. 결정된 것과 남은 것

### 선호님이 결정한 것
- A안 (로컬 루프 + CI 자동 검사)
- `CLAUDE.md`·`common/` 모듈·마이그레이션 파일 모두 새로 작성 (예전 저장소 자산 미사용)
- 적용된 DB 없음 → Mac에 직접 설치한 PostgreSQL 18에 새로 생성 (Docker 미사용)
- 명세 저장소 사본(`docs/spec/`)을 루프 기준으로, 노션 → 저장소 한 방향 동기화
- 개입 지점 2곳 (계획 승인, PR 병합) — 제안에 동의
- 명세 6개 문서 내용 전부 (스택, DB 18, SQL 마이그레이션, API 12개, 규칙)
- 문서는 한국어로 작성

### Claude가 정한 것 (검토 필요)
- Stop 훅 재시도 상한 3회
- 작업 단위 7개와 순서
- 외부 API는 가짜 구현으로 테스트, 실제 호출은 사람 확인
- TypeORM 마이그레이션 미사용, `synchronize: false`
- 준비 작업과 0단위의 경계 (P6)
- `main` 보호는 CI 통과 필수만, 승인 리뷰 필수는 걸지 않음 (P7)
- "적용된 마이그레이션" = `main`에 병합된 파일 (P5)
- 마이그레이션은 001 통합판 + 005만 생성, 001 롤백은 새로 작성 (P2)

### 구현자에게 남긴 것
- ESLint/Prettier 세부 규칙, Jest 설정, 테스트 DB 분리 방식(별도 DB명 vs 별도 컨테이너)
- 마이그레이션 실행 스크립트의 적용 이력 관리 방식
- 훅 스크립트 구현 언어(bash/Node)
