> 노션 원본: https://app.notion.com/p/417b98b30299801ab97fe1ec4570db74
> 원본 최종 수정: 2026-11-13T02:30:43.060Z
> 동기화: 2026-11-13 (노션 → 저장소 한 방향. 이 파일을 직접 고치지 말 것)

# 🔌 API 설계서 (MVP v1)

**엔드포인트 12개** (인증·계정 6 / 할 일 6)

- 기준 문서: [MVP v1 기능 명세서 (재정의)](00-feature-spec.md) · [DB 설계서 (MVP v1)](02-db-design.md)
- 스택: NestJS + TypeORM / PostgreSQL 18
- 기능 명세서 25행 중 **BE 포함은 14행**. 나머지 11행은 FE 전용(WebView · Remote Config · mailto · 빈 상태 · 네트워크 오류)이라 API가 없다
- 기능 명세서가 바뀌면 이 문서와 DDL·DB 설계서를 함께 고친다

---

## 1. 설계 내역

| # | 항목 | 결정 | 근거 |
| --- | --- | --- | --- |
| 1 | 소셜 로그인 엔드포인트 | 3종 통합 1개 | 3대 제한·약관 동의·토큰 발급 로직이 완전히 동일. 분리하면 같은 유스케이스가 3벌 |
| 2 | 약관 동의 흐름 | 선(先)동의 — 로그인 요청에 포함 | 애플 `authorizationCode`의 5분 유효기간이 약관 체류 시간의 상한이 되면 안 된다 (5-2) |
| 3 | 자동 로그인 판정 | 전용 API 없음 — 토큰 재발급 재사용 | 스플래시에서 재발급 성공 = 유효 세션 |
| 4 | 다중 기기 3대 제한 | 전용 API 없음 — 로그인 트랜잭션 내부 | DB 설계서 6장 쿼리를 로그인 유스케이스에 그대로 구현 |
| 5 | 할 일 단건 조회 | 만들지 않음 | 작성 화면은 목록에서 넘어온 데이터로 채운다 |
| 6 | 완료 상태 변경 | `PATCH .../completion`  • boolean | 체크/해제를 분리하면 엔드포인트 2개. 멱등 확보 (5-3) |
| 7 | 삭제 되돌리기 | `POST .../restore` | 소프트 삭제 복구는 삭제의 역연산. `DELETE` 재호출로는 표현 불가 (5-4) |
| 8 | 목록 조회 범위 | 단일 날짜 `?date=` | 서비스 정의 "날짜 하나, 목록 하나". 범위 조회는 v1.1 (5-5) |
| 9 | 애플 토큰 검증 | `identityToken` 검증 + `authorizationCode` 교환 **둘 다** | 탈퇴 시 `/auth/revoke`가 refresh token을 요구한다. Apple TN3194 권장 흐름 (5-6) |
| 10 | 소셜 연동 해제 | 애플 서버 revoke · 카카오 서버 unlink(어드밌 키) · 구글 클라이언트 disconnect | 토큰을 저장해야 하는 것은 애플뿐이다 (5-6) |

---

## 2. 기능 명세서 → API 매핑

### BE 포함 14행

| 화면 | 기능명 | API |
| --- | --- | --- |
| 로그인 | 카카오 / 애플 / 구글 로그인 | `POST /auth/social/login` |
| 로그인 | 약관 동의 | `GET /terms`  • 위 요청의 `agreements` |
| 로그인 | 토큰 재발급 | `POST /auth/token/refresh` |
| 로그인 | 다중 로그인 (최대 3대) | 전용 API 없음 — 로그인 트랜잭션 |
| 스플래시 | 자동 로그인 판정 | `POST /auth/token/refresh` |
| 홈 | 할 일 목록 조회 | `GET /todos?date=` |
| 홈 | 완료 상태 변경 | `PATCH /todos/{todoId}/completion` |
| 할 일 작성 | 할 일 등록 | `POST /todos` |
| 할 일 작성 | 할 일 수정 | `PATCH /todos/{todoId}` |
| 할 일 작성 | 할 일 삭제 | `DELETE /todos/{todoId}` |
| 할 일 작성 | 할 일 삭제 되돌리기 | `POST /todos/{todoId}/restore` |
| 할 일 작성 | 입력 검증 | 전용 API 없음 — DTO + DB CHECK |
| 설정 | 로그아웃 | `POST /auth/logout` |
| 설정 | 회원 탈퇴 | `DELETE /users/me` |
| 설정 | 로그인 제공자 표시 | `GET /users/me` |

### API 없는 11행

| 기능명 | 대체 수단 |
| --- | --- |
| 강제 업데이트 체크 | Firebase Remote Config |
| 이용약관 / 개인정보 처리방침 조회 | 외부 공개 페이지 WebView |
| 오픈소스 라이선스 조회 | 라이브러리 자동 생성 |
| 문의하기 | `mailto:` 또는 구글 폼 |
| 앱 버전 표시 | 앱 로컬 값 |
| 빈 상태 화면 / 네트워크 오류 처리 | FE 구현 |

---

## 3. 엔드포인트 목록 (12개)

### 3-1. 인증 · 계정 (6개)

| # | Method | Path | 인증 | 설명 |
| --- | --- | --- | --- | --- |
| 1 | POST | `/auth/social/login` | 없음 | 소셜 가입·로그인 + 약관 동의 + 기기 등록 |
| 2 | POST | `/auth/token/refresh` | 없음 (refreshToken) | 액세스 토큰 재발급 + 로테이션 |
| 3 | POST | `/auth/logout` | Bearer | 현재 기기 refresh 토큰 폐기 |
| 4 | GET | `/users/me` | Bearer | 사용자명 · 로그인 제공자 조회 |
| 5 | DELETE | `/users/me` | Bearer | 회원 탈퇴 (CASCADE 전체 파기) |
| 6 | GET | `/terms` | 없음 | 현행 약관 목록 (id · version · contentUrl) |

### 3-2. 할 일 (6개)

| # | Method | Path | 인증 | 설명 |
| --- | --- | --- | --- | --- |
| 7 | GET | `/todos?date=YYYY-MM-DD` | Bearer | 날짜별 목록 (완료/미완료 포함) |
| 8 | POST | `/todos` | Bearer | 등록 |
| 9 | PATCH | `/todos/{todoId}` | Bearer | 제목 · 날짜 수정 |
| 10 | PATCH | `/todos/{todoId}/completion` | Bearer | 완료 상태 변경 |
| 11 | DELETE | `/todos/{todoId}` | Bearer | 소프트 삭제 |
| 12 | POST | `/todos/{todoId}/restore` | Bearer | 삭제 되돌리기 |

`/terms`를 둔 이유: 약관 **본문**은 WebView(서버 개발 없음)지만, 동의 이력에 저장할 `terms.id`와 `version`은 서버가 알려줘야 한다. 앱에 하드코딩하면 약관 개정 시 앱 업데이트 없이는 반영되지 않는다. DB 설계서가 `(type, version)` UNIQUE로 개정 이력을 누적하도록 잡아둔 것과 짝이 맞는다.

---

## 4. 상세 명세

표기: 요청 본문은 JSON, `?`는 선택 필드.

### 1. POST `/auth/social/login`

- 요청: `{ provider: 'KAKAO'|'APPLE'|'GOOGLE', idToken, authorizationCode?, deviceId, agreements?: [{ termId, version }] }`
  - `authorizationCode`는 **애플에서만 필수**. 구글·카카오는 보내지 않는다
- 응답 200: `{ accessToken, refreshToken, isNewUser, user: { id, name, providers } }`
- 처리 순서
  1. `idToken` 검증 → 제공자 식별자(`provider_user_id`) 추출
  2. `user_social_accounts` 조회 → 없으면 신규. 신규인데 필수 약관 동의 누락이면 거부
  3. **애플만** — `authorizationCode`를 `/auth/token`으로 교환해 refresh token 확보 → 암호화 후 `user_social_accounts.provider_refresh_token_enc`에 저장 (5-6)
  4. 소셜 응답의 이메일 `lower(btrim())`, 이름 HTML 제거 후 50자 절삭하여 저장
  5. 약관 동의 이력 기록 (`user_term_agreements`)
  6. 기기 토큰 트랜잭션 (DB 설계서 6장) → 3대 초과 시 가장 오래된 기기 자동 폐기
- 에러: `SOCIAL_TOKEN_INVALID`(401) · `TERMS_AGREEMENT_REQUIRED`(400) · `VALIDATION_FAILED`(400)
- ⚠️ 애플은 이메일과 이름을 **최초 인가 1회에만** 전달한다. 2번에서 신규 판정이 나면 그 자리에서 저장해야 한다
- ⚠️ `authorizationCode`는 **5분 만료 · 단일 사용**이다. 받아서 보관하는 값이 아니라 이 요청 안에서 즉시 교환해야 한다
- ⚠️ 3번 교환이 실패해도 **로그인은 진행한다.** 가입 첫 화면을 서버 설정 문제로 막지 않는다. 대신 `provider_refresh_token_enc`가 NULL로 남아 그 사용자는 탈퇴 시 수동 revoke 경로로 떨어지므로, 실패는 반드시 에러 로그·알림 대상으로 둔다

### 2. POST `/auth/token/refresh`

- 요청: `{ refreshToken, deviceId }`
- 응답 200: `{ accessToken, refreshToken }`
- 로테이션: 기존 토큰 `revoked_at` 기록 후 신규 발급. 재사용 감지 시 해당 기기 세션 폐기
- 에러: `REFRESH_TOKEN_INVALID` · `REFRESH_TOKEN_REVOKED` · `REFRESH_TOKEN_EXPIRED` (모두 401)
- 스플래시는 이 호출 하나로 자동 로그인을 판정한다. 성공 → 홈, 401 → 로그인 화면

### 3. POST `/auth/logout`

- 요청: `{ refreshToken }` + `Authorization: Bearer`
- 응답 204
- `refresh_tokens.revoked_at = now()` — **행 삭제 아님**
- 멱등. 이미 폐기된 토큰도 204

### 4. GET `/users/me`

- 응답 200: `{ id, name, email, providers: ['KAKAO'], createdAt }`
- 설정 화면의 "로그인 제공자 표시" 행이 이 응답을 쓴다
- `name`·`email`은 NULL일 수 있다 (애플 relay·미제공, 카카오 동의 거부). 화면 기본 문구는 앱이 정한다

### 5. DELETE `/users/me`

- 응답 204
- 처리 순서 — **순서를 뒤집으면 안 된다**
  1. `user_social_accounts`에서 연결된 제공자 목록 조회
  2. 제공자별 연동 해제 (아래 표)
  3. `users` 1행 삭제 → `ON DELETE CASCADE`로 소셜 계정·약관 동의·토큰·할 일 전부 파기
- 2·3의 순서가 중요하다 — `users`를 먼저 지우면 CASCADE로 애플 토큰과 `provider_user_id`가 함께 사라져 해제할 대상을 잃는다

| 제공자 | 해제 주잴 | 호출 | 필요한 값 |
| --- | --- | --- | --- |
| 애플 | 서버 | `POST /auth/revoke` | 저장해 둔 refresh token (복호화) |
| 카카오 | 서버 | `POST /v1/user/unlink` | 어드밌 키 + `provider_user_id` |
| 구글 | **클라이언트** | SDK `disconnect()` | 없음 — 앱이 탈퇴 호출 전에 수행 |

- **해제 실패가 탈퇴를 막아서는 안 된다.** 토큰이 없어도 탈퇴 요청은 이행해야 한다는 것이 Apple 문서의 명시적 요구다. 네트워크 오류나 이미 무효화된 토큰 때문에 탈퇴가 실패하면 그 자체가 심사 요건 위반이 된다. 실패는 로깅하고 3번을 진행한다
- ⚠️ 카카오 `unlink`는 **멱등하지 않다.** 이밌 끊진 회원에게 재호출하면 `NotRegisteredUserException`(`code: -101`)이 떨어진다. 재시도 로직에서 **-101은 성공으로 간주**해야 한다
- ⚠️ 구글은 클라이언트가 해제하므로 서버가 성공 여부를 알 수 없다. 앱은 `disconnect()` 결과와 무관하게 탈퇴 API를 호출한다
- 심사 요건 5.1.1(v) 대응. 설정에서 2탭 이내 도달은 FE 책임

### 6. GET `/terms`

- 인증 없음 (Public)
- 응답 200: `[{ id, type: 'SERVICE'|'PRIVACY', version, required, contentUrl }]`
- 현행 버전만 반환 (`(type, version)` 중 최신). 과거 버전은 동의 이력 보존용으로만 존재

### 7. GET `/todos?date=YYYY-MM-DD`

- 응답 200: `[{ id, title, dueDate, completedAt, createdAt }]`
- 정렬 `ORDER BY id` — uuidv7이 시간순이라 생성순이 된다 (`sort_order` 컬럼 없음)
- 조건 `user_id = $userId AND due_date = $date AND deleted_at IS NULL`
- `completedAt`이 NULL이면 미완료. 완료/미완료 분리 응답을 만들지 않고 FE가 나눈다

### 8. POST `/todos`

- 요청: `{ title, dueDate }`
- 응답 201: `{ id, title, dueDate, completedAt: null, createdAt }`
- `dueDate`는 `YYYY-MM-DD` **날짜 문자열**. 시각·타임존 포함 문자열은 거부 (5-5)

### 9. PATCH `/todos/{todoId}`

- 요청: `{ title?, dueDate? }` — 둘 다 없으면 400
- 응답 200: 수정된 할 일
- 에러: `TODO_NOT_FOUND`(404) — 타인 소유·소프트 삭제된 건도 동일하게 404 (존재 여부 노출 금지)

### 10. PATCH `/todos/{todoId}/completion`

- 요청: `{ completed: boolean }`
- 응답 200: `{ id, completedAt }`
- `true` → `completed_at = now()`, `false` → `NULL`
- 멱등. 같은 값을 다시 보내도 200 (체크 연타·오프라인 재전송 대비)

### 11. DELETE `/todos/{todoId}`

- 응답 204
- `UPDATE todos SET deleted_at = now() WHERE id = $todoId AND user_id = $userId AND deleted_at IS NULL`
- 하드 삭제는 정리 배치(7일 경과)만 수행

### 12. POST `/todos/{todoId}/restore`

- 응답 200: 복구된 할 일
- `UPDATE todos SET deleted_at = NULL WHERE id = $todoId AND user_id = $userId AND deleted_at IS NOT NULL`
- 멱등 — 이미 살아있으면 0건 영향, 그대로 200
- 7일 보존 기간이 지나 하드 삭제된 뒤에는 404

---

## 5. 주요 설계 근거

### 5-1. 소셜 로그인 3종을 엔드포인트 1개로

제공자별로 다른 것은 **토큰 검증 방식 하나뿐**이다. 가입 처리, 약관 동의 기록, 3대 제한 트랜잭션, 토큰 발급은 완전히 같다.

| 방식 | 유스케이스 수 | 판단 |
| --- | --- | --- |
| 통합 `POST /auth/social/login` | 1개 + provider별 검증 전략 3개 | ✅ 채택 |
| 분리 `POST /auth/kakao` 등 | 3개 (중복) | Swagger 가독성은 좋지만 3대 제한 로직이 3벌이 된다 |

제공자 추가(네이버 등)는 전략 클래스 1개 + `CHECK` 제약 교체로 끝난다. DB 설계서 5-3이 ENUM 대신 `varchar + CHECK`를 택한 것과 같은 이유다.

### 5-2. 약관 동의는 선(先)동의 — 애플 때문이다 ⚠️

"최초 가입 시 필수 약관 동의 없이는 진행 불가"를 구현하는 두 방식.

| 방식 | 흐름 | 판단 |
| --- | --- | --- |
| **A. 선동의** | 소셜 인증 전 약관 바텀시트 → 동의값 포함 **1회** 호출 | ✅ 채택 |
| B. 428 재호출 | 로그인 → 신규+동의누락이면 거부 → 약관 화면 → **같은 소셜 토큰으로 재호출** | 약관 읽는 시간이 애플 코드의 5분 창 안에 들어와야 한다 |

B가 더 자연스러운 UX다. 기존 사용자는 약관 화면을 아예 보지 않는다. 1차 호출에서 `identityToken`만 검증하고 `authorizationCode`는 손대지 않은 채 거부하면, 2차 호출에서 교환할 수도 있다.

문제는 **5분이 약관 화면 체류 시간의 상한이 된다**는 점이다. 약관과 개인정보 처리방침을 WebView로 띄우는 구조이고, 사용자가 둘 다 열어보면 5분은 넘길 수 있는 시간이다. 넘기면 `invalid_grant`로 로그인이 실패하고 애플 인증부터 다시 해야 한다. 가입 첫 화면에서 가장 겪기 싫은 실패다.

→ **A 확정.** 5분을 UX 예산으로 쓰지 않는다. 기존 사용자에게 약관 화면이 반복 노출되는 문제는 **앱이 최초 설치 시에만 표시**하도록 로컬 플래그로 처리한다. 서버는 `agreements`가 와도 기존 사용자면 기록을 건너뛴다.

### 5-3. 완료 상태 변경을 boolean 1개로

| 방식 | 엔드포인트 | 판단 |
| --- | --- | --- |
| `PATCH /completion`  • `{ completed }` | 1개 | ✅ 채택. 멱등 |
| `POST /complete`  • `DELETE /complete` | 2개 | 체크박스 하나에 엔드포인트 2개 |
| `PATCH /todos/{id}`에 `completedAt` 포함 | 0개 | 앱이 시각을 보내게 되면 기기 시계를 신뢰하게 된다 |

완료 시각은 **서버가 `now()`로 찍는다**. 홈 화면의 체크 연타나 오프라인 재전송에도 결과가 같아야 하므로 멱등이 중요하다.

### 5-4. 되돌리기를 `POST /restore`로

`DELETE`를 한 번 더 호출해 토글하는 방식은 쓰지 않는다. 같은 메서드가 삭제와 복구를 번갈아 수행하면 **재전송 한 번에 의미가 뒤집힌다** — 네트워크 재시도가 그대로 사고가 된다.

DB 설계서 7장이 "삭제 후 재생성(POST)"을 탈락시킨 이유도 이어진다. 재생성은 `id`가 바뀌어 uuidv7 정렬상 되돌린 항목이 목록 맨 뒤로 간다. `restore`는 같은 행의 `deleted_at`만 되돌리므로 위치가 유지된다.

### 5-5. 목록 조회는 단일 날짜, `dueDate`는 날짜 문자열

- 서비스 정의가 "날짜 하나, 목록 하나"다. 범위 조회는 v1 범위 밖
- 스키마는 이미 준비돼 있다 — DB 설계서 검증에서 월 범위가 Bitmap Index Scan으로 확인됐다. 날짜 좌우 이동 프리페치가 필요해지면 `?from=&to=`를 추가하면 된다
- 요청·응답 모두 `YYYY-MM-DD`. ISO 8601 전체 형식(`2026-11-12T00:00:00+09:00`)을 받으면 안 된다. 받는 순간 타임존 변환 여지가 생기고, DB 설계서 5-1이 `date` 타입으로 막아둔 "날짜 하루 밀림"이 API 경계에서 되살아난다

### 5-6. 소셜 연동 해제 — 제공자별로 방식이 다르다

탈퇴 시 우리 DB만 지우면 제공자 쪽 인가 상태가 남는다. 사용자의 애플 ID 설정, 카카오 '연결된 서비스 관리', 구글 '타사 앱' 목록에 하루콕이 계속 보인다. 세 제공자 모두 해제하되, **토큰을 저장해야 하는 곳은 애플뿐**이다.

| 제공자 | 해제 필요성 | 주체 | 호출 | 토큰 저장 |
| --- | --- | --- | --- | --- |
| 애플 | **필수** — App Store 심사 요건 | 서버 | `/auth/revoke` | **필요** |
| 카카오 | 권장 — 연결 목록 정리 · 재가입 동의 초기화 | 서버 | `/v1/user/unlink` (어드민 키) | 불필요 |
| 구글 | 선택 — 심사 강제 아님 | 클라이언트 | SDK `disconnect()` | 불필요 |

#### 애플 — `identityToken`과 `authorizationCode`를 둘 다 쓴다

양자택일이 아니다. 쓰임이 다르다.

| 값 | 쓰임 | 수명 |
| --- | --- | --- |
| `identityToken` | 인증 — 누구인지 검증 | 짧다. 검증 즉시 버린다 |
| `authorizationCode` | `/auth/token` 교환 → refresh token 확보 | **5분 · 단일 사용** |

Apple 기술문서 TN3194가 신규 가입 흐름을 이렇게 규정한다. identity token과 authorization code를 함께 서버로 전송하고, identity token을 검증하면서 authorization code를 `/auth/token`으로 검증하고, 받은 토큰 응답을 안전하게 저장한 뒤, 이후 revoke 요청을 위해 access token을 확보한다.

이유는 revoke 엔드포인트의 제약이다. `/auth/revoke`는 사용자 개입 없이 토큰을 무효화할 수 있는 유일한 수단이고, 호출에 **유효한 refresh token 또는 access token이 필수**다.

> ⚠️ `identityToken`만 검증하고 코드를 버리면 탈퇴 시 revoke할 토큰이 없다. 그러면 TN3194의 수동 경로로 떨어지고, 사용자가 애플 설정에서 직접 연결을 해제하지 않으면 애플 측 인가 상태가 남는다. 다음 로그인 때 최초 인가 화면이 뜨지 않아 **이름과 이메일을 다시 받을 수 없다.** 하루콕은 `users.name`과 `users.email`을 소셜 제공값으로만 채우므로 재가입 경로가 그대로 깨진다.

#### 스키마 영향 — 마이그레이션 005는 애플 전용

현재 테이블 6개에는 애플 refresh token을 넣을 자리가 없다. 기존 `refresh_tokens` 테이블은 재사용할 수 없다.

|  | `refresh_tokens` (기존) | 애플 refresh token |
| --- | --- | --- |
| 용도 | 하루콕 자체 세션 | 애플 측 인가 |
| 저장 형태 | `token_hash bytea` — SHA-256 단방향 | **원문 필요** (revoke 호출 인자) |
| 수명 | `expires_at` 관리 | 장수명. 탈퇴까지 보관 |

단방향 해시 컬럼에는 넣을 수 없으므로 `user_social_accounts`에 양방향 암호화 컬럼을 추가한다.

```sql
ALTER TABLE user_social_accounts
  ADD COLUMN provider_refresh_token_enc bytea NULL;

COMMENT ON COLUMN user_social_accounts.provider_refresh_token_enc
  IS '제공자리프레시토큰암호문 — 탈퇴 시 revoke 호출용. 애플만 사용';
```

- `user_social_accounts`에 두는 이유 — 제공자별 1행이고 `(provider, provider_user_id)` UNIQUE가 이미 소유 관계를 보장한다
- **NULL 허용, 애플만 채운다.** 카카오는 어드민 키로, 구글은 클라이언트로 해제하므로 이 컬럼을 쓰지 않는다
- **평문 저장 금지.** AES-256-GCM + 환경변수 키 (기존 `common/crypto` 재사용 가능 여부 확인)
- `users` 삭제 시 CASCADE로 함께 지워진다 — TN3194이 요구하는 "revoke에 사용한 토큰도 삭제"가 자동 충족된다

#### 애플 `client_secret` 처리

`/auth/token`과 `/auth/revoke`는 모두 ES256으로 서명한 `client_secret` JWT를 요구한다.

- **요청할 때마다 생성하고 캐시하지 않는다.** JWT 최대 수명이 6개월이라 캐시하면 만료 갱신이 운영 항목이 된다. 매번 서명하면 `.p8` 키 자체는 만료가 없으니 관리 대상이 사라진다
- `exp`는 5분 내외로 짧게 잡는다
- 필요한 시크릿: `.p8` private key · Key ID · Team ID · `client_id`
- ⚠️ `client_id`는 **네이티브 앱의 번들 ID**다. Service ID는 웹 전용이며, 여기에 넣으면 `invalid_client`가 난다

#### 카카오 — 어드민 키로 서버에서 끊는다

```javascript
POST https://kapi.kakao.com/v1/user/unlink
Authorization: KakaoAK ${ADMIN_KEY}
Content-Type: application/x-www-form-urlencoded

target_id_type=user_id&target_id={provider_user_id}
```

- 사용자 토큰이 필요 없다. 저장해 둔 카카오 회원번호(`user_social_accounts.provider_user_id`)만 있으면 토큰 만료와 무관하게 언제든 끊을 수 있다 → **005에 카카오 토큰 컬럼을 두지 않는 근거**
- 호출 주체는 서버든 클라이언트든 되지만, 보통 탈퇴 서버 처리 완료 시점에 unlink를 함께 호출한다
- ⚠️ **멱등하지 않다.** 이미 끊긴 회원에게 재호출하면 `code: -101`(`NotRegisteredUserException`)이 떨어진다. 재시도 로직에서 -101은 성공으로 간주한다
- 서버가 호출한 unlink에는 연결 해제 웹훅이 오지 않는다. 웹훅은 사용자가 카카오 계정 페이지에서 직접 해제하거나 계정을 탈퇴한 경우에만 전달된다 → MVP에서 웹훅 수신 엔드포인트를 만들지 않는 근거 (7장)
- ⚠️ 어드민 키 인증이 **REST API 테스트 도구**에서 제거된다는 카카오 공지가 있고 그 목록에 `/v1/user/unlink`가 포함된다. API 자체의 어드민 키 지원 중단이 아니라 테스트 도구 한정 변경으로 읽히지만, 구현 전 최신 공지를 한 번 확인한다

#### 구글 — 클라이언트가 끊는다

- 서버에서 `https://oauth2.googleapis.com/revoke`를 호출하려면 구글 access token 또는 refresh token이 필요하다. 우리는 `idToken`만 검증하고 버리므로 그 토큰이 없다
- 서버 해제를 하려면 구글 토큰도 저장해야 하는데, 심사 강제도 아닌 항목에 암호화 컬럼을 하나 더 늘리는 것은 과하다
- 따라서 **앱이 탈퇴 플로우에서 SDK `disconnect()`를 호출**하고, 서버는 DB 삭제만 담당한다. 구글 문서도 구글로 로그인한 사용자에게 연결 해제 수단을 제공하고 계정 삭제 시 구글에서 받은 정보를 함께 삭제하라고 안내한다
- ⚠️ 웹용 `google.accounts.id.revoke`는 ID 토큰 공유 동의만 취소하며 OAuth 권한 범위에는 적용되지 않는다. 네이티브 앱에는 SDK `disconnect()`를 쓴다

---

## 6. 공통 규약

### 6-1. 인증

| 항목 | 값 |
| --- | --- |
| 액세스 토큰 | `Authorization: Bearer <accessToken>` |
| 리프레시 토큰 | 요청 본문 (헤더 아님) |
| `deviceId` 필수 | 로그인 · 토큰 재발급 · 로그아웃 **3곳 모두** |

`deviceId`가 3곳 모두 필요한 이유: 기기당 활성 토큰 1개가 부분 UNIQUE(`uq_refresh_tokens_user_id_device_id_active`)로 걸려 있어, 어느 기기의 세션인지 특정하지 못하면 폐기 대상을 고를 수 없다.

### 6-2. 입력 검증

| 필드 | 검증 | 근거 |
| --- | --- | --- |
| `title` | `@StripHtml()`  • `@IsString`  • 1\~250자 + 공백만 거부 | DB `CHECK (char_length(btrim(title)) BETWEEN 1 AND 250)` |
| `dueDate` | `YYYY-MM-DD` 형식 강제 | 5-5 |
| `provider` | `@IsIn(['KAKAO','APPLE','GOOGLE'])` | DB `ck_social_provider` |
| `authorizationCode` | `@IsString` · `provider`가 APPLE이면 필수 | 형식 강제 — StripHtml 제외 |
| `deviceId` | `@IsString`  • 길이 상한 | 자유 텍스트 아님 — StripHtml 제외 |
| `completed` | `@IsBoolean` | — |
| `name` (소셜 응답) | HTML 제거 + 50자 절삭 | DB `ck_users_name` (1\~50자) |
| `email` (소셜 응답) | `lower(btrim())` | 안 하면 `ck_users_email`에서 INSERT 실패 |

`title`과 `name`은 자유 텍스트이므로 `@StripHtml()`이 **필수**다. 레포 `CLAUDE.md` 보안 규칙과 DB 설계서 4장이 같은 지점을 지적한다. 이메일·UUID·날짜·숫자는 형식이 강제되므로 적용 제외.

### 6-3. 에러 코드 (제안)

모듈별 `errors/` 디렉터리에 두고 `BusinessException`으로 던진다.

| 코드 | HTTP | 발생 지점 |
| --- | --- | --- |
| `VALIDATION_FAILED` | 400 | DTO 검증 실패 |
| `TERMS_AGREEMENT_REQUIRED` | 400 | 신규 가입인데 필수 약관 동의 누락 |
| `SOCIAL_TOKEN_INVALID` | 401 | 소셜 토큰 검증 실패 |
| `ACCESS_TOKEN_INVALID` | 401 | Bearer 토큰 무효·만료 |
| `REFRESH_TOKEN_INVALID` / `_REVOKED` / `_EXPIRED` | 401 | 재발급·로그아웃 |
| `TODO_NOT_FOUND` | 404 | 미존재 · 타인 소유 · 소프트 삭제된 할 일 |
| `USER_NOT_FOUND` | 404 | 탈퇴 후 잔여 토큰 사용 |

타인 소유 리소스에 403을 주지 않고 404로 통일한다. 403은 "그 id가 존재한다"는 사실을 알려준다.

---

## 7. 안 만들 것

| 미포함 | 이유 |
| --- | --- |
| `GET /todos/{todoId}` 단건 조회 | 작성 화면은 목록 데이터로 채운다 |
| `GET /todos?from=&to=` 범위 조회 | v1.1 |
| 휴지통 목록 API | 소프트 삭제는 하되 복구 UI는 스낵바뿐 (DB 설계서 7장) |
| 기기 목록·개별 로그아웃 API | 기기 관리 화면이 MVP에 없다. 3대 초과는 자동 폐기 |
| 약관 본문 조회 API | `contentUrl`만 주고 본문은 WebView |
| 문의 접수 API | `mailto:` 대체 |
| 앱 버전·공지 API | Firebase Remote Config 대체 |
| 할 일 순서 변경 API | 드래그 순서 변경이 v1 범위 밖 |
| 구글 서버살 revoke | 호출하려면 구글 토큰을 저장해야 한다. 클라이언트 SDK `disconnect()`로 충분 (5-6) |
| 카카오 연결 해제 웹훅 수신 | 우리가 호출한 unlink에는 웹훅이 오지 않는다. 사용자가 카카오 설정에서 직접 해제한 경우만 대상이고 v1 범위 밖 |
| 애플 refresh token 일일 검증 배지 | TN3194 권장이지만 자체 세션을 쓰므로 MVP 생략. v1.1 |
| 기기 연결 해제 알림 처리 | 사용자가 제공자 설정에서 연결을 끊어도 자체 세션은 살아 있다. 심사 차단 사용은 아니므로 v1.1 |

---

## 8. 엔드포인트가 아닌 것

| 항목 | 형태 | 주기 |
| --- | --- | --- |
| 할 일 정리 배치 | Cron — `DELETE FROM todos WHERE deleted_at < now() - interval '7 days'` | 일 1회 |
| 만료 토큰 정리 배치 | Cron — `expires_at < now() - interval '30 days'` | 주 1회 |
| `GET /health` | 엔드포인트 (기능 명세서 외) | 배포·헬스체크 |

---

## 9. 다음 할 일

- [x] 애플 로그인 검증 방식 확정 — `identityToken` 검증 + `authorizationCode` 교환 **둘 다**, 약관은 선동의 (5-2 · 5-6)
- [x] 카카오 연결 끊기 방식 확정 — 어드민 키 + 회원번호. 토큰 저장 불필요 (5-6)
- [x] 구글 연결 끊기 방식 확정 — 클라이언트 SDK `disconnect()`. 서버 토큰 저장 불필요 (5-6)
- [ ] 마이그레이션 005 — `user_social_accounts.provider_refresh_token_enc` 추가(애플 전용). DB 설계서 · DDL · ERD 동반 수정
- [ ] 암호화 모듈 확인 — 기존 `common/crypto`로 양방향 암호화(AES-256-GCM)가 가능한지
- [ ] 시크릿 등록 — 애플 `.p8` · Key ID · Team ID · 번들 ID, 카카오 어드민 키
- [ ] 카카오 어드민 키 인증 공지 확인 — 테스트 도구 한정 변경인지 구현 전 재확인
- [ ] 탈퇴 유스케이스 테스트 — 제공자별 분기, 해제 실패에도 탈퇴 진행, 카카오 -101 성공 처리
- [ ] 애플 코드 교환 실패 모니터링 — 실패가 누적되면 해당 사용자들의 탈퇴 시 revoke가 불가능해진다
- [ ] `terms` 초기 데이터 INSERT 후 `GET /terms` 응답 스펙 고정 — 약관 공개 URL 확정이 선행
- [ ] 공통 응답 래퍼 · 에러 코드 네이밍을 기존 레포(`common/response`, `common/errors`)와 맞출지 결정
- [ ] 전역 prefix 사용 여부 확정 — Swagger가 `/api`를 쓰고 있어 충돌 확인 필요
- [ ] 구글 로그인 OAuth 클라이언트 ID 발급 (iOS / Android / 서버용 별도)
- [ ] UseCase별 `.spec.ts` 작성 — 성공 / NOT\_FOUND / 권한 / 저장 실패 4케이스 (`CLAUDE.md` 테스트 규칙)
- [ ] 조회·수정·완료변경 전 쿼리에 `AND deleted_at IS NULL` 적용 점검 — 누락 시 삭제된 할 일 노출 + Seq Scan
- [ ] 자유 텍스트 필드 `@StripHtml()` 적용 점검 (`title`, `name`)
