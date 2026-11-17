# 테스트 계정 (로컬 개발 전용)

`npm run db:seed` 가 로컬 dev DB(`harukok_dev`)에 넣는 계정이다. **운영에는 넣지 않는다** (`db:seed` 는 `NODE_ENV=production` 과 로컬 외 호스트에서 실행을 거부한다). 값은 모두 가짜다.

## 계정 정보

| 항목             | 값                                                      | 저장 위치                               |
| ---------------- | ------------------------------------------------------- | --------------------------------------- |
| 로그인 제공자    | `GOOGLE`                                                | `user_social_accounts.provider`         |
| 제공자 사용자 ID | `dev-test-user`                                         | `user_social_accounts.provider_user_id` |
| 이름             | `테스트 계정`                                           | `users.name`                            |
| 이메일           | `dev-test@example.com` (예약 도메인)                    | `users.email`                           |
| 약관 동의        | 시드할 때 시행 중인 이용약관 (없으면 첫 로그인 때 보충) | `user_term_agreements`                  |
| 사용자 ID        | DB 가 만든 uuidv7 — `db:seed` 출력에 찍힌다             | `users.id`                              |

## 로그인 방법

서버가 `DEV_TEST_LOGIN=true` 로 떠 있을 때만 된다. 자세한 절차는 [swagger-social-login.md](swagger-social-login.md).

```json
POST /auth/social/login
{
  "provider": "GOOGLE",
  "idToken": "dev-test-token",
  "deviceId": "swagger"
}
```

- 테스트 토큰(`dev-test-token`)은 **GOOGLE 로만** 통한다. 카카오·애플로 보내면 401
- `DEV_TEST_LOGIN` 이 꺼져 있으면 계정이 DB 에 있어도 로그인되지 않는다 (401)

## 다시 만들기 · 지우기

- 다시 실행해도 중복되지 않는다: `npm run db:seed` → `테스트 계정: 이미 있음`
- 지우기 (DBeaver 등에서 `harukok_dev` 에 실행). 소셜 계정·약관 동의·토큰·할 일은 `ON DELETE CASCADE` 로 함께 지워진다

  ```sql
  DELETE FROM users
   WHERE id = (SELECT user_id FROM user_social_accounts
                WHERE provider = 'GOOGLE' AND provider_user_id = 'dev-test-user');
  ```

## 값을 바꿀 때

계정 값은 두 곳에 있고 **반드시 같아야 한다** (다르면 시드한 계정으로 로그인되지 않는다). `test/tooling/db-seed.spec.ts` 가 둘을 대조한다.

- 앱: `src/modules/auth/social/dev-test-login.ts` (`DEV_TEST_IDENTITY`, `DEV_TEST_ID_TOKEN`)
- 시드: `scripts/db-seed.cjs` (`TEST_ACCOUNT`)

e2e 테스트는 이 계정과 무관하게 `harukok_test` 를 매번 초기화해서 쓴다.
