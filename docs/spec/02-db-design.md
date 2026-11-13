> 노션 원본: https://app.notion.com/p/417b98b3029980cabf60cee2697cab6a
> 원본 최종 수정: 2026-11-13 (이용약관 단일화·006 반영)
> 동기화: 2026-11-13 (노션 → 저장소 한 방향. 이 파일을 직접 고치지 말 것)

# 🗄️ DB 설계서 (MVP v1)

**테이블 6개** · 컬럼 1개 추가 예정(005)

- 대상 DBMS: **PostgreSQL 18+**
- 마이그레이션 파일: `001__init_schema` / `002__rename_constraints` / `003__todos_soft_delete` / `004__users_name` / `005__social_unlink` / `006__terms_single` (각 `.down.sql` 포함)
- 001 은 002·003·004 가 모두 반영된 전체 스키마다. 아직 적용 전이면 001 과 005 만 실행하면 된다
- 검증: PostgreSQL 16으로 문법·제약조건·인덱스·롤백 실행 확인 완료 (uuidv7()만 치환 후 테스트)
- ⚠️ **005 는 아직 미검증**이다. 적용 전 9장과 같은 절차로 확인할 것

---

## 1. 설계 내역

| # | 항목 | 결정 | 스키마 반영 |
| --- | --- | --- | --- |
| 1 | PostgreSQL 버전 | 18 사용 | `uuidv7()` 내장 함수를 PK 기본값으로 사용 |
| 2 | 할 일 제목 최대 길이 | 250자 | `CHECK (char_length(btrim(title)) BETWEEN 1 AND 250)` |
| 3 | 이메일 수집 | 수집함 | `users.email` 유지 (NULL 허용, UNIQUE 없음) |
| 4 | 탈퇴 시 약관 동의 이력 | 함께 삭제 | `ON DELETE CASCADE` 유지 |
| 5 | 다중 기기 로그인 | 최대 3대 | 기기당 1토큰(부분 UNIQUE) + 앱 레벨 3대 제한 |
| 6 | 소셜 제공자 | 카카오 · 애플 · **구글** 3종 | `CHECK (provider IN ('KAKAO','APPLE','GOOGLE'))` |
| 7 | 할 일 삭제 되돌리기 | 소프트 삭제 (휴지통 화면 없음) | `todos.deleted_at`  • 부분 인덱스 2개 |
| 8 | 사용자명 | 소셜 제공값 저장 | `users.name` (NULL 허용, 1\~50자) |
| 10 | 약관 | 이용약관 1종, 가입 시 동의 1회. 개인정보 처리방침은 앱이 노션 링크로 표시 | `terms.type` · `is_required` 제거, `version` UNIQUE (006) |

\| 9 \| 소셜 연동 해제 \| 애플만 토큰 저장. 카카오는 어드민 키, 구글은 클라이언트 \| `user_social_accounts.provider_refresh_token_enc` (암호문, NULL 허용) \|

---

## 2. 기능 → 테이블 매핑

| 기능 명세서 항목 | 테이블 |
| --- | --- |
| 카카오 로그인 / 애플 로그인 / 구글 로그인 | `users`, `user_social_accounts` |
| 약관 동의 | `terms`, `user_term_agreements` |
| 자동 로그인 판정 / 토큰 재발급 / 로그아웃 / 다중 로그인 | `refresh_tokens` |
| 할 일 등록, 수정, 삭제, 조회, 완료 | `todos` |
| 입력 검증 | `todos` CHECK 제약 |
| 회원 탈퇴 | `users` 삭제 + CASCADE. 삭제 **전에** `user_social_accounts` 에서 애플 토큰·회원번호를 읽어 연동 해제를 먼저 호출한다 (5-5) |
| 강제 업데이트 체크 | 없음 — Firebase Remote Config |
| 약관·개인정보·라이선스 조회, 문의하기, 앱 버전, 빈 상태, 네트워크 오류 | 없음 |

---

## 3. 관계도

```javascript
users ─┬─< user_social_accounts   (1:N, 소셜 계정 연결)
       ├─< refresh_tokens         (1:N, 기기별 세션 / 최대 3대)
       ├─< user_term_agreements >─ terms   (N:M 해소)
       └─< todos                  (1:N)
```

모든 자식 테이블은 `users` 에 `ON DELETE CASCADE`. 회원 탈퇴 시 행 하나 삭제로 전체 파기된다.(심사 요건 5.1.1(v) 대응).

---

## 4. 테이블(6개)

### 1. users

| 컬럼 | 타입 | 비고 |
| --- | --- | --- |
| id | uuid PK | `uuidv7()` — 시간순 정렬 |
| name | text NULL | 표시용 사용자명. 소셜 제공값, 1\~50자 |
| email | text NULL | 소셜 제공값. **UNIQUE 없음**, `ck_users_email` 로 정규화 강제 |
| created\_at / updated\_at | timestamptz | 트리거로 갱신 |

⚠️ **애플 로그인 주의**: 애플은 이메일을 **최초 인가 1회에만** 전달한다. 그때 저장하지 않으면 다시 받을 수 없다.

`email` 제약 조건 근거:

- **NULL 허용** — 애플 relay·미제공, 카카오 이메일 동의 거부 가능
- **UNIQUE 금지** — 제공자가 3종이 되면서 같은 사람이 구글과 애플로 각각 가입해 동일 이메일이 중복되는 상황이 실제로 발생한다. UNIQUE 를 걸면 두 번째 가입이 실패한다

**정규화는 DB 에서 강제한다.** 앱에만 맡기면 `lower()` 를 한 곳에서 빠뜨렸을 때 조용히 섞여 들어가고, 나중에 중복 판별이 틀어진 뒤에야 드러난다.

```sql
CONSTRAINT ck_users_email CHECK (
  email IS NULL
  OR (email = lower(btrim(email)) AND char_length(email) BETWEEN 3 AND 254)
)
```

- 소문자·앞뒤 공백·길이를 한 제약으로 처리
- 빈 문자열도 거부 — 이메일이 없으면 `NULL` 로 넣어야 한다
- 상한 254자는 실무 통용 최대 이메일 길이. 애플 relay 주소는 훨씬 짧아 영향 없음

`name` 은 **이메일보다 느슨하게** 간다. 식별·중복 판별에 쓰지 않아 대소문자·공백 차이가 문제를 일으키지 않기 때문이다.

```sql
CONSTRAINT ck_users_name CHECK (
  name IS NULL OR char_length(btrim(name)) BETWEEN 1 AND 50
)
```

- **NULL 허용** — 애플은 이름을 최초 인가 1회에만 주고, 사용자가 거부할 수도 있다
- **DB 기본값을 두지 않는다** — `DEFAULT '하루콕 사용자'` 를 두면 사용자가 직접 그 이름을 정한 것과 구분할 수 없다. 화면 기본 문구는 앱이 정한다
- 자유 텍스트이므로 **입력 경로에 HTML 제거를 반드시 적용**한다

### 2. user\_social\_accounts

| 컬럼 | 타입 | 비고 |
| --- | --- | --- |
| provider | varchar(20) | `KAKAO` / `APPLE` / `GOOGLE`. CHECK 제약 |
| provider\_user\_id | text | 카카오 회원번호, 애플 sub, 구글 sub |
| UNIQUE | (provider, provider\_user\_id) | 같은 소셜 계정의 중복 연결 차단 |
| provider\_refresh\_token\_enc | bytea NULL | 애플 refresh token 암호문. 탈퇴 시 revoke 호출용 — **애플만 사용** (5-5) |

### 3. refresh\_tokens

| 컬럼 | 타입 | 비고 |
| --- | --- | --- |
| token\_hash | bytea | **SHA-256 해시. 평문 저장 금지** |
| device\_id | text NOT NULL | 클라이언트 생성 식별자 |
| revoked\_at | timestamptz NULL | 로그아웃 시 기록(삭제 아님) |
| 부분 UNIQUE | (user\_id, device\_id) WHERE revoked\_at IS NULL | 기기당 활성 토큰 1개 |

### 4. terms / 5. user\_term\_agreements

약관은 **이용약관 1종**이다. 본문은 DB 에 넣지 않고 `content_url` 만 보관한다. `version` UNIQUE 로 개정 이력을 누적하고, 시행 중(`effective_from <= now()`)인 최신 1개가 현행 약관이다. 가입에 항상 필수라 `is_required` 는 두지 않는다 (006).

개인정보 처리방침은 DB 에 두지 않는다. 앱이 노션 공개 링크로 표시한다.

### 6. todos

| 컬럼 | 타입 | 비고 |
| --- | --- | --- |
| title | text | 최대 250자, 공백만 거부 |
| due\_date | **date** | 시각 아님. 아래 설명 참고 |
| completed\_at | timestamptz NULL | NULL = 미완료 |
| deleted\_at | timestamptz NULL | NULL = 살아있음. 소프트 삭제 (7장) |

---

## 5. 주요 설계 근거

### 5-1. `due_date` 를 `date` 로 — 가장 중요한 결정

`timestamptz` 로 저장하면 **날짜가 하루 밀린다.**

- KST 2026-11-10 00:30 → UTC 2026-11-09 15:30 → “11월 9일 할 일”로 조회됨

투두의 날짜는 시각이 아니라 **달력상의 날짜**다. `date` 로 저장하고 어느 타임존 기준인지는 클라이언트가 정해 보내면 변환 자체가 사라진다.

- 한계: 해외 체류·시차 이동 시 모호함 → MVP(국내)는 KST 고정으로 충분
- `created_at` / `completed_at` 은 실제 시각이므로 `timestamptz` 유지

### 5-2. `completed_at` vs `is_completed`

|  | boolean | completed\_at |
| --- | --- | --- |
| 완료 여부 | ✅ | ✅ (`IS NOT NULL`) |
| 완료 시각 | ❌ | ✅ |
| 통계(v1.2) 재사용 | 스키마 변경 필요 | 그대로 사용 |

→ `completed_at` 채택. 저장 비용 7바이트 차이로 정보량이 2배다.

### 5-3. ENUM 대신 `varchar + CHECK`

PostgreSQL `ENUM` 은 값 **삭제·순서 변경이 불가**하고, 같은 트랜잭션에서 추가 후 즉시 사용할 수 없다. `varchar + CHECK` 는 제약 교체만으로 변경된다. 추후 제공자(네이버 등)를 늘릴 때는 아래 두 줄이 전부다.

```sql
ALTER TABLE user_social_accounts DROP CONSTRAINT ck_social_provider;
ALTER TABLE user_social_accounts ADD  CONSTRAINT ck_social_provider
  CHECK (provider IN ('KAKAO','APPLE','GOOGLE','NAVER'));
```

### 5-4. `updated_at` 은 앱이 아니라 트리거로

PostgreSQL 에는 MySQL 의 `ON UPDATE CURRENT_TIMESTAMP` 가 없다.

|  | TypeORM `@UpdateDateColumn` | DB 트리거 |
| --- | --- | --- |
| 앱 경유 수정 | ✅ | ✅ |
| 직접 SQL·배치 수정 | ❌ 누락 | ✅ |

→ 트리거 채택. 운영 중 수동 SQL 은 반드시 발생한다.

### 5-5. 애플 refresh token 저장 — `refresh_tokens` 를 쓸 수 없는 이유

탈퇴 시 애플 `/auth/revoke` 를 호출해야 하고(App Store 심사 요건), 그 호출에는 애플이 발급한 refresh token **원문**이 필요하다. 기존 `refresh_tokens` 테이블은 재사용할 수 없다.

|  | `refresh_tokens` | 애플 refresh token |
| --- | --- | --- |
| 주인 | 하루콕 자체 세션 | 애플 측 인가 |
| 저장 형태 | `token_hash bytea` — SHA-256 **단방향** | 원문 필요 — 복호화해 호출 인자로 쓴다 |
| 수명 | `expires_at` 관리, 정리 배치 대상 | 탈퇴까지 보관 |

단방향 해시 컬럼에는 넣을 수 없다. `user_social_accounts` 에 양방향 암호화 컬럼을 둔다. 제공자별 1행이고 `(provider, provider_user_id)` UNIQUE 가 소유 관계를 이미 보장한다.

제공자 3종 중 **애플만** 저장이 필요하다.

| 제공자 | 해제 방식 | 토큰 저장 |
| --- | --- | --- |
| 애플 | 서버가 `/auth/revoke` 호출 | **필요** |
| 카카오 | 서버가 어드민 키 + 회원번호로 `unlink` | 불필요 — `provider_user_id` 로 충분 |
| 구글 | 클라이언트 SDK `disconnect()` | 불필요 |

- NULL 허용 — 카카오·구글 행은 비운다. 제공자별로 채우는 컬럼이 다른 것은 의도된 설계다
- **평문 저장 금지.** 해시가 아니라 양방향 암호화이므로 **키 관리가 곧 이 컬럼의 안전성**이다. 키는 DB 와 다른 곳에 둔다
- `users` 삭제 시 CASCADE 로 함께 지워진다 → 애플이 요구하는 "revoke 에 사용한 토큰도 삭제" 가 자동 충족된다
- ⚠️ **순서 제약** — 탈퇴 처리에서 `users` 를 먼저 지우면 CASCADE 로 이 컬럼과 `provider_user_id` 가 함께 사라져 해제할 대상을 잃는다. **해제 호출 → 삭제** 순서를 지켜야 한다
- 카카오 `unlink` 는 멱등하지 않다. 이미 끊긴 회원에 재호출하면 `code: -101` 이 떨어지므로 재시도에서 성공으로 간주한다

---

## 6. 다중 기기 3대 제한 구현

DB 트리거로 개수를 강제하지 **않는다.** 동시 로그인 레이스를 막으려면 직렬화 수준 격상이나 advisory lock 이 필요해 비용이 크다. 로그인 트랜잭션에서 사용자 행을 잠그고 처리하는 편이 단순하고 확실하다.

- **DB 보장**: 기기당 활성 토큰 1개 (`uq_refresh_tokens_user_id_device_id_active`)
- **앱 보장**: 3대 초과 시 가장 오래된 기기 자동 폐기

앞에서 막지 않고 자동 폐기를 선택한 이유: MVP 에 **기기 관리 화면이 없으므로** 로그인을 거부하면 사용자가 빠져나갈 길이 없다.

```sql
BEGIN;
-- (1) 동시 로그인 레이스 차단
SELECT id FROM users WHERE id = $user_id FOR UPDATE;

-- (2) 같은 기기의 기존 토큰 폐기
UPDATE refresh_tokens SET revoked_at = now()
 WHERE user_id = $user_id AND device_id = $device_id AND revoked_at IS NULL;

-- (3) 활성 토큰이 3개 이상이면 최신 2개만 남기고 폐기
UPDATE refresh_tokens SET revoked_at = now()
 WHERE id IN (
   SELECT id FROM refresh_tokens
    WHERE user_id = $user_id AND revoked_at IS NULL AND expires_at > now()
    ORDER BY created_at DESC, id DESC   -- 동일 시각 타이브레이커 필수
   OFFSET 2
 );

-- (4) 신규 발급 → 결과적으로 정확히 3개
INSERT INTO refresh_tokens (user_id, token_hash, device_id, expires_at)
VALUES ($user_id, $token_hash, $device_id, $expires_at);
COMMIT;
```

---

## 7. 할 일 삭제 되돌리기 — 소프트 삭제

기능 명세서의 완료 조건: “투두를 삭제 했을때 **바로** 되돌리기 버튼을 누르면 삭제가 취소됨”

추가 요구: **여러 기기 동기화 필요, 휴지통 화면은 불필요.**

### 채택 — 서버 소프트 삭제

1. 삭제 탭 → `UPDATE todos SET deleted_at = now()` — 서버에 **즉시** 반영
2. 되돌리기 → `UPDATE todos SET deleted_at = NULL`
3. 보존 기간(7일) 경과 → 정리 배치가 하드 삭제

휴지통 화면은 만들지 않는다. 되돌리기는 삭제 직후 스낵바에서만 가능하고, 7일 보존은 운영자가 문의를 받았을 때 직접 복구해 줄 수 있게 하는 여유다.

### 검토한 대안

| 방식 | DB 변경 | 판단 |
| --- | --- | --- |
| **소프트 삭제** (`deleted_at`) | 컬럼 + 전 쿼리 조건 + 부분 인덱스 + 정리 배치 | ✅ 채택 |
| 클라이언트 지연 삭제 | 없음 | 앱 강제 종료 시 DELETE 가 유실돼 **다른 기기에 삭제가 반영되지 않는다** |
| 삭제 후 재생성 (POST) | 없음 | **id 가 바뀜다.** uuidv7 정렬이라 되돌린 항목이 목록 맨 뒤로 간다 |

“여러 기기 동기화” 하나만으로는 지연 삭제도 가능하다(5초 지연될 뿐 결국 반영된다). 지연 삭제를 탈락시킨 것은 **앱이 5초 안에 강제 종료되면 DELETE 가 아예 안 가는 것**이다. 그러면 사용자는 기기 A 에서 지웠는데 모든 기기에 남아있다.

### 감수한 비용

| 항목 | 내용 |
| --- | --- |
| 스키마 | `deleted_at` 컬럼 1개 |
| 인덱스 | 홈 인덱스를 부분 인덱스로 교체 + 정리 배치용 1개 추가 |
| 쿼리 | 목록·상세·수정·완료변경 전부에 `AND deleted_at IS NULL` |
| 운영 | 일 1회 정리 배치 |

⚠️ **가장 큰 위험은 컬럼이 아니라 조건 누락이다.** 조회 한 곳에서 `deleted_at IS NULL` 을 빠뜨리면 두 가지가 동시에 깨진다.

- 삭제한 할 일이 화면에 다시 나타난다
- 부분 인덱스를 못 타고 **Seq Scan 으로 떨어진다** — 검증에서 실제로 확인했다

### 적용 내역

```sql
ALTER TABLE todos ADD COLUMN deleted_at timestamptz NULL;

-- 기존 인덱스를 살아있는 행만 담도록 교체
DROP INDEX idx_todos_user_id_due_date;
CREATE INDEX idx_todos_user_id_due_date ON todos (user_id, due_date, id)
  WHERE deleted_at IS NULL;
```

정리 배치용 인덱스도 함께 둔다. 삭제된 행만 담으므로 평소에는 거의 비어 있다.

```sql
CREATE INDEX idx_todos_deleted_at ON todos (deleted_at)
  WHERE deleted_at IS NOT NULL;
```

사용할 쿼리:

```sql
-- 삭제
UPDATE todos SET deleted_at = now()
 WHERE id = $todo_id AND user_id = $user_id AND deleted_at IS NULL;

-- 되돌리기
UPDATE todos SET deleted_at = NULL
 WHERE id = $todo_id AND user_id = $user_id AND deleted_at IS NOT NULL;

-- 정리 배치 (일 1회)
DELETE FROM todos WHERE deleted_at < now() - interval '7 days';
```

- 두 UPDATE 모두 `user_id` 를 조건에 넣어 남의 할 일을 건드리지 못하게 한다
- 되돌리기는 멱등하다 — 이미 살아있으면 0건 영향
- 논리명은 **삭제일시** (표준 문서의 `_at` → ···일시 규칙)
- 회원 탈퇴는 영향 없음 — `users` 삭제 시 CASCADE 로 삭제 표시 여부와 무관하게 전부 지워진다

---

## 8. 일부러 넣지 않은 것

기능 명세서의 “안 만들 것” 원칙을 스키마에도 적용했다.

| 미포함 | 이유 |
| --- | --- |
| `todos.sort_order` | 드래그 순서 변경이 v1 범위 밖. UUIDv7 이 시간순이라 `ORDER BY id` 로 생성순 정렬됨 |
| `todos` 휴지통 화면 | 소프트 삭제는 하되(7장) 복구 UI 는 스낵바뿐 |
| `categories` / `routines` | v1.2 |
| `app_versions` | Remote Config 로 대체 |
| `inquiries` | mailto 로 대체 |

---

## 9. 검증 결과

PostgreSQL 16 에 `uuidv7()` 만 `gen_random_uuid()` 로 치환해 실행한 결과다.

| 항목 | 결과 |
| --- | --- |
| 스키마 적용 | ✅ 전체 성공 |
| 제목 250자 / 251자 / 공백만 | ✅ 각각 성공 / 거부 / 거부 |
| KAKAO / APPLE / GOOGLE 삽입 | ✅ 3종 모두 성공 |
| 허용되지 않은 provider(NAVER) | ✅ CHECK 위반으로 거부 |
| 동일 소셜 계정 중복 연결 | ✅ UNIQUE 위반으로 거부 |
| 구글·애플 동일 이메일 2계정 | ✅ 정상 생성 (UNIQUE 미설정 확인) |
| 이메일 정상·NULL·애플 relay | ✅ 3종 모두 성공 |
| 이메일 대문자·앞뒤공백·빈문자열·256자 | ✅ 4종 모두 거부 |
| 기기당 활성 토큰 1개 | ✅ 중복 거부 |
| 4대째 로그인 → 활성 3대 유지 | ✅ 가장 오래된 기기 자동 폐기 |
| 탈퇴 CASCADE | ✅ 자식 테이블 전체 0건 |
| 인덱스 (30,150행) | ✅ 단일 날짜 = Index Scan / 월 범위 = Bitmap Index Scan |
| 롤백 스크립트 | ✅ 잔여 객체 없음 |
| 사용자명 정상·NULL·50자·대문자포함 | ✅ 4종 모두 성공 |
| 사용자명 51자·공백만·빈문자열 | ✅ 3종 모두 거부 |
| 소셜 제공자 저장·조회 | ✅ `provider` 값 정상 반환 |
| 소프트 삭제 → 목록에서 제외 | ✅ |
| 되돌리기 → 복구, 재호출 멱등 | ✅ |
| 남의 할 일 삭제 시도 | ✅ 0건 처리 |
| 정리 배치(7일 경과분) | ✅ 하드 삭제됨 |
| 부분 인덱스 사용 (2만행) | ✅ 조건 포함 시 Index Scan |
| **조건 누락 시** | ⚠️ **Seq Scan 으로 떨어짐** — 성능과 정확성이 동시에 깨짐 |
| 001 단독 vs 001+002+003+004 | ✅ 컬럼 정의·제약·인덱스 완전 일치 |

---

## 10. 다음 할 일

- [ ] `terms` 초기 데이터 INSERT — 이용약관 공개 URL 확정 후 (이용약관 1행)
- [ ] 006 마이그레이션 작성·검증 — `terms.type` · `is_required` 제거, `uq_terms_version` · `idx_terms_effective_from` 추가 및 롤백
- [ ] 출시 체크리스트의 **App Privacy · 데이터 보안 양식에 ‘이메일’ 수집 반영**
- [ ] 개인정보 처리방침에 수집 항목(이메일, 소셜 식별자) 기재
- [ ] 만료 토큰 정리 배치 등록 (주 1회, `expires_at < now() - interval '30 days'`)
- [ ] 구글 로그인 OAuth 클라이언트 ID 발급 (iOS / Android / 서버용 별도)
- [x] 제약·인덱스 명명규칙 적용 (15개 변경) — 기준은 **DB 표준 (용어사전 · 명명규칙)** 문서
- [ ] 소셜 응답의 이메일을 저장 전 `lower(btrim())` 처리 — 안 하면 `ck_users_email` 에서 INSERT 가 실패한다
- [ ] 조회 쿼리 전수에 `AND deleted_at IS NULL` 적용 — 누락 시 삭제된 할 일 노출 + Seq Scan
- [ ] 할 일 정리 배치 등록 (일 1회, `deleted_at < now() - interval '7 days'`)
- [ ] 소셜 응답에서 사용자명 추출 · HTML 제거 · 50자 절삭 후 저장
- [ ] 005 마이그레이션 작성·검증 — `provider_refresh_token_enc` 추가 및 롤백
- [ ] 애플 refresh token 암호화 모듈 확정 — 기존 `common/crypto` 로 양방향(AES-256-GCM) 가능 여부, 키 보관 위치
- [ ] 탈퇴 트랜잭션 구현 — 연동 해제 호출 후 `users` 삭제. 해제 실패해도 삭제는 진행
- [ ] DDL 페이지 재동기화 — 아래 ⚠️ 참고
- [ ] NestJS / TypeORM 엔티티 · 모듈 구조 작성
