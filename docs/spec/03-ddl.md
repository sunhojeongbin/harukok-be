> 노션 원본: https://app.notion.com/p/417b98b3029980c78f0dfd3dbb85c4c5
> 원본 최종 수정: 2026-11-13 (이용약관 단일화·006 반영)
> 동기화: 2026-11-13 (노션 → 저장소 한 방향. 이 파일을 직접 고치지 말 것)

# DDL(MVP v1)

> ⚠️ **이 페이지의 001 블록은 002\~004 가 반영된 통합판이다 (2026-11-12 갱신).**
>
> 반영 내용: `users.name` + `ck_users_name` (004) · `todos.deleted_at` + 부분 인덱스 2개 (003) · 제약·인덱스 이름 15개 교제 (002). `todos` 주석과 운영 쿼리도 소프트 삭제 기준으로 고쳭다.
>
> ⚠️ 단, 이 통합은 **DB 설계서 · DB 표중 · ERD 세 문서를 근거로 재구성한 것**이고 실제 `.sql` 파일을 대조한 것이 아니다. 한 글자심 일치한다고 보장할 수 없으니 적용 전 `20261110_001__init_schema.sql` 과 diff 해서 확인할 것. 차이가 있으면 **파일이 기준**이다.

```sql
-- ============================================================================
--  하루콕 (HaruKok) — MVP v1 초기 스키마
--  Target   : PostgreSQL 18+
--  Created  : 2026-11-10 / 갱신 2026-11-12 (002·003·004 반영 통합판)
--  Encoding : UTF-8
--
--  적용 : psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f 20261110_001__init_schema.sql
--  롤백 : psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f 20261110_001__init_schema.down.sql
--
--  확정된 설계 결정
--    1. PostgreSQL 18 사용        → uuidv7() 내장 함수 사용
--    2. 할 일 제목 최대 250자      → CHECK 제약
--    3. 이메일 수집                → users.email 유지 (App Privacy 신고 필요)
--    4. 탈퇴 시 약관 동의 이력 삭제 → ON DELETE CASCADE 유지
--    5. 다중 기기 로그인 최대 3대   → 기기당 1토큰(부분 UNIQUE) + 앱 레벨 3대 제한
--    6. 소셜 제공자 3종            → KAKAO / APPLE / GOOGLE
--    7. 할 일 삭제 되돌리기         → todos.deleted_at 소프트 삭제 + 부분 인덱스 2개
--    8. 사용자명 저장              → users.name (NULL 허용, 공백 제외 1~50자)
--
--  이 파일은 002(제약·인덱스 rename) · 003(소프트 삭제) · 004(사용자명) 가 모두 반영된
--  전체 스키마다. 신규 환경이면 이 파일과 005 만 실행하면 된다.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 0. 사전 조건 검사
--    uuidv7() 는 PostgreSQL 18 부터 내장. 하위 버전에서 조용히 실패하지 않도록 차단.
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF current_setting('server_version_num')::int < 180000 THEN
    RAISE EXCEPTION
      'PostgreSQL 18 이상이 필요합니다. 현재 버전: %', current_setting('server_version');
  END IF;
END
$$;


-- ----------------------------------------------------------------------------
-- 1. 공통 함수 — updated_at 자동 갱신
--    PostgreSQL 에는 MySQL 의 ON UPDATE CURRENT_TIMESTAMP 가 없다.
--    애플리케이션(@UpdateDateColumn)에만 의존하면 직접 SQL·배치 수정 시 누락된다.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION set_updated_at() IS 'BEFORE UPDATE 트리거용. updated_at 을 현재 시각으로 갱신한다.';


-- ----------------------------------------------------------------------------
-- 2. users — 사용자
-- ----------------------------------------------------------------------------
CREATE TABLE users (
  id         uuid        PRIMARY KEY DEFAULT uuidv7(),
  name       text        NULL,
  email      text        NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- 이메일 정규화를 DB 에서 강제한다. 앱이 lower()/trim() 을 빠뜨리면
  -- 조용히 섞여 들어가는 대신 INSERT 시점에 즉시 실패한다.
  -- 빈 문자열은 NULL 로 넣어야 하므로 함께 거부한다.
  CONSTRAINT ck_users_email CHECK (
    email IS NULL
    OR (email = lower(btrim(email)) AND char_length(email) BETWEEN 3 AND 254)
  ),

  -- 사용자명은 식별·중복 판별에 쓰지 않으므로 이메일보다 느슨하게 간다.
  -- 대소문자·공백 차이가 문제를 일으키지 않기 때문이다.
  -- DB 기본값을 두지 않는다: DEFAULT '하루콕 사용자' 를 두면
  -- 사용자가 직접 그 이름을 정한 경우와 구분할 수 없다. 화면 기본 문구는 앱이 정한다.
  CONSTRAINT ck_users_name CHECK (
    name IS NULL OR char_length(btrim(name)) BETWEEN 1 AND 50
  )
);

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE  users          IS '서비스 사용자. 소셜 로그인으로만 생성된다.';
COMMENT ON COLUMN users.id       IS 'UUIDv7. 시간순 정렬이 되므로 생성순 정렬에 ORDER BY id 사용 가능.';
COMMENT ON COLUMN users.name     IS '표시용 사용자명. 소셜 제공값을 HTML 제거·50자 절삭 후 저장한다. '
                                    'NULL 허용: 애플은 이름을 최초 인가 1회에만 전달하고, 사용자가 제공을 거부할 수도 있다. '
                                    '자유 텍스트이므로 입력 경로에 HTML 제거를 반드시 적용할 것.';
COMMENT ON COLUMN users.email    IS '소셜 제공 이메일(소문자 정규화해 저장). '
                                    '애플은 최초 인가 1회에만 전달하므로 그때 반드시 저장할 것. '
                                    'NULL 허용: 애플 relay·미제공, 카카오 이메일 동의 거부 가능. '
                                    'UNIQUE 금지: 같은 사람이 구글과 애플로 각각 가입하면 동일 이메일이 중복된다. '
                                    'ck_users_email 로 소문자·trim·길이(3~254)를 DB 에서 강제한다.';


-- ----------------------------------------------------------------------------
-- 3. user_social_accounts — 소셜 계정 연결
--    users 와 1:N. 제공자가 3종(카카오/애플/구글)이라 같은 사람이 서로 다른 제공자로
--    중복 가입하는 경우가 실제로 발생한다. 뒤에 계정을 통합할 수 있도록 분리해 둔다.
--    제공자 추가는 ck_user_social_accounts_provider 제약 교체만으로 끝난다.
-- ----------------------------------------------------------------------------
CREATE TABLE user_social_accounts (
  id               uuid        PRIMARY KEY DEFAULT uuidv7(),
  user_id          uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider         varchar(20) NOT NULL,
  provider_user_id text        NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT ck_user_social_accounts_provider        CHECK (provider IN ('KAKAO', 'APPLE', 'GOOGLE')),
  CONSTRAINT uq_user_social_accounts_provider_user_id UNIQUE (provider, provider_user_id)
);

CREATE INDEX idx_user_social_accounts_user_id ON user_social_accounts (user_id);

COMMENT ON TABLE  user_social_accounts                  IS '소셜 제공자별 계정 연결.';
COMMENT ON COLUMN user_social_accounts.provider         IS 'KAKAO | APPLE | GOOGLE. ENUM 대신 CHECK 사용 — 값 변경·삭제가 자유롭다.';
COMMENT ON COLUMN user_social_accounts.provider_user_id IS '카카오 회원번호(숫자 문자열), 애플 sub, 구글 sub. 길이·형식이 달라 text.';


-- ----------------------------------------------------------------------------
-- 4. refresh_tokens — 리프레시 토큰 (자동 로그인 / 토큰 재발급 / 로그아웃)
--
--    [다중 기기 정책] 사용자당 활성 기기 최대 3대
--      - DB 보장  : 기기당 활성 토큰 1개 (uq_refresh_tokens_user_id_device_id_active)
--      - 앱 보장  : 3대 초과 시 가장 오래된 기기 자동 폐기 (문서의 로그인 트랜잭션 참고)
--      - DB 트리거로 개수를 강제하지 않는 이유: 동시 로그인 레이스를 막으려면
--        직렬화 수준 격상이나 advisory lock 이 필요해 비용이 크다.
--        로그인 트랜잭션에서 사용자 행을 잠그고 처리하는 편이 단순하고 확실하다.
-- ----------------------------------------------------------------------------
CREATE TABLE refresh_tokens (
  id         uuid        PRIMARY KEY DEFAULT uuidv7(),
  user_id    uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash bytea       NOT NULL,
  device_id  text        NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_refresh_tokens_token_hash UNIQUE (token_hash),
  CONSTRAINT ck_refresh_tokens_device_id  CHECK (char_length(btrim(device_id)) BETWEEN 1 AND 128),
  CONSTRAINT ck_refresh_tokens_expires_at CHECK (expires_at > created_at)
);

-- 기기당 활성 토큰은 1개만 허용
CREATE UNIQUE INDEX uq_refresh_tokens_user_id_device_id_active
  ON refresh_tokens (user_id, device_id)
  WHERE revoked_at IS NULL;

-- 활성 토큰 조회·개수 세기 (부분 인덱스로 크기 최소화)
CREATE INDEX idx_refresh_tokens_user_id_active
  ON refresh_tokens (user_id, created_at DESC)
  WHERE revoked_at IS NULL;

-- 만료 토큰 정리 배치용
CREATE INDEX idx_refresh_tokens_expires_at ON refresh_tokens (expires_at);

COMMENT ON TABLE  refresh_tokens            IS '리프레시 토큰. 사용자당 활성 기기 최대 3대.';
COMMENT ON COLUMN refresh_tokens.token_hash IS 'SHA-256(원문 토큰). 평문 저장 금지 — 유출 시 전 계정 탈취로 이어진다.';
COMMENT ON COLUMN refresh_tokens.device_id  IS '클라이언트가 생성해 기기 저장소에 보관하는 식별자. 재설치 시 새 값이어도 무방.';
COMMENT ON COLUMN refresh_tokens.revoked_at IS '로그아웃·강제 폐기 시각. 삭제하지 않고 남겨 재사용 탐지에 쓴다.';


-- ----------------------------------------------------------------------------
-- 5. terms — 약관 (버전 관리)
--    본문은 DB 에 넣지 않고 외부 공개 페이지 URL 만 보관한다(기능 명세서 기준).
-- ----------------------------------------------------------------------------
CREATE TABLE terms (
  id             uuid        PRIMARY KEY DEFAULT uuidv7(),
  type           varchar(20) NOT NULL,
  version        varchar(20) NOT NULL,
  title          text        NOT NULL,
  content_url    text        NOT NULL,
  is_required    boolean     NOT NULL DEFAULT true,
  effective_from timestamptz NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT ck_terms_type        CHECK (type IN ('SERVICE', 'PRIVACY')),
  CONSTRAINT uq_terms_type_version UNIQUE (type, version)
);

-- 시행일 기준 최신 약관 조회
CREATE INDEX idx_terms_type_effective_from ON terms (type, effective_from DESC);

COMMENT ON TABLE  terms                IS '약관 버전. 개정 시 행을 추가하고 기존 행은 보존한다.';
COMMENT ON COLUMN terms.type           IS 'SERVICE(이용약관) | PRIVACY(개인정보 처리방침)';
COMMENT ON COLUMN terms.content_url    IS '외부 공개 페이지 URL. 앱은 WebView 로 표시한다.';
COMMENT ON COLUMN terms.effective_from IS '시행일. 가입 시 이 시각 이전 중 최신 버전을 노출한다.';


-- ----------------------------------------------------------------------------
-- 6. user_term_agreements — 약관 동의 이력
--    [결정] 탈퇴 시 CASCADE 삭제. 동의 이력 보관 의무와 개인정보 파기 의무가
--    충돌할 수 있는 영역이므로 정책 변경 시 법률 검토가 선행되어야 한다.
-- ----------------------------------------------------------------------------
CREATE TABLE user_term_agreements (
  id        uuid        PRIMARY KEY DEFAULT uuidv7(),
  user_id   uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  term_id   uuid        NOT NULL REFERENCES terms(id) ON DELETE RESTRICT,
  agreed_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_user_term_agreements_user_id_term_id UNIQUE (user_id, term_id)
);

CREATE INDEX idx_user_term_agreements_user_id ON user_term_agreements (user_id);

COMMENT ON TABLE  user_term_agreements         IS '사용자별 약관 버전 동의 이력. 탈퇴 시 CASCADE 삭제.';
COMMENT ON COLUMN user_term_agreements.term_id IS 'ON DELETE RESTRICT — 동의 이력이 있는 약관 버전은 삭제할 수 없다.';


-- ----------------------------------------------------------------------------
-- 7. todos — 할 일
-- ----------------------------------------------------------------------------
CREATE TABLE todos (
  id           uuid        PRIMARY KEY DEFAULT uuidv7(),
  user_id      uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title        text        NOT NULL,
  due_date     date        NOT NULL,
  completed_at timestamptz NULL,
  deleted_at   timestamptz NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT ck_todos_title CHECK (char_length(btrim(title)) BETWEEN 1 AND 250)
);

-- 홈 화면 핵심 인덱스
--   WHERE user_id = $1 AND due_date  = $2                  AND deleted_at IS NULL ORDER BY id
--   WHERE user_id = $1 AND due_date >= $2 AND due_date < $3 AND deleted_at IS NULL ORDER BY due_date, id
--
-- 소프트 삭제 도입으로 부분 인덱스가 됐다. 살아있는 행만 담는다.
-- 조회에서 deleted_at IS NULL 을 붙이지 않으면 이 인덱스를 못 타고 Seq Scan 으로 떨어지며,
-- 동시에 삭제한 할 일이 화면에 다시 나타나는 버그가 된다. 두 가지가 한 번에 깨진다.
CREATE INDEX idx_todos_user_id_due_date ON todos (user_id, due_date, id)
  WHERE deleted_at IS NULL;

-- 정리 배치용. 삭제된 행만 담으므로 평소에는 거의 비어 있다.
CREATE INDEX idx_todos_deleted_at ON todos (deleted_at)
  WHERE deleted_at IS NOT NULL;

CREATE TRIGGER trg_todos_updated_at
  BEFORE UPDATE ON todos
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE  todos              IS '할 일. 소프트 삭제(deleted_at) 사용(휴지통 화면은 만들지 않음) — 되돌리기는 삭제 직후 스낵바에서만 가능하다.';
COMMENT ON COLUMN todos.title        IS '최대 250자. 공백만 입력은 CHECK 에서 거부된다.';
COMMENT ON COLUMN todos.due_date     IS '달력상의 날짜(시각 아님). timestamptz 로 저장하면 UTC 변환으로 날짜가 하루 밀린다. '
                                        '어느 타임존 기준 날짜인지는 클라이언트가 정해 보낸다.';
COMMENT ON COLUMN todos.completed_at IS 'NULL = 미완료. 완료 여부와 완료 시각을 한 컬럼으로 표현한다.';
COMMENT ON COLUMN todos.deleted_at   IS 'NULL = 살아있음. 삭제 되돌리기를 위한 소프트 삭제 표시. '
                                        '7일 경과분은 정리 배치가 하드 삭제한다. '
                                        '목록·단건·수정·완료변경 조회 전부에 deleted_at IS NULL 을 붙일 것.';

COMMIT;


-- ============================================================================
--  초기 데이터 (약관) — URL 확정 후 주석을 해제하고 실행할 것
-- ============================================================================
-- INSERT INTO terms (type, version, title, content_url, is_required, effective_from) VALUES
--   ('SERVICE', '1.0', '서비스 이용약관',     'https://<공개 URL>', true, '2026-01-01T00:00:00+09'),
--   ('PRIVACY', '1.0', '개인정보 처리방침',   'https://<공개 URL>', true, '2026-01-01T00:00:00+09');


-- ============================================================================
--  운영 쿼리 모음 (실행용 아님 — 참고)
-- ============================================================================
--
-- [로그인] 기기 3대 제한 적용. 하나의 트랜잭션으로 실행한다.
--
--   BEGIN;
--   -- (1) 동시 로그인 레이스 차단: 사용자 행 잠금
--   SELECT id FROM users WHERE id = $user_id FOR UPDATE;
--
--   -- (2) 같은 기기의 기존 토큰 폐기
--   UPDATE refresh_tokens SET revoked_at = now()
--    WHERE user_id = $user_id AND device_id = $device_id AND revoked_at IS NULL;
--
--   -- (3) 활성 토큰이 3개 이상이면, 최신 2개만 남기고 폐기
--   --     (이후 1개를 새로 넣으므로 결과는 정확히 3개)
--   UPDATE refresh_tokens SET revoked_at = now()
--    WHERE id IN (
--      SELECT id FROM refresh_tokens
--       WHERE user_id = $user_id AND revoked_at IS NULL AND expires_at > now()
--       ORDER BY created_at DESC, id DESC   -- 동일 시각 타이브레이커 필수
--      OFFSET 2
--    );
--
--   -- (4) 신규 토큰 발급
--   INSERT INTO refresh_tokens (user_id, token_hash, device_id, expires_at)
--   VALUES ($user_id, $token_hash, $device_id, $expires_at);
--   COMMIT;
--
-- [로그아웃] 해당 기기만 폐기
--   UPDATE refresh_tokens SET revoked_at = now()
--    WHERE user_id = $user_id AND device_id = $device_id AND revoked_at IS NULL;
--
-- [토큰 재발급] 유효성 검사
--   SELECT user_id FROM refresh_tokens
--    WHERE token_hash = $hash AND revoked_at IS NULL AND expires_at > now();
--
-- [정리 배치] 만료 후 30일 지난 토큰 삭제 (주 1회 권장)
--   DELETE FROM refresh_tokens WHERE expires_at < now() - interval '30 days';
--
-- [할 일 삭제] 소프트 삭제. user_id 를 조건에 넣어 남의 할 일을 건드리지 못하게 한다.
--   UPDATE todos SET deleted_at = now()
--    WHERE id = $todo_id AND user_id = $user_id AND deleted_at IS NULL;
--
-- [할 일 되돌리기] 멱등 — 이미 살아있으면 0건 영향
--   UPDATE todos SET deleted_at = NULL
--    WHERE id = $todo_id AND user_id = $user_id AND deleted_at IS NOT NULL;
--
-- [정리 배치] 삭제 표시 후 7일 지난 할 일 하드 삭제 (일 1회)
--   DELETE FROM todos WHERE deleted_at < now() - interval '7 days';
--
-- [인덱스 검증]
--   EXPLAIN ANALYZE
--   SELECT id, title, completed_at FROM todos
--    WHERE user_id = $1 AND due_date = $2 AND deleted_at IS NULL ORDER BY id;
--   -- 기대: Index Scan using idx_todos_user_id_due_date
--   -- deleted_at IS NULL 을 빼고 실행해 Seq Scan 으로 떨어지는 것도 함께 확인할 것
-- ============================================================================
```

---

## 005 — 소셜 연동 해제용 토큰 보관

```sql
-- ============================================================================
--  하루콕 (HaruKok) — 005 소셜 연동 해제용 토큰 보관
--  Target   : PostgreSQL 18+
--  Created  : 2026-11-12
--  Encoding : UTF-8
--
--  적용 : psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f 20261112_005__social_unlink.sql
--  롤백 : psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f 20261112_005__social_unlink.down.sql
--
--  [배경]
--    App Store 심사 요건상 탈퇴 시 애플 /auth/revoke 를 호출해야 하고,
--    그 호출에는 애플이 발급한 refresh token 의 '원문' 이 필요하다.
--    refresh_tokens.token_hash 는 SHA-256 단방향이라 재사용할 수 없다.
--
--  [제공자별 해제 방식] — 저장이 필요한 곳은 애플뿐
--    APPLE  : 서버가 /auth/revoke 호출             → 토큰 저장 필요 (이 컬럼)
--    KAKAO  : 서버가 어드민 키 + 회원번호로 unlink  → provider_user_id 로 충분
--    GOOGLE : 클라이언트 SDK disconnect()          → 저장 불필요
-- ============================================================================

BEGIN;

ALTER TABLE user_social_accounts
  ADD COLUMN provider_refresh_token_enc bytea NULL;

-- 애플 행에만 값이 들어가도록 DB 에서 강제한다.
-- 앱에만 맡기면 다른 제공자 토큰이 조용히 섞여 들어가고, 평문 유출 사고가 나기 전까지 드러나지 않는다.
-- 나중에 다른 제공자도 토큰 저장이 필요해지면 ck_user_social_accounts_provider 와 같은 방식으로 제약만 교체한다.
ALTER TABLE user_social_accounts
  ADD CONSTRAINT ck_user_social_accounts_provider_refresh_token_enc CHECK (
    provider_refresh_token_enc IS NULL OR provider = 'APPLE'
  );

COMMENT ON COLUMN user_social_accounts.provider_refresh_token_enc IS
  '제공자리프레시토큰암호문. 탈퇴 시 연동 해제 호출에 사용한다. '
  'APPLE 행만 채운다 — KAKAO 는 어드민 키, GOOGLE 은 클라이언트가 해제. '
  '해시가 아니라 양방향 암호화(복호화해서 호출 인자로 쓴다)이므로 평문 저장 금지. '
  '암호화 키는 DB 와 다른 곳에 보관할 것. users 삭제 시 CASCADE 로 함께 파기된다.';

COMMIT;
```

### 005 롤백

```sql
-- ============================================================================
--  하루콕 (HaruKok) — 005 롤백
--
--  ⚠️ 이 스크립트는 저장된 애플 refresh token 을 '전부 파기' 한다.
--     롤백 후 005 를 다시 적용해도 기존 애플 사용자의 토큰은 복구되지 않으며,
--     그 사용자들은 탈퇴 시 수동 해제 경로(사용자가 애플 설정에서 직접 연결 해제)로 떨어진다.
--     운영 적용 후 롤백은 사실상 비가역이라고 보고 판단할 것.
-- ============================================================================

BEGIN;

-- 컬럼을 지우면 ck_user_social_accounts_provider_refresh_token_enc 도 함께 사라진다.
ALTER TABLE user_social_accounts
  DROP COLUMN IF EXISTS provider_refresh_token_enc;

COMMIT;
```

### 적용 전 확인할 것

- [ ] `provider_refresh_token_enc` 에 KAKAO·GOOGLE 값 INSERT 시도 → `ck_user_social_accounts_provider_refresh_token_enc` 위반으로 거부되는지
- [ ] APPLE 행 INSERT·조회·복호화 왕복
- [ ] NULL 허용 확인 (기존 행이 전부 NULL 로 채워지는지)
- [ ] 회원 탈퇴 CASCADE 로 이 컬럼까지 파기되는지
- [ ] 롤백 스크립트 실행 후 잔여 객체·제약 없음

---

## 006 — 이용약관 단일화

약관은 이용약관 1종이다. 개인정보 처리방침은 DB 에 두지 않고 앱이 노션 링크로 표시한다. 가입에 항상 필수이므로 `is_required` 도 둘 필요가 없다. 001 은 이미 적용된 파일이라 고치지 않고 006 으로 바꾼다.

```sql
-- ============================================================================
--  하루콕 (HaruKok) — 006 이용약관 단일화
--  Target   : PostgreSQL 18+
--  Created  : 2026-11-13
--  Encoding : UTF-8
--
--  적용 : npm run db:migrate
--  롤백 : npm run db:rollback (harukok_test 대상)
--
--  [배경]
--    약관은 이용약관 1종이다. 개인정보 처리방침은 DB 에 두지 않고 앱이 노션 링크로 표시한다.
--    GET /terms 는 목록이 아니라 현행 이용약관 1개를 돌려준다.
--    가입에 항상 필수이므로 is_required 도 없앤다.
-- ============================================================================

BEGIN;

-- 개인정보 처리방침 행은 더 이상 쓰지 않는다.
-- 동의 이력이 있으면 user_term_agreements 의 ON DELETE RESTRICT 로 실패한다 — 조용히 지워지지 않는다.
DELETE FROM terms WHERE type = 'PRIVACY';

DROP INDEX idx_terms_type_effective_from;
ALTER TABLE terms DROP CONSTRAINT uq_terms_type_version;
ALTER TABLE terms DROP CONSTRAINT ck_terms_type;
ALTER TABLE terms DROP COLUMN type;
ALTER TABLE terms DROP COLUMN is_required;

ALTER TABLE terms ADD CONSTRAINT uq_terms_version UNIQUE (version);

-- 시행일 기준 현행 약관 조회: WHERE effective_from <= now() ORDER BY effective_from DESC LIMIT 1
CREATE INDEX idx_terms_effective_from ON terms (effective_from DESC);

COMMENT ON TABLE terms IS '이용약관 버전. 개정 시 행을 추가하고 기존 행은 보존한다. 개인정보 처리방침은 DB 에 두지 않는다.';

COMMIT;
```

### 006 롤백

```sql
-- ============================================================================
--  하루콕 (HaruKok) — 006 롤백
--
--  ⚠️ 적용 시 지운 PRIVACY 행은 복구되지 않는다. 남은 행은 전부 SERVICE · 필수로 채운다.
--     복구한 컬럼은 테이블 끝에 붙는다 (컬럼 순서만 001 과 다르다).
-- ============================================================================

BEGIN;

DROP INDEX idx_terms_effective_from;
ALTER TABLE terms DROP CONSTRAINT uq_terms_version;

ALTER TABLE terms ADD COLUMN type varchar(20) NOT NULL DEFAULT 'SERVICE';
ALTER TABLE terms ALTER COLUMN type DROP DEFAULT;
ALTER TABLE terms ADD COLUMN is_required boolean NOT NULL DEFAULT true;

ALTER TABLE terms ADD CONSTRAINT ck_terms_type CHECK (type IN ('SERVICE', 'PRIVACY'));
ALTER TABLE terms ADD CONSTRAINT uq_terms_type_version UNIQUE (type, version);
CREATE INDEX idx_terms_type_effective_from ON terms (type, effective_from DESC);

COMMENT ON TABLE  terms      IS '약관 버전. 개정 시 행을 추가하고 기존 행은 보존한다.';
COMMENT ON COLUMN terms.type IS 'SERVICE(이용약관) | PRIVACY(개인정보 처리방침)';

COMMIT;
```

### 006 초기 데이터 (참고)

001 의 초기 데이터 주석은 006 이후 형식이 바뀐다. 이용약관 공개 URL 이 확정되면 새 번호 마이그레이션으로 넣는다.

```sql
-- INSERT INTO terms (version, title, content_url, effective_from) VALUES
--   ('1.0', '서비스 이용약관', 'https://<공개 URL>', '2026-01-01T00:00:00+09');
```

### 006 적용 전 확인할 것

- [ ] `db:check` 왕복 (001 → 005 → 006 → 롤백 → 재적용) 잔여 객체 0 · 재적용 동일
- [ ] 같은 `version` 두 번 INSERT → `uq_terms_version` 위반으로 거부
- [ ] PRIVACY 행에 동의 이력이 있으면 적용이 실패하는지 (RESTRICT)
