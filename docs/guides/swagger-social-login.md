# Swagger 로 소셜 로그인 테스트하기

`POST /auth/social/login` 은 카카오·애플·구글이 서명한 `idToken` 을 검증한다. 로컬에서는 진짜 토큰을 구하기 번거로우므로 **개발 전용 테스트 로그인**을 쓴다. 테스트 계정은 [test-account.md](test-account.md) 참고.

> 명세 원본은 `docs/spec/01-api.md` 4장 1번이다. 이 문서는 로컬 테스트 방법만 다룬다.

## 1. 준비 (처음 한 번)

1. 로컬 DB 와 `.env` 설정은 [setup-local.md](../setup-local.md) 를 따른다
2. `.env` 에 테스트 로그인을 켠다

   ```bash
   DEV_TEST_LOGIN=true
   ```

   - `true`·`false` 만 받는다 (`yes`, `1` 은 부팅 실패)
   - **운영(`NODE_ENV=production`)에서 `true` 면 서버가 뜨지 않는다.** 실수로 켠 채 배포하는 것을 막기 위해서다
   - 켜면 기동 로그에 `DEV_TEST_LOGIN 이 켜져 있다` 경고가 찍힌다

3. 스키마와 임시 데이터를 넣는다

   ```bash
   npm run db:migrate
   npm run db:seed      # 임시 이용약관 + 테스트 계정
   ```

4. 서버를 띄운다: `npm run start:dev`

## 2. Swagger 에서 로그인

1. 브라우저로 `http://localhost:3000/docs` 를 연다 (운영에서는 Swagger 가 꺼져 있다)
2. **auth → POST /auth/social/login → Try it out**
3. 요청 본문에 아래를 넣고 **Execute**

   ```json
   {
     "provider": "GOOGLE",
     "idToken": "dev-test-token",
     "deviceId": "swagger"
   }
   ```

4. 200 응답 예

   ```json
   {
     "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
     "refreshToken": "q3Z...43자",
     "isNewUser": false,
     "user": {
       "id": "019a...",
       "name": "테스트 계정",
       "provider": "GOOGLE"
     }
   }
   ```

   - `db:seed` 를 안 했으면 첫 로그인 때 테스트 계정이 만들어지고 `isNewUser: true`
   - 신규 가입이면 현행 이용약관에 자동 동의로 기록된다 (`user_term_agreements`)

## 3. 받은 토큰 쓰기

| 토큰           | 수명  | 쓰는 곳                                                                                                 |
| -------------- | ----- | ------------------------------------------------------------------------------------------------------- |
| `accessToken`  | 1시간 | Swagger 오른쪽 위 **Authorize** 에 붙여 넣으면 `Authorization: Bearer` 로 붙는다 (3단위부터 Bearer API) |
| `refreshToken` | 30일  | 재발급·로그아웃 요청 본문 (3단위)                                                                       |

### 재발급 — `POST /auth/token/refresh` (인증 없음)

```json
{ "refreshToken": "<로그인 응답의 refreshToken>", "deviceId": "swagger" }
```

- 200 이면 **새** `accessToken` · `refreshToken` 을 받는다. 이전 `refreshToken` 은 폐기된다 — 다음 재발급에는 새 것을 쓴다
- 새 리프레시 토큰은 지금부터 다시 30일 (슬라이딩)
- 이전 토큰을 다시 보내면 **재사용**으로 판정돼 401 `REFRESH_TOKEN_REVOKED` 이고, 그 기기의 새 세션까지 폐기된다 → 다시 로그인
- `deviceId` 는 로그인 때와 같아야 한다 (다르면 401 `REFRESH_TOKEN_INVALID`)

### 로그아웃 — `POST /auth/logout` (Bearer 필요)

1. **Authorize** 에 `accessToken` 을 넣는다 (자물쇠 아이콘)
2. 본문은 재발급과 같다: `{ "refreshToken": "...", "deviceId": "swagger" }`
3. 204 — 그 기기의 리프레시 토큰이 폐기된다. 같은 요청을 다시 보내도 204 (멱등)

- Bearer 없음·만료 → 401 `ACCESS_TOKEN_INVALID` (액세스 토큰은 1시간이면 만료 — 재발급으로 새로 받는다)
- 다른 사용자의 토큰이거나 `deviceId` 가 다르면 → 401 `REFRESH_TOKEN_INVALID`

### 내 정보 — `GET /users/me` (Bearer)

- 200 `{ id, name, email, provider, createdAt }`. 테스트 계정이면 `name: "테스트 계정"`, `provider: "GOOGLE"` (계정 연동이 없어 제공자는 하나)

### 탈퇴 — `DELETE /users/me` (Bearer)

- 204. 연동 해제(애플 revoke · 카카오 unlink) → 사용자 삭제. CASCADE 로 소셜 계정 · 약관 동의 · 토큰 · 할 일이 모두 지워진다
- 테스트 계정은 GOOGLE 이라 서버가 외부 호출을 하지 않는다 (구글은 앱이 SDK 로 해제)
- 탈퇴 후 같은 액세스 토큰(최대 1시간 유효)으로 부르면 404 `USER_NOT_FOUND`, 리프레시 토큰은 401 `REFRESH_TOKEN_INVALID`
- ⚠️ **테스트 계정이 지워진다.** 다시 쓰려면 `npm run db:seed` (또는 테스트 토큰으로 다시 로그인하면 새로 만들어진다)

### 할 일 — `/todos` (Bearer)

| 요청                                                       | 본문 · 쿼리                                      | 응답                                                                            |
| ---------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------- |
| `GET /todos?date=2026-11-17`                               | —                                                | 200 그 날짜 목록 (생성순, 삭제한 것 제외)                                       |
| `POST /todos`                                              | `{ "title": "장보기", "dueDate": "2026-11-17" }` | 201                                                                             |
| `PATCH /todos/{todoId}`                                    | `{ "title": "..." }`                             | 200. 날짜는 수정 불가 — `dueDate` 를 보내면 400                                 |
| `PATCH /todos/{todoId}/completion`                         | `{ "completed": true }`                          | 200 `{ id, completedAt }` — 다시 보내도 처음 완료 시각 유지                     |
| `DELETE /todos/{todoId}`                                   | —                                                | 204 (다시 보내도 204)                                                           |
| `POST /todos/{todoId}/restore`                             | —                                                | 200 되살린 할 일 (같은 자리로 돌아온다)                                         |
| `GET /todos/stats?startDate=2026-10-26&endDate=2026-12-06` | —                                                | 200 `{ startDate, endDate, summary, days }` — 범위의 모든 날짜, 없는 날은 0 · 0 |

- `dueDate`·`date`·`startDate`·`endDate` 는 `YYYY-MM-DD` 만 — `2026-11-17T00:00:00+09:00`, `2026-02-30` 은 400
- 달력 현황은 `startDate ≤ endDate`, 양 끝 포함 최대 42일 (월간 6주 그리드). 넘으면 400
- `title` 의 HTML 은 지워지고, 공백만·251자 이상은 400
- 남의 할 일 · 삭제된 할 일 · 없는 id 는 모두 404 `TODO_NOT_FOUND`

## 4. 기기 3대 제한 확인

`deviceId` 를 바꿔 가며 로그인해 본다.

- 같은 `deviceId` 로 다시 로그인 → 그 기기의 이전 리프레시 토큰이 폐기된다 (기기당 1개)
- 서로 다른 `deviceId` 4개로 로그인 → 가장 오래된 기기의 토큰이 폐기되고 활성은 3대

DB 에서 확인 (DBeaver 등):

```sql
SELECT device_id, created_at, revoked_at
  FROM refresh_tokens
 WHERE user_id = (SELECT user_id FROM user_social_accounts
                   WHERE provider = 'GOOGLE' AND provider_user_id = 'dev-test-user')
 ORDER BY created_at;
```

## 5. 오류 응답 확인

| 보내는 것                                               | 응답                                                   |
| ------------------------------------------------------- | ------------------------------------------------------ |
| `"idToken": "아무거나"`                                 | 401 `SOCIAL_TOKEN_INVALID`                             |
| `"provider": "KAKAO"` 또는 `"APPLE"` + `dev-test-token` | 401 `SOCIAL_TOKEN_INVALID` — 테스트 토큰은 GOOGLE 전용 |
| `"provider": "NAVER"`                                   | 400 `VALIDATION_FAILED`                                |
| `"deviceId": "   "` 또는 129자 이상                     | 400 `VALIDATION_FAILED`                                |
| 정의되지 않은 필드 (예: `agreement`)                    | 400 `VALIDATION_FAILED`                                |
| `DEV_TEST_LOGIN=false` 인 서버에 `dev-test-token`       | 401 `SOCIAL_TOKEN_INVALID`                             |

## 6. 테스트 로그인으로 확인할 수 없는 것

테스트 토큰은 **토큰 검증 단계만 건너뛴다**. 아래는 실제 제공자 토큰이 있어야 확인된다.

- 카카오·애플·구글 JWKS 서명 · `iss` · `aud` 검증 (단위 테스트는 테스트용 키로 검증한다)
- 애플 `authorizationCode` 교환과 refresh token 암호화 저장 (e2e 는 가짜 애플 클라이언트로 검증한다)
- 실제 이름·이메일 클레임

구글 · 카카오는 실제 키를 넣은 뒤 [real-social-login-test.md](real-social-login-test.md) 의 도구로 진짜 토큰을 받아 확인한다. 애플은 키 발급 후 앱에서 받은 토큰을 같은 방법으로 넣는다.
