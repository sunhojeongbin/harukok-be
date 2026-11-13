> 노션 원본: https://app.notion.com/p/417b98b3029980b29f69e2202a2f53a6
> 원본 최종 수정: 2026-11-13 (이용약관 단일화·006 반영)
> 동기화: 2026-11-13 (노션 → 저장소 한 방향. 이 파일을 직접 고치지 말 것)

# 📐 DB 표준 (용어사전 · 명명규칙)

이름에 관한 모든 결정의 기준 문서다. **새 테이블·컬럼을 만들 때는 먼저 여기서 단어를 찾아 조합한다.** 없는 단어면 사전에 먼저 등록한다.

문서 우선순위:

```javascript
DDL(.sql)  →  이 문서  →  DB 설계서  →  ERD
  원본         이름 기준      설계 근거      시각화
```

---

## 1. 표준 도메인

논리적 데이터 종류를 물리 타입에 1:1로 고정한다. **타입을 매번 고민하지 않기 위한 표다.**

| 도메인 | 물리 타입 | 논리명 접미사 | 물리명 규칙 | 비고 |
| --- | --- | --- | --- | --- |
| 식별자 | `uuid` | ···ID | `id` / `···_id` | 기본값 `uuidv7()` |
| 일시 | `timestamptz` | ···일시 | `···_at` | 시각 포함, 타임존 변환 대상 |
| 일자 | `date` | ···일자 | `···_date` | 달력 날짜, **변환하면 안 됨** |
| 여부 | `boolean` | ···여부 | `is_···` |  |
| 코드 | `varchar(20)` | — | — | 값은 CHECK 로 고정 |
| 문자열 | `text` | — | — | 길이 제한은 CHECK |
| URL | `text` | ···URL | `···_url` |  |
| 해시 | `bytea` | ···해시 | `···_hash` | 원문 저장 금지, 단방향 |
| 암호문 | `bytea` | ···암호문 | `···_enc` | **복호화 전제**의 양방향 암호화. 키는 DB 외부 보관 |

**`varchar(n)` 을 코드 외에 쓰지 않는 이유**: PostgreSQL 에서 `varchar(n)` 과 `text` 는 성능 차이가 없다. 길이 제한을 타입에 두면 바꿀 때 `ALTER TYPE` 이 필요하지만, CHECK 로 두면 제약 교체로 끝난다.

---

## 2. 표준 단어 사전

물리명은 이 표의 영문만 조합해 만든다. 임의 약어 금지.

| 한글 | 영문 | 한글 | 영문 |
| --- | --- | --- | --- |
| 사용자 | `user` | 할일 | `todo` |
| 이름/명 | `name` | 삭제 | `deleted` |
| 소셜 | `social` | 제목 | `title` |
| 계정 | `account` | 수행 | `due` |
| 제공자 | `provider` | 완료 | `completed` |
| 식별자 | `id` | 생성 | `created` |
| 이메일 | `email` | 수정 | `updated` |
| 토큰 | `token` | 만료 | `expires` |
| 리프레시 | `refresh` | 폐기 | `revoked` |
| 기기 | `device` | 시행 | `effective` |
| 해시 | `hash` | 필수 | `required` |
| 약관 | `term` | 본문 | `content` |
| 동의 | `agreement` / `agreed` | 유형 | `type` |
| 이력 | (테이블명에서 생략) | 버전 | `version` |
| 연결 | (테이블명에서 생략) | 목록/시각 | — |
| 암호문 | `enc` | — | — |

---

## 3. 명명 규칙

### 3-1. 공통

- 전부 **소문자 snake\_case**. 대문자·하이픈 금지
- 예약어 사용 금지 (`user`, `order`, `group` 등은 큰따옴표 없이 쓰면 깨진다 → 복수형 `users` 로 회피)
- 식별자 최대 **63바이트**. 넘으면 PostgreSQL 이 잘라버려 이름이 충돌할 수 있다

### 3-2. 테이블

- **복수형** — `users`, `todos`, `terms`
- 교차 테이블은 `{주체}_{대상}_{성격}` — `user_term_agreements`

### 3-3. 컬럼

| 종류 | 규칙 | 예 |
| --- | --- | --- |
| 기본키 | `id` 고정 | `users.id` |
| 외래키 | `{참조테이블 단수형}_id` | `user_id`, `term_id` |
| 일시 | `{동사과거형}_at` | `created_at`, `revoked_at` |
| 일자 | `{수식어}_date` | `due_date` |
| 불리언 | `is_{형용사}` | `is_required` |
| 소프트 삭제 | `deleted_at` 고정 (NULL = 살아있음) | `todos.deleted_at` |
| 그 외 | 단수형 명사 | `title`, `provider` |

**`_at` 과 `_date` 구분이 이 문서에서 가장 중요한 규칙이다.** 이름만 보고 타임존 변환 대상인지 판단할 수 있어야 한다. `due_date` 를 `timestamptz` 로 잡으면 날짜가 하루 밀린다.

### 3-4. 제약조건 · 인덱스 · 트리거

형식: `{접두사}_{테이블 물리명}_{컬럼명···}` — **테이블명은 줄이지 않는다.**

| 종류 | 접두사 | 예 |
| --- | --- | --- |
| 기본키 | (PostgreSQL 자동) | `users_pkey` |
| 유니크 제약 | `uq_` | `uq_terms_version` |
| 유니크 인덱스(부분) | `uq_`  • 조건 접미 | `uq_refresh_tokens_user_id_device_id_active` |
| 일반 인덱스 | `idx_` | `idx_todos_user_id_due_date` |
| CHECK | `ck_` | `ck_users_email` |
| 외래키 | (PostgreSQL 자동) | `todos_user_id_fkey` |
| 트리거 | `trg_` | `trg_todos_updated_at` |
| 함수 | `{동사}_{대상}` | `set_updated_at` |

테이블명을 줄이지 않는 이유: 에러 로그에는 제약 이름만 찍힐다. `ck_rt_expires` 를 보고 어느 테이블인지 찾으려면 스키마를 뒤져야 한다.

---

## 4. 명명규칙 적용 내역 (완료)

명명규칙을 나중에 정리하면서 기존 DDL 과 어긋나 있었고, **15개를 규칙대로 변경했다.** 현재 DDL 은 전수 규칙에 부합한다.

적용 방법은 두 가지다.

- **마이그레이션 미적용** → `20261110_001__init_schema.sql` 에 이미 새 이름이 반영되어 있다. 추가 작업 없음
- **이미 적용** → `20261110_002__rename_constraints.sql` 을 실행한다. 데이터 변경 없이 이름만 바꾼다

| 이전 이름 | 현재 이름 | 변경 사유 |
| --- | --- | --- |
| `ck_users_email` | 동일 | ✅ 변경 없음 |
| `ck_terms_type` | 동일 | ✅ 변경 없음 |
| `trg_users_updated_at` | 동일 | ✅ 변경 없음 |
| `trg_todos_updated_at` | 동일 | ✅ 변경 없음 |
| `ck_social_provider` | `ck_user_social_accounts_provider` | 테이블명 축약 |
| `ck_todo_title` | `ck_todos_title` | 단수형 사용 |
| `ck_rt_device_len` | `ck_refresh_tokens_device_id` | 임의 약어 `rt` |
| `ck_rt_expires` | `ck_refresh_tokens_expires_at` | 약어 + 컬럼명 축약 |
| `uq_social_identity` | `uq_user_social_accounts_provider_user_id` | 컬럼명이 아닌 의미명 |
| `uq_rt_hash` | `uq_refresh_tokens_token_hash` | 약어 |
| `uq_rt_active_device` | `uq_refresh_tokens_user_id_device_id_active` | 약어 |
| `uq_terms_version` | `uq_terms_type_version` | 컬럼 `type` 누락 |
| `uq_user_term` | `uq_user_term_agreements_user_id_term_id` | 테이블명 축약 |
| `idx_social_user` | `idx_user_social_accounts_user_id` | 축약 |
| `idx_rt_user_active` | `idx_refresh_tokens_user_id_active` | 약어 |
| `idx_rt_expires` | `idx_refresh_tokens_expires_at` | 약어 |
| `idx_terms_effective` | `idx_terms_type_effective_from` | 축약 |
| `idx_agreement_user` | `idx_user_term_agreements_user_id` | 축약 |
| `idx_todos_user_date` | `idx_todos_user_id_due_date` | 컬럼명 축약 |

가장 긴 이름이 `uq_refresh_tokens_user_id_device_id_active` 42자라 63바이트 제한 안에 들어간다.

이후 변경 (006, 2026-11-13): 이용약관 단일화로 `terms.type` 이 없어져 `ck_terms_type` 을 제거하고, `uq_terms_type_version` → `uq_terms_version`, `idx_terms_type_effective_from` → `idx_terms_effective_from` 으로 바뀌었다. 위 표는 002 당시 기록이다.

### 검증 결과

두 경로가 동일한 결과를 내는지 실제 DB 에서 대조했다.

| 검증 | 결과 |
| --- | --- |
| 경로 A — 새 001 단독 적용 | ✅ |
| 경로 B — 기존 001 + 002 rename | ✅ |
| A · B 의 제약·인덱스·트리거 이름 29개 | ✅ 완전 일치 |
| 구 이름 잔존 | ✅ 0건 |
| 002 롤백 → 재적용 | ✅ 양방향 동작 |

---

## 5. 표준 용어 사전

### 테이블

| 논리명 | 물리명 | 설명 |
| --- | --- | --- |
| 사용자 | `users` | 서비스 가입 계정. 소셜 로그인으로만 생성 |
| 소셜계정연결 | `user_social_accounts` | 제공자별 외부 계정 매핑 |
| 리프레시토큰 | `refresh_tokens` | 기기별 로그인 세션 |
| 약관 | `terms` | 이용약관 버전 (개인정보 처리방침은 DB 에 두지 않음) |
| 약관동의이력 | `user_term_agreements` | 사용자별 동의 기록 |
| 할일 | `todos` | 날짜별 할 일 |

### 사용자 (users)

| 논리명 | 물리명 | 도메인 | NULL | 키 |
| --- | --- | --- | --- | --- |
| 사용자ID | `id` | 식별자 | N | PK |
| 사용자명 | `name` | 문자열 | Y |  |
| 이메일 | `email` | 문자열 | Y |  |
| 생성일시 | `created_at` | 일시 | N |  |
| 수정일시 | `updated_at` | 일시 | N |  |

### 소셜계정연결 (user\_social\_accounts)

| 논리명 | 물리명 | 도메인 | NULL | 키 |
| --- | --- | --- | --- | --- |
| 소셜연결ID | `id` | 식별자 | N | PK |
| 사용자ID | `user_id` | 식별자 | N | FK |
| 소셜제공자 | `provider` | 코드 | N | UK |
| 소셜사용자식별자 | `provider_user_id` | 문자열 | N | UK |
| 제공자리프레시토큰암호문 | `provider_refresh_token_enc` | 암호문 | Y |  |
| 생성일시 | `created_at` | 일시 | N |  |

**제공자리프레시토큰암호문**은 탈퇴 시 연동 해제 호출에 사용하고 `APPLE` 행만 채운다. 카카오는 어드민 키 + 회원번호로, 구글은 클라이언트 SDK 로 해제하므로 토큰 저장이 필요 없다. `ck_user_social_accounts_provider_refresh_token_enc` 로 DB 에서 강제한다 (설계서 5-5).

`해시` 와 `암호문` 은 둘 다 `bytea` 지만 성질이 반대다. `token_hash` 는 단방향이라 원문을 붐 수 없어야 하고, `provider_refresh_token_enc` 는 revoke 호출 인자로 쓰려고 일부러 복호화한다. 이름으로 구분되어야 하므로 접미사를 섞지 않는다.

### 리프레시토큰 (refresh\_tokens)

| 논리명 | 물리명 | 도메인 | NULL | 키 |
| --- | --- | --- | --- | --- |
| 토큰ID | `id` | 식별자 | N | PK |
| 사용자ID | `user_id` | 식별자 | N | FK |
| 토큰해시 | `token_hash` | 해시 | N | UK |
| 기기식별자 | `device_id` | 문자열 | N | 부분 UK |
| 만료일시 | `expires_at` | 일시 | N |  |
| 폐기일시 | `revoked_at` | 일시 | Y |  |
| 생성일시 | `created_at` | 일시 | N |  |

### 약관 (terms)

| 논리명 | 물리명 | 도메인 | NULL | 키 |
| --- | --- | --- | --- | --- |
| 약관ID | `id` | 식별자 | N | PK |
| 약관버전 | `version` | 문자열 | N | UK |
| 약관명 | `title` | 문자열 | N |  |
| 약관본문URL | `content_url` | URL | N |  |
| 시행일시 | `effective_from` | 일시 | N |  |
| 생성일시 | `created_at` | 일시 | N |  |

### 약관동의이력 (user\_term\_agreements)

| 논리명 | 물리명 | 도메인 | NULL | 키 |
| --- | --- | --- | --- | --- |
| 동의이력ID | `id` | 식별자 | N | PK |
| 사용자ID | `user_id` | 식별자 | N | FK, UK |
| 약관ID | `term_id` | 식별자 | N | FK, UK |
| 동의일시 | `agreed_at` | 일시 | N |  |

### 할일 (todos)

| 논리명 | 물리명 | 도메인 | NULL | 키 |
| --- | --- | --- | --- | --- |
| 할일ID | `id` | 식별자 | N | PK |
| 사용자ID | `user_id` | 식별자 | N | FK |
| 할일제목 | `title` | 문자열 | N |  |
| 수행일자 | `due_date` | 일자 | N |  |
| 완료일시 | `completed_at` | 일시 | Y |  |
| 삭제일시 | `deleted_at` | 일시 | Y |  |
| 생성일시 | `created_at` | 일시 | N |  |
| 수정일시 | `updated_at` | 일시 | N |  |

---

## 6. 논리명 중복 정리 내역

처음 작성한 ERD 에서 `created_at` 을 테이블마다 다르게 불렀다. 표준은 **같은 물리명에 같은 논리명**이므로 통일했다.

| 테이블 | 이전 논리명 | 통일 |
| --- | --- | --- |
| `user_social_accounts` | 연결일시 | 생성일시 |
| `refresh_tokens` | 발급일시 | 생성일시 |
| `terms` | 등록일시 | 생성일시 |

업무적으로는 “발급일시”가 읽히지만, 같은 컬럼이 문서마다 다른 이름으로 나오면 검색도 대조도 안 된다. 업무적 뉘앙스는 설명 컬럼에 적는다.
