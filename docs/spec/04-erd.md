> 노션 원본: https://app.notion.com/p/417b98b30299805aa060d68dad259931
> 원본 최종 수정: 2026-11-13T02:30:32.823Z
> 동기화: 2026-11-13 (노션 → 저장소 한 방향. 이 파일을 직접 고치지 말 것)

# 🔗 ERD (MVP v1)

`DB 설계서 (MVP v1)` 의 DDL 을 관계도로 시각화한 문서다.

- 논리명·물리명 전체 목록과 명명 규칙은 [DB 표준 (용어사전 · 명명규칙)](05-db-standard.md) 에 있다. **이 페이지에는 중복해 두지 않는다.**
- 스키마가 바뀌면 DDL · 설계서 · 표준 · 이 페이지를 함께 고친다.

---

## 논리 ERD

업무 용어 기준. 기획·디자인과 같이 볼 때 쓴다.

```mermaid
erDiagram
    "사용자" ||--o{ "소셜계정연결" : "보유"
    "사용자" ||--o{ "리프레시토큰" : "발급"
    "사용자" ||--o{ "약관동의이력" : "동의"
    "약관" ||--o{ "약관동의이력" : "동의대상"
    "사용자" ||--o{ "할일" : "소유"

    "사용자" {
        식별자 사용자ID PK
        문자열 사용자명
        문자열 이메일
        일시 생성일시
        일시 수정일시
    }

    "소셜계정연결" {
        식별자 소셜연결ID PK
        식별자 사용자ID FK
        코드 소셜제공자 UK
        문자열 소셜사용자식별자 UK
        암호문 제공자리프레시토큰암호문
        일시 생성일시
    }

    "리프레시토큰" {
        식별자 토큰ID PK
        식별자 사용자ID FK
        해시 토큰해시 UK
        문자열 기기식별자
        일시 만료일시
        일시 폐기일시
        일시 생성일시
    }

    "약관" {
        식별자 약관ID PK
        코드 약관유형 UK
        문자열 약관버전 UK
        문자열 약관명
        URL 약관본문URL
        여부 필수여부
        일시 시행일시
        일시 생성일시
    }

    "약관동의이력" {
        식별자 동의이력ID PK
        식별자 사용자ID FK
        식별자 약관ID FK
        일시 동의일시
    }

    "할일" {
        식별자 할일ID PK
        식별자 사용자ID FK
        문자열 할일제목
        일자 수행일자
        일시 완료일시
        일시 삭제일시
        일시 생성일시
        일시 수정일시
    }
```

---

## 물리 ERD

실제 스키마. 각 컬럼 설명은 `논리명 · 제약` 순서다.

```mermaid
erDiagram
    users ||--o{ user_social_accounts : "소셜 연결 (CASCADE)"
    users ||--o{ refresh_tokens : "기기 세션 (CASCADE)"
    users ||--o{ user_term_agreements : "동의 (CASCADE)"
    terms ||--o{ user_term_agreements : "동의 대상 (RESTRICT)"
    users ||--o{ todos : "소유 (CASCADE)"

    users {
        uuid id PK "사용자ID · uuidv7"
        text name "사용자명 · 소셜 제공값, 1~50자, NULL 허용"
        text email "이메일 · NULL 허용, UNIQUE 없음"
        timestamptz created_at "생성일시"
        timestamptz updated_at "수정일시"
    }

    user_social_accounts {
        uuid id PK "소셜연결ID"
        uuid user_id FK "사용자ID"
        varchar provider UK "소셜제공자 · KAKAO / APPLE / GOOGLE"
        text provider_user_id UK "소셜사용자식별자"
        bytea provider_refresh_token_enc "제공자리프레시토큰암호문 · 애플만, NULL 허용"
        timestamptz created_at "생성일시"
    }

    refresh_tokens {
        uuid id PK "토큰ID"
        uuid user_id FK "사용자ID"
        bytea token_hash UK "토큰해시 · SHA-256"
        text device_id "기기식별자 · 기기당 활성 1개"
        timestamptz expires_at "만료일시"
        timestamptz revoked_at "폐기일시 · NULL 이면 활성"
        timestamptz created_at "생성일시"
    }

    terms {
        uuid id PK "약관ID"
        varchar type UK "약관유형 · SERVICE / PRIVACY"
        varchar version UK "약관버전"
        text title "약관명"
        text content_url "약관본문URL · 외부 공개 페이지"
        boolean is_required "필수여부"
        timestamptz effective_from "시행일시"
        timestamptz created_at "생성일시"
    }

    user_term_agreements {
        uuid id PK "동의이력ID"
        uuid user_id FK "사용자ID · 약관ID 와 함께 UNIQUE"
        uuid term_id FK "약관ID · RESTRICT"
        timestamptz agreed_at "동의일시"
    }

    todos {
        uuid id PK "할일ID"
        uuid user_id FK "사용자ID"
        text title "할일제목 · 최대 250자"
        date due_date "수행일자 · 달력 날짜, 시각 아님"
        timestamptz completed_at "완료일시 · NULL 이면 미완료"
        timestamptz deleted_at "삭제일시 · NULL 이면 살아있음 (소프트 삭제)"
        timestamptz created_at "생성일시"
        timestamptz updated_at "수정일시"
    }
```

---

## 읽는 법

- `||--o{` — 1:N. 왼쪽 1개가 오른쪽 0개 이상을 가진다
- `PK` 는 기본키, `FK` 는 외래키, `UK` 는 유니크 제약
- 관계선 라벨의 `CASCADE` / `RESTRICT` 는 **부모 행 삭제 시 동작**
- `users` 는 v1 에서 **화면에 표시되는 컬럼이 하나도 없는 앵커 테이블**이다. 컬럼이 4개인 것은 정상이다
- **일자** = 달력상의 날짜(`date`), **일시** = 시각까지 포함(`timestamptz`). 유일한 `date` 컬럼이 `due_date`(수행일자)다

---

## ERD 에 표현되지 않는 제약

관계도는 테이블과 외래키만 보여준다. 아래는 도형으로 드러나지 않지만 **동작을 결정하는** 제약이다.

| 종류 | 대상 | 내용 |
| --- | --- | --- |
| 부분 UNIQUE | `refresh_tokens` | `(user_id, device_id) WHERE revoked_at IS NULL` — 폐기된 토큰은 중복 허용, 활성만 1개 |
| CHECK | `users.email` | `lower(btrim())` 일치 + 길이 3\~254 |
| CHECK | `todos.title` | 공백 제외 1\~250자 |
| CHECK | `user_social_accounts.provider` | `KAKAO` / `APPLE` / `GOOGLE` 만 허용 |
| CHECK | `terms.type` | `SERVICE` / `PRIVACY` 만 허용 |
| CHECK | `refresh_tokens` | `expires_at > created_at` |
| 트리거 | `users`, `todos` | `BEFORE UPDATE` 에 `updated_at` 자동 갱신 |
| 앱 레벨 | `refresh_tokens` | 활성 기기 **최대 3대** — DB 가 아니라 로그인 트랜잭션이 보장 |
| 부분 인덱스 | `todos` | 홈 인덱스는 `WHERE deleted_at IS NULL` — 조회에 이 조건을 빠뜨리면 **Seq Scan 으로 떨어지고 삭제된 할 일이 노출된다** |
| CHECK | `users.name` | NULL 이거나 공백 제외 1\~50자 |
| 정리 배치 | `todos` | 삭제 표시 후 7일 경과 시 하드 삭제 (설계서 7장) |
| 제공자별 | `user_social_accounts` | `provider_refresh_token_enc` 는 **애플 행만** 채운다. 카카오는 어드민 키, 구글은 클라이언트가 해제 (설계서 5-5) |
| 암호화 | `user_social_accounts` | 위 컬럼은 **양방향 암호화**다. `refresh_tokens.token_hash` 와 달라 해시가 아니고, 키는 DB 와 다른 곳에 둔다 |
| 순서 제약 | 회원 탈퇴 | `users` 삭제 **전에** 연동 해제를 호출해야 한다. 먼저 지우면 CASCADE 로 토큰과 회원번호가 사라진다 |

**기기 3대 제한 · 삭제 되돌리기 · 소셜 연동 해제는 스키마를 봐도 알 수 없다.** 세 가지 모두 동작은 앱이 결정하고 DB 는 자리만 제공한다. 구현 시 설계서 6장 · 7장 · 5-5를 반드시 확인해야 한다.

---

## 삭제 전파 경로

회원 탈퇴는 `users` 행 하나 삭제로 끝난다.

```mermaid
flowchart LR
    A["DELETE FROM users"] --> B["user_social_accounts"]
    A --> C["refresh_tokens"]
    A --> D["user_term_agreements"]
    A --> E["todos"]
    F["terms"] -. RESTRICT .-> D
```

- 실선 4개는 `ON DELETE CASCADE` — 자동 삭제
- 점선은 `ON DELETE RESTRICT` — **동의 이력이 남아있는 약관 버전은 지울 수 없다.** 약관을 고칠 때는 삭제가 아니라 새 버전 행을 추가해야 한다
- ⚠️ `DELETE FROM users` 는 **마지막 단계**다. 그 전에 애플 `/auth/revoke`(저장한 토큰 필요)와 카카오 `unlink`(어드민 키 + 회원번호)를 호출해야 한다. 순서를 바꾸면 CASCADE 로 호출 인자가 먼저 사라진다

---

## 화면 → 조회 경로

어느 테이블을 어떤 인덱스로 읽는지다.

| 화면 | 주 쿼리 | 사용 인덱스 |
| --- | --- | --- |
| 스플래시 | 토큰 해시로 유효성 확인 | `uq_refresh_tokens_token_hash` |
| 로그인 | 제공자 · 소셜 ID 로 계정 조회 | `uq_user_social_accounts_provider_user_id` |
| 홈 | `user_id` · `due_date` · `deleted_at IS NULL` 목록 | `idx_todos_user_id_due_date` (부분) |
| 할 일 작성 | PK 단건 조회·수정 | `todos_pkey` |
| 설정 → 로그인 제공자 표시 | `user_id` 로 소셜 연결 조회 | `idx_user_social_accounts_user_id` |
| 설정 → 로그아웃 | `user_id` · `device_id` 폐기 | `uq_refresh_tokens_user_id_device_id_active` |
| 설정 → 회원 탈퇴 | `user_id` 로 소셜 연결·토큰 조회 후 `users` 삭제 | `idx_user_social_accounts_user_id` · `users_pkey` |

전체 기능 중 **풀스캔이 필요한 조회가 없다.**

⚠️ 위 인덱스 이름은 **표준 문서의 명명 규칙을 적용한 최종 이름**이다. — 더 바뀔 예정이 바뀐다.
