# AI 루프 개발 환경 준비 작업 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 빈 `harukok-be` 저장소에 Claude Code가 기능 단위 루프를 혼자 돌 수 있는 기반(골격·명세 사본·마이그레이션 원본·검증 게이트·훅·CLAUDE.md·CI)을 만든다.

**Architecture:** NestJS 최소 골격 위에 `package.json` 스크립트로 "명령어 계약"을 고정하고, 루프의 판정은 Node 스크립트(`.cjs`, 외부 의존성 없음)로 된 Claude Code 훅과 CI가 같은 스크립트를 호출해 내린다. 훅·가드 로직은 순수 함수(`scripts/lib/*.cjs`)로 분리해 Jest로 테스트한다.

**Tech Stack:** Node(로컬 ≥22, CI·`.nvmrc` 24), npm, NestJS(`@nestjs/cli new`가 설치하는 현재 안정 메이저), TypeScript strict, ESLint(flat config) + Prettier, Jest + ts-jest, PostgreSQL 18(Mac Homebrew `postgresql@18`, CI는 서비스 컨테이너), GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-11-13-ai-loop-setup-design.md`

## Global Constraints

- 모든 문서·주석·커밋 메시지 본문은 한국어. 커밋 제목은 Conventional Commits (`feat:`, `chore:`, `docs:`, `test:`, `ci:`)
- 커밋 메시지 끝에 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` 와 `Claude-Session: https://claude.ai/code/session_013nGaia3NScVwCWo88jwCfW`
- PostgreSQL **18+** 전제 (`uuidv7()`), Docker 미사용 (로컬은 Mac 직접 설치)
- TypeORM `synchronize: false`, TypeORM 마이그레이션 미사용 — 스키마 원본은 `migrations/*.sql`
- DB 생성·삭제는 호스트 `localhost`/`127.0.0.1`/`::1` 이고 DB 이름이 `harukok_test`·`harukok_check` 일 때만
- `docs/spec/**` 은 노션 → 저장소 한 방향 사본. 내용은 노션 원문 그대로(오탈자 포함) 옮긴다
- 훅·가드 스크립트는 Node 표준 라이브러리만 사용 (`.cjs`), 설치 없이 `node`로 실행 가능해야 한다
- 이 계획은 **준비 작업만** 다룬다. config 검증·DB 연결·`/health`·마이그레이션 실행기·`db:check` 는 0단위(루프 첫 시험)의 몫이다

## Review Focus

1. 파일 경로에 공백·한글이 들어간 경우 → 훅이 경로를 깨뜨리지 않고 그 파일만 검사 (Task 5 테스트)
2. `origin/main` 이 아직 없는 첫 커밋 상태 → 마이그레이션 보호 가드·테스트 무결성 검사가 죽지 않고 "보호 대상 없음 / HEAD 기준"으로 동작 (Task 3·5 테스트)
3. `DATABASE_URL` 이 `127.0.0.1`·`::1`·쿼리스트링 포함·DB 이름 누락 형태 → 가드가 올바르게 허용/거부 (Task 2 테스트)
4. Stop 재시도 횟수가 세션 간에 섞이거나 통과 후에도 남는 경우 → `session_id` 별로 세고, 통과 시 초기화 (Task 5 테스트)
5. 체인 명령(`cd x && rm -rf /`, `true; dropdb harukok_dev`) → 명령 문자열 전체를 검사해 차단 (Task 5 테스트)

---

## 파일 구조

```
.nvmrc / .gitignore / .env.example / package.json / tsconfig*.json
eslint.config.mjs / .prettierrc / .prettierignore
nest-cli.json / jest.config.js / test/jest-e2e.json
CLAUDE.md
docs/
  setup-local.md                      # Mac 개발 환경 준비 절차
  spec/README.md + 00~05 *.md         # 노션 사본 (Task 1)
migrations/
  README.md
  20261110_001__init_schema.sql / .down.sql
  20261112_005__social_unlink.sql / .down.sql
scripts/
  lib/db-guard.cjs                    # 접속 대상 안전 판정 (순수 함수)
  lib/test-integrity.cjs              # 테스트 약화 판정 (순수 함수)
  lib/git.cjs                         # git 호출 래퍼 (refExists, fileInRef, diff)
  db-setup.cjs                        # db:setup
  check-test-integrity.cjs            # G6 CLI
.claude/
  settings.json
  hooks/post-edit-format.cjs          # PostToolUse Edit|Write
  hooks/pre-edit-guard.cjs            # PreToolUse Edit|Write|MultiEdit
  hooks/pre-bash-guard.cjs            # PreToolUse Bash
  hooks/stop-verify.cjs               # Stop
  hooks/lib/hook-io.cjs               # stdin JSON 읽기, 차단 응답 헬퍼
.github/workflows/ci.yml
src/main.ts / src/app.module.ts      # 최소 골격
test/tooling/*.spec.ts                # 스크립트·훅 테스트
```

---

### Task 1: 저장소 골격 + 명령어 계약 + 명세 사본

**Files:**
- Create: `package.json`, `.nvmrc`(`24`), `tsconfig.json`, `tsconfig.build.json`, `nest-cli.json`, `eslint.config.mjs`, `.prettierrc`, `.prettierignore`, `jest.config.js`, `test/jest-e2e.json`, `.gitignore`, `.env.example`, `src/main.ts`, `src/app.module.ts`, `src/app.module.spec.ts`
- Create: `docs/spec/README.md`, `docs/spec/00-feature-spec.md`, `01-api.md`, `02-db-design.md`, `03-ddl.md`, `04-erd.md`, `05-db-standard.md`

**Interfaces:**
- Produces: npm 스크립트 이름 (이후 모든 작업·훅·CI가 사용)

| 스크립트 | 이 작업에서의 내용 |
| --- | --- |
| `lint` | `eslint .` |
| `lint:fix` | `eslint . --fix` |
| `format` / `format:check` | `prettier --write .` / `prettier --check .` |
| `typecheck` | `tsc --noEmit -p tsconfig.json` |
| `test` | `jest` (roots: `src`, `test/tooling`) |
| `test:e2e` | `jest --config test/jest-e2e.json --passWithNoTests` (0단위에서 실제 테스트 추가) |
| `test:integrity` | `node scripts/check-test-integrity.cjs` (Task 3) |
| `db:setup` | `node scripts/db-setup.cjs` (Task 2) |
| `db:migrate` / `db:rollback` / `db:check` | `node -e "console.error('0단위에서 구현');process.exit(1)"` — 자리만 고정 |
| `verify:fast` | `npm run lint && npm run format:check && npm run typecheck && npm test && npm run test:integrity` |
| `verify` | `npm run verify:fast && npm run db:check && npm run test:e2e` |
| `build` / `start:dev` | Nest 기본값 |

- [ ] **Step 1:** `npx @nestjs/cli new . --package-manager npm --skip-git --strict` 로 생성 후 샘플 컨트롤러·서비스·e2e 샘플 삭제. `engines.node: ">=22"`, `"private": true`. TypeORM 관련 패키지는 설치하지 않는다(0단위 몫)
- [ ] **Step 2:** ESLint flat config: `@typescript-eslint` 권장 + `eslint-config-prettier`. `scripts/**/*.cjs`, `.claude/hooks/**/*.cjs` 는 Node CommonJS 전역으로 린트. `docs/spec/**` 은 prettier·eslint 무시 대상 (원문 보존)
- [ ] **Step 3:** `.gitignore`: `node_modules/ dist/ coverage/ .env .env.local .claude/state/ .claude/settings.local.json`. `.env.example`:
  ```
  # Homebrew postgresql@18 기본값: Mac 사용자 이름, 비밀번호 없음
  DATABASE_URL=postgresql://<mac-user>@localhost:5432/harukok_dev
  TEST_DATABASE_URL=postgresql://<mac-user>@localhost:5432/harukok_test
  # 아래는 이름만. 값은 서버 환경변수로만 주입 (설계 P8)
  JWT_ACCESS_SECRET=
  JWT_REFRESH_SECRET=
  TOKEN_ENCRYPTION_KEY=          # AES-256-GCM, base64 32바이트
  APPLE_TEAM_ID=
  APPLE_KEY_ID=
  APPLE_PRIVATE_KEY=             # .p8 내용
  APPLE_CLIENT_ID=               # 네이티브 앱 번들 ID (Service ID 아님)
  KAKAO_ADMIN_KEY=
  GOOGLE_CLIENT_IDS=             # iOS,Android,서버 — 쉼표 구분
  ```
- [ ] **Step 4: 실패하는 테스트 작성** — `src/app.module.spec.ts`: `Test.createTestingModule({ imports: [AppModule] }).compile()` 이 resolve 된다
- [ ] **Step 5:** `npm test` → 통과 확인 (골격이 있으므로 첫 실행부터 통과해도 된다; 통과하지 않으면 골격 수정)
- [ ] **Step 6: 명세 사본 작성** — 노션 연결로 아래 6개 페이지를 읽어 마크다운으로 저장한다. 각 파일 맨 위에 출처 블록:
  ```
  > 노션 원본: <URL>
  > 원본 최종 수정: <page_last_edited_at>
  > 동기화: 2026-11-13 (노션 → 저장소 한 방향. 이 파일을 직접 고치지 말 것)
  ```
  | 파일 | 노션 페이지 ID |
  | --- | --- |
  | `00-feature-spec.md` | `413b98b3029981bc88bec49130d9805b` (기능 명세서 재정의, 하위 DB는 링크만) |
  | `01-api.md` | `417b98b30299801ab97fe1ec4570db74` |
  | `02-db-design.md` | `417b98b3029980cabf60cee2697cab6a` |
  | `03-ddl.md` | `417b98b3029980c78f0dfd3dbb85c4c5` |
  | `04-erd.md` | `417b98b30299805aa060d68dad259931` |
  | `05-db-standard.md` | `417b98b3029980b29f69e2202a2f53a6` |

  노션 HTML 표는 마크다운 표로, `<mention>` 은 `docs/spec/` 내 상대 링크로 바꾼다. 문장은 고치지 않는다.
- [ ] **Step 7:** `docs/spec/README.md` — 동기화 규칙 3줄(한 방향, 직접 수정 금지, 변경은 노션 수정 후 사본 갱신 PR), 문서 우선순위 `DDL(.sql) → DB 표준 → DB 설계서 → ERD`, 파일 목록
- [ ] **Step 8:** `npm run lint && npm run format:check && npm run typecheck && npm test` → 모두 통과
- [ ] **Step 9: Commit** — `chore: NestJS 골격과 명령어 계약, 노션 명세 사본 추가`

---

### Task 2: 마이그레이션 원본 + DB 안전 가드 + `db:setup`

**Files:**
- Create: `migrations/README.md`, `migrations/20261110_001__init_schema.sql`, `.down.sql`, `migrations/20261112_005__social_unlink.sql`, `.down.sql`
- Create: `scripts/lib/db-guard.cjs`, `scripts/db-setup.cjs`, `docs/setup-local.md`
- Test: `test/tooling/db-guard.spec.ts`

**Interfaces:**
- Produces:
  - `parseDbTarget(url: string): { host: string; database: string | null }`
  - `isLocalHost(host: string): boolean` — `localhost`, `127.0.0.1`, `::1`, `[::1]` 만 true
  - `assertDestructiveAllowed(url: string): void` — 로컬이 아니거나 DB 이름이 `harukok_test`·`harukok_check` 가 아니면 `Error('DB 안전 가드: ...')`
  - `DESTRUCTIVE_DB_NAMES = ['harukok_test', 'harukok_check']`
  - `assertDbNameDestructiveAllowed(name: string): void` — 이름만 검사 (Task 5 Bash 가드가 사용)

- [ ] **Step 1: 실패하는 테스트 작성** — `test/tooling/db-guard.spec.ts`
  ```ts
  it.each([
    'postgresql://me@localhost:5432/harukok_test',
    'postgresql://me@127.0.0.1/harukok_check?sslmode=disable',
    'postgresql://me@[::1]:5432/harukok_test',
  ])('허용: %s', (u) => expect(() => assertDestructiveAllowed(u)).not.toThrow());
  it.each([
    'postgresql://me@localhost:5432/harukok_dev',
    'postgresql://me@localhost:5432/postgres',
    'postgresql://me@db.example.com:5432/harukok_test',
    'postgresql://me@localhost:5432',          // DB 이름 누락
    'not-a-url',
  ])('거부: %s', (u) => expect(() => assertDestructiveAllowed(u)).toThrow(/DB 안전 가드/));
  ```
- [ ] **Step 2:** `npm test -- db-guard` → FAIL (모듈 없음)
- [ ] **Step 3:** `scripts/lib/db-guard.cjs` 구현 — `new URL()` 로 파싱, 실패 시 거부
- [ ] **Step 4:** `npm test -- db-guard` → PASS
- [ ] **Step 5: 마이그레이션 파일** — 노션 DDL(`docs/spec/03-ddl.md`)의 001 통합판 SQL 블록과 005 블록·005 롤백 블록을 그대로 옮긴다. `001.down.sql` 은 새로 작성: `BEGIN; DROP TABLE IF EXISTS todos, user_term_agreements, terms, refresh_tokens, user_social_accounts, users CASCADE; DROP FUNCTION IF EXISTS set_updated_at(); COMMIT;` (자식 → 부모 순)
- [ ] **Step 6:** `migrations/README.md` — 파일명 규칙 `YYYYMMDD_NNN__name.sql`/`.down.sql`, 002~004가 없는 이유(적용된 DB가 없어 001 통합판으로 대체), "`main`에 병합된 파일은 수정 금지, 새 번호로 추가", 적용 명령 `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f <file>`
- [ ] **Step 7:** `scripts/db-setup.cjs` — `.env` 를 직접 파싱(`KEY=VALUE`, 의존성 없음)해 `DATABASE_URL`·`TEST_DATABASE_URL` 을 읽고:
  1. 두 URL 모두 `isLocalHost` 가 아니면 종료(1)
  2. `psql <url의 서버, DB=postgres> -tAc "SHOW server_version_num"` → `< 180000` 이면 `PostgreSQL 18 이상이 필요합니다. 현재: <값>` 출력 후 종료(1)
  3. `harukok_dev`, `harukok_test` 를 `SELECT 1 FROM pg_database WHERE datname=$1` 로 확인 후 없으면 `createdb` (생성만, 삭제 없음)
- [ ] **Step 8: 수동 확인** — 이 작업 공간에 PostgreSQL 18을 설치할 수 있으면(`apt` PGDG 저장소) 001 → 005 → 005.down → 001.down → 001 → 005 를 `psql -v ON_ERROR_STOP=1` 로 실행해 오류 없음 확인. 설치할 수 없으면 이 단계를 "선호님 Mac에서 확인"으로 PR 본문에 남긴다 (자동 검증은 0단위 `db:check`)
- [ ] **Step 9:** `docs/setup-local.md` — `brew install postgresql@18`, `brew services start postgresql@18`, PATH 안내(`/opt/homebrew/opt/postgresql@18/bin`), `psql --version` 이 18 인지 확인, `cp .env.example .env` 후 사용자 이름 수정, `npm ci`, `npm run db:setup`, Claude Code에 superpowers 플러그인 설치 확인
- [ ] **Step 10: Commit** — `feat: 마이그레이션 원본(001·005)과 로컬 DB 안전 가드, db:setup 추가`

---

### Task 3: 테스트 약화 감지 (G6)

**Files:**
- Create: `scripts/lib/git.cjs`, `scripts/lib/test-integrity.cjs`, `scripts/check-test-integrity.cjs`
- Test: `test/tooling/test-integrity.spec.ts`, `test/tooling/git.spec.ts`

**Interfaces:**
- Produces:
  - `git.cjs`: `refExists(ref: string, cwd: string): boolean`, `fileInRef(ref: string, path: string, cwd: string): boolean`, `defaultBase(cwd: string): string` — `origin/main` 있으면 그것, 없으면 `HEAD`, 커밋이 하나도 없으면 `null`
  - `test-integrity.cjs`: `isTestFile(path: string): boolean` (`*.spec.ts`, `*.e2e-spec.ts`), `findViolations(input: { deleted: string[]; added: { file: string; line: string }[] }): string[]`
  - CLI: `node scripts/check-test-integrity.cjs [--base <ref>]` — 위반 없으면 exit 0, 있으면 위반 목록을 stderr 에 쓰고 exit 1. 비교 범위 = `<base>` 대비 작업 트리 + 추적 안 된 테스트 파일. base 가 `null` 이면 추적 안 된 파일만 검사

- [ ] **Step 1: 실패하는 테스트 작성** — `test-integrity.spec.ts`
  ```ts
  expect(findViolations({ deleted: ['src/a.spec.ts'], added: [] })).toEqual(['테스트 파일 삭제: src/a.spec.ts']);
  expect(findViolations({ deleted: ['src/a.ts'], added: [] })).toEqual([]);
  it.each(['it.skip(', 'describe.only(', 'test.skip(', 'xit(', 'xdescribe(', 'fit(', 'fdescribe('])(
    '금지 패턴 %s', (p) => expect(findViolations({ deleted: [], added: [{ file: 'src/a.spec.ts', line: `  ${p}'x', () => {})` }] })).toHaveLength(1));
  expect(findViolations({ deleted: [], added: [{ file: 'src/a.ts', line: 'it.skip(' }] })).toEqual([]); // 테스트 파일 아님
  expect(findViolations({ deleted: [], added: [{ file: 'src/a.spec.ts', line: "it('skip 처리 확인', ...)" }] })).toEqual([]); // 문자열 속 단어는 무시
  ```
  `git.spec.ts`: 임시 디렉터리에 `git init` 직후(커밋 없음) `defaultBase` → `null`, 커밋 1개 후 → `'HEAD'`, bare 원격에 `main` push 후 → `'origin/main'`
- [ ] **Step 2:** `npm test -- test-integrity git` → FAIL
- [ ] **Step 3:** 구현 — 금지 패턴 정규식 `/\b(?:(?:it|describe|test)\.(?:skip|only)|x(?:it|describe|test)|f(?:it|describe))\s*\(/`. diff 는 `git diff --unified=0 --name-status` / `git diff --unified=0 <base>` 의 `+` 줄
- [ ] **Step 4:** `npm test -- test-integrity git` → PASS
- [ ] **Step 5:** `npm run test:integrity` → exit 0
- [ ] **Step 6: Commit** — `feat: 테스트 약화 감지 스크립트(G6) 추가`

---

### Task 4: 훅 공통 입출력 + 편집·Bash 가드 (PreToolUse)

**Files:**
- Create: `.claude/hooks/lib/hook-io.cjs`, `.claude/hooks/pre-edit-guard.cjs`, `.claude/hooks/pre-bash-guard.cjs`
- Test: `test/tooling/pre-edit-guard.spec.ts`, `test/tooling/pre-bash-guard.spec.ts`

**Interfaces:**
- Consumes: `fileInRef`, `defaultBase` (Task 3), `assertDbNameDestructiveAllowed`, `isLocalHost` (Task 2)
- Produces:
  - `hook-io.cjs`: `readInput(): Promise<HookInput>` (stdin JSON), `block(reason: string): never` — stderr 에 사유를 쓰고 exit 2, `projectDir(input): string` — `process.env.CLAUDE_PROJECT_DIR ?? input.cwd`
  - 각 훅 파일은 `module.exports = { decide(input, ctx): { allow: true } | { allow: false; reason: string } }` 를 내보내고, 직접 실행 시 `decide` 결과로 exit 0 / `block()`. 테스트는 `decide` 를 직접 호출하고, 1개 테스트는 `child_process.spawnSync('node', [hook], { input: JSON })` 로 exit code 2 를 확인
- 훅 입력 필드: `tool_name`, `tool_input.file_path` (Edit/Write/MultiEdit), `tool_input.command` (Bash), `session_id`, `cwd` — [Hooks reference](https://code.claude.com/docs/en/hooks)

**`pre-edit-guard` 차단 규칙** (경로는 프로젝트 기준 상대경로로 정규화 후 판정):
| 대상 | 판정 |
| --- | --- |
| `docs/spec/**` | 차단 — "명세 사본은 노션에서만 갱신" |
| `.env`, `.env.*` (단 `.env.example` 허용) | 차단 |
| `.claude/settings.json`, `.claude/hooks/**` | 차단 — "루프가 자기 검증 장치를 바꾸지 못하게" |
| `migrations/*.sql` 중 `defaultBase()` 가 `origin/main` 이고 그 ref 에 존재하는 파일 | 차단 — "병합된 마이그레이션은 새 번호로 추가" |
| 그 외 | 허용 |

**`pre-bash-guard` 차단 규칙** (명령 문자열 전체를 `&&`, `||`, `;`, `|`, 줄바꿈으로 나눈 각 조각에 적용):
| 패턴 | 판정 |
| --- | --- |
| `git push` + (`--force` \| `-f` \| `--force-with-lease`) | 차단 |
| `git reset --hard`, `git clean -f*` | 차단 |
| `rm` 에 `-r`·`-f` 가 모두 있고 대상이 `/`, `~`, `..`, 프로젝트 루트, `.git`, 프로젝트 밖 절대경로 | 차단 |
| `dropdb <name>`, `createdb`/`DROP DATABASE <name>` 에서 name 이 `harukok_test`·`harukok_check` 가 아님 | 차단 |
| `psql` 의 `-h <host>` 또는 `postgres(ql)://` URL 의 호스트가 로컬 아님 | 차단 |
| `cat`/`less`/`head`/`tail`/`grep`/`source` 등이 `.env` 또는 `.env.local` 을 인자로 받음 | 차단 |

- [ ] **Step 1: 실패하는 테스트 작성** — `pre-edit-guard.spec.ts`
  ```ts
  // ctx = { projectDir, base, fileInBase(path) }  → git 없이 판정 로직만 검증
  expectBlocked({ file_path: `${dir}/docs/spec/01-api.md` });
  expectBlocked({ file_path: `${dir}/.env` });
  expectAllowed({ file_path: `${dir}/.env.example` });
  expectBlocked({ file_path: `${dir}/.claude/hooks/stop-verify.cjs` });
  expectBlocked({ file_path: `${dir}/migrations/20261110_001__init_schema.sql` }, { base: 'origin/main', inBase: true });
  expectAllowed({ file_path: `${dir}/migrations/20261110_001__init_schema.sql` }, { base: 'HEAD', inBase: true });   // origin/main 없음
  expectAllowed({ file_path: `${dir}/migrations/20261201_006__x.sql` }, { base: 'origin/main', inBase: false });
  expectAllowed({ file_path: `${dir}/src/modules/할 일/todo.ts` });   // 공백·한글 경로
  expectAllowed({ file_path: 'src/app.module.ts' });                  // 상대 경로
  ```
  `pre-bash-guard.spec.ts`
  ```ts
  it.each(['git push --force', 'git push -f origin main', 'git reset --hard HEAD~1',
    'cd src && rm -rf /', 'rm -rf ~', 'rm -fr ..', 'true; dropdb harukok_dev',
    'psql -c "DROP DATABASE harukok_dev"', 'psql -h db.example.com -d harukok_dev',
    'psql postgresql://u@10.0.0.5/harukok_test', 'cat .env'])('차단: %s', expectBlocked);
  it.each(['npm run verify', 'git push -u origin feat/todos', 'rm -rf dist', 'rm -rf node_modules/.cache',
    'dropdb harukok_check', 'createdb harukok_check', 'psql -h localhost -d harukok_dev -c "select 1"',
    'cat .env.example', 'git commit -m "fix: rm -rf 문구가 들어간 메시지"'])('허용: %s', expectAllowed);
  ```
  마지막 허용 사례는 따옴표 안 문자열은 검사하지 않음을 고정한다 (따옴표로 감싼 구간을 먼저 제거 후 판정. 단 `psql -c "..."` 의 SQL 은 `DROP DATABASE` 검사에 포함)
- [ ] **Step 2:** `npm test -- pre-edit-guard pre-bash-guard` → FAIL
- [ ] **Step 3:** 구현
- [ ] **Step 4:** `npm test -- pre-edit-guard pre-bash-guard` → PASS (spawn 테스트에서 차단 시 exit 2, stderr 에 사유 포함)
- [ ] **Step 5: Commit** — `feat: 편집·Bash 사전 차단 훅 추가`

---

### Task 5: 수정 후 포맷 훅 + 종료 검증 훅 + settings.json

**Files:**
- Create: `.claude/hooks/post-edit-format.cjs`, `.claude/hooks/stop-verify.cjs`, `.claude/settings.json`
- Test: `test/tooling/post-edit-format.spec.ts`, `test/tooling/stop-verify.spec.ts`

**Interfaces:**
- Consumes: `hook-io.cjs` (Task 4)
- Produces:
  - `post-edit-format.cjs`: `targetsFor(filePath, projectDir): { eslint: boolean; prettier: boolean } | null` — 프로젝트 밖·`node_modules`·`dist`·`docs/spec`·존재하지 않는 파일이면 `null`. eslint 대상: `.ts .js .cjs .mjs`, prettier 대상: 그 외 `.json .md .yml .yaml` 포함. 실행: `npx eslint --fix -- <file>` → `npx prettier --write -- <file>` (인자 배열로 넘겨 공백 경로 안전). eslint 가 오류를 남기면 출력 마지막 40줄로 `block()`
  - `stop-verify.cjs`:
    - `MAX_RETRIES = 3`
    - `statePath(projectDir, sessionId): string` → `.claude/state/stop-<sessionId>.json` (`{ "failures": number }`)
    - `nextAction(failuresBefore: number, passed: boolean): 'pass' | 'block' | 'give-up'` — passed → `'pass'`(상태 삭제), 실패 && `failuresBefore + 1 < MAX_RETRIES` → `'block'`, 그 외 → `'give-up'`
    - 실행: `npm run verify:fast` (stdout+stderr 수집). `'block'` → 출력 마지막 80줄 + "검증 실패 (n/3). 고친 뒤 다시 종료하세요" 로 `block()`. `'give-up'` → `.claude/state/STUCK-<sessionId>.md` 에 마지막 출력 기록, stderr 에 "3회 연속 실패 — 사람 확인 필요" 출력, exit 0
- `.claude/settings.json`:
  ```json
  {
    "hooks": {
      "PreToolUse": [
        { "matcher": "Edit|Write|MultiEdit", "hooks": [{ "type": "command", "command": "node \"$CLAUDE_PROJECT_DIR\"/.claude/hooks/pre-edit-guard.cjs" }] },
        { "matcher": "Bash", "hooks": [{ "type": "command", "command": "node \"$CLAUDE_PROJECT_DIR\"/.claude/hooks/pre-bash-guard.cjs" }] }
      ],
      "PostToolUse": [
        { "matcher": "Edit|Write|MultiEdit", "hooks": [{ "type": "command", "command": "node \"$CLAUDE_PROJECT_DIR\"/.claude/hooks/post-edit-format.cjs", "timeout": 60 }] }
      ],
      "Stop": [
        { "hooks": [{ "type": "command", "command": "node \"$CLAUDE_PROJECT_DIR\"/.claude/hooks/stop-verify.cjs", "timeout": 600 }] }
      ]
    },
    "permissions": {
      "allow": ["Bash(npm run:*)", "Bash(npm test:*)", "Bash(npx eslint:*)", "Bash(npx prettier:*)",
                "Bash(git status:*)", "Bash(git diff:*)", "Bash(git log:*)", "Bash(git add:*)",
                "Bash(git commit:*)", "Bash(git switch:*)", "Bash(git checkout -b:*)", "Bash(git push:*)",
                "Bash(gh pr create:*)", "Bash(gh pr view:*)", "Bash(psql:*)", "Bash(createdb:*)", "Bash(dropdb:*)"],
      "deny": ["Read(./.env)", "Read(./.env.local)"]
    }
  }
  ```

- [ ] **Step 1: 실패하는 테스트 작성** — `stop-verify.spec.ts`
  ```ts
  expect(nextAction(0, true)).toBe('pass');
  expect(nextAction(0, false)).toBe('block');
  expect(nextAction(1, false)).toBe('block');
  expect(nextAction(2, false)).toBe('give-up');
  expect(statePath('/p', 'abc')).toBe('/p/.claude/state/stop-abc.json');
  expect(statePath('/p', 'abc')).not.toBe(statePath('/p', 'def'));   // 세션 분리
  ```
  추가로 `runStop({ projectDir, sessionId, verify: () => ({ passed, output }) })` 를 내보내 주입 가능하게 하고: 실패 2회 → 상태 `failures: 2`, 이어서 통과 → 상태 파일 삭제, 세 번째 실패 → `STUCK-<id>.md` 생성·exit 0 을 검증

  `post-edit-format.spec.ts`
  ```ts
  expect(targetsFor(`${dir}/src/a.ts`, dir)).toEqual({ eslint: true, prettier: true });
  expect(targetsFor(`${dir}/README.md`, dir)).toEqual({ eslint: false, prettier: true });
  expect(targetsFor(`${dir}/docs/spec/01-api.md`, dir)).toBeNull();
  expect(targetsFor(`${dir}/node_modules/x/a.ts`, dir)).toBeNull();
  expect(targetsFor('/etc/hosts', dir)).toBeNull();
  expect(targetsFor(`${dir}/src/할 일/a b.ts`, dir)).toEqual({ eslint: true, prettier: true });  // 파일을 실제로 만들어 둔 뒤
  ```
- [ ] **Step 2:** `npm test -- stop-verify post-edit-format` → FAIL
- [ ] **Step 3:** 훅 2개 구현
- [ ] **Step 3-1:** `settings.json` 은 **훅 파일이 모두 완성된 뒤 마지막에** 작성한다. 이 파일이 생기면 이 저장소에서 도는 Claude Code 세션에 훅이 바로 적용되어, 이후 `.claude/hooks/**` 수정이 차단된다(의도된 동작). 이후 훅 수정이 필요하면 사람이 직접 고친다
- [ ] **Step 4:** `npm test -- stop-verify post-edit-format` → PASS, `npm run verify:fast` → PASS
- [ ] **Step 5: Commit** — `feat: 수정 후 포맷 훅, 종료 검증 훅(재시도 3회), 훅·권한 설정 추가`

---

### Task 6: CLAUDE.md + CI

**Files:**
- Create: `CLAUDE.md`, `.github/workflows/ci.yml`
- Test: `test/tooling/claude-md.spec.ts`

**Interfaces:**
- Consumes: Task 1 스크립트 이름, Task 4·5 차단 규칙

**`CLAUDE.md` 목차** (설계 문서 P3 순서, 각 항목은 짧은 규칙 문장. 120줄 이내):
1. 프로젝트 정의 1줄 · 출시일 2026-11-30 · 명세 위치 `docs/spec/` · 문서 우선순위
2. 명령어 표 (Task 1 표와 동일 이름)
3. 폴더 구조 · 모듈 규칙 (`src/modules/<도메인>/{controller,usecases,dto,entities,errors}`, `src/common/`, UseCase 1파일 1유스케이스, `BusinessException`)
4. 명세 코드 규칙 8개 (설계 문서 P3-4 목록 그대로)
5. 테스트 규칙 (UseCase마다 `.spec.ts` 4케이스: 성공 / NOT_FOUND / 권한 / 저장 실패, DB 제약·트랜잭션은 e2e, 외부 제공자는 인터페이스 + 가짜 구현)
6. 금지 사항 (테스트 삭제·skip·only·단언 약화, 병합된 마이그레이션 수정, "안 만들 것" 기능, `.env` 읽기·시크릿 하드코딩, `docs/spec` 수정)
7. 루프 절차 (설계 문서 P6 1~4단계) · 완료 정의: `npm run verify` 통과 + PR 생성 · 막히면(STUCK 파일 생성 시) 멈추고 보고
8. 커밋·브랜치 규칙 (`feat/<단위>`, Conventional Commits)

**`ci.yml`:** `on: pull_request, push: branches: [main]` · `ubuntu-latest` · `actions/setup-node` (`node-version-file: .nvmrc`, `cache: npm`) · `npm ci` → `npm run lint` → `npm run format:check` → `npm run typecheck` → `npm test` → `npm run test:integrity -- --base origin/${{ github.base_ref || 'main' }}` (`actions/checkout` 에 `fetch-depth: 0`). PostgreSQL 18 서비스 컨테이너와 `db:check`·`test:e2e` 단계는 **0단위에서 추가**한다는 주석을 남긴다

- [ ] **Step 1: 실패하는 테스트 작성** — `claude-md.spec.ts`: `CLAUDE.md` 에 등장하는 `` `npm run <name>` `` 이 전부 `package.json` scripts 에 존재한다 / `docs/spec/` 문자열 포함 / 140줄 이하
- [ ] **Step 2:** `npm test -- claude-md` → FAIL (파일 없음)
- [ ] **Step 3:** `CLAUDE.md`, `ci.yml` 작성
- [ ] **Step 4:** `npm test -- claude-md` → PASS, `npm run verify:fast` → PASS
- [ ] **Step 5: Commit** — `docs: CLAUDE.md 루프 규칙서와 CI 워크플로 추가`

---

### Task 7: 게이트 리허설 + 원격 반영

**Files:** 없음 (확인 결과는 PR 본문에 기록)

- [ ] **Step 1: 게이트 리허설** — 각 항목을 임시로 만들고 기대 결과를 확인한 뒤 되돌린다
  | 시도 | 기대 |
  | --- | --- |
  | `src/` 에 린트 오류 파일 → `post-edit-format.cjs` 를 해당 입력 JSON 으로 실행 | exit 2, 오류 메시지 |
  | 타입 오류 추가 → `stop-verify.cjs` 3회 실행 | exit 2, exit 2, exit 0 + `STUCK-*.md` |
  | `src/app.module.spec.ts` 에 `it.skip(` 추가 → `npm run test:integrity` | exit 1 |
  | `pre-edit-guard.cjs` 에 `docs/spec/01-api.md` 입력 | exit 2 |
  | `pre-bash-guard.cjs` 에 `dropdb harukok_dev` 입력 | exit 2 |
  | 전부 되돌린 뒤 `npm run verify:fast` | PASS, `git status` 깨끗 |
- [ ] **Step 2:** 기본 브랜치 생성 — 설계 문서 커밋 2개만 `main` 으로 먼저 push (`git push -u origin <설계 커밋>:refs/heads/main`), 준비 작업 커밋은 `chore/loop-setup` 브랜치로 push
- [ ] **Step 3:** `gh pr create --base main --head chore/loop-setup` — 본문: 작업 요약, 리허설 표 결과, Task 2 Step 8 수동 확인 결과(또는 "Mac에서 확인 필요"), 선호님 확인 체크리스트(`docs/setup-local.md` 따라 Mac 설정 → `npm run db:setup` 성공)
- [ ] **Step 4:** CI 통과 확인 (`gh pr checks`)
- [ ] **Step 5: 선호님 작업으로 안내** — 병합 후 `main` 보호 규칙: PR 필수, 상태 검사 `ci` 필수, 승인 리뷰 필수 없음, force push 금지 (GitHub 저장소 Settings → Branches, 또는 `gh api` 명령을 PR 본문에 첨부)
