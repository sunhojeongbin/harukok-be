# 실제 구글 · 카카오 로그인 테스트 (로컬)

[swagger-social-login.md](swagger-social-login.md) 의 테스트 로그인(`dev-test-token`)은 토큰 검증을 건너뛴다. 이 문서는 **실제 제공자 토큰**으로 JWKS 서명 · `iss` · `aud` 검증과 이름 · 이메일 클레임까지 확인하는 방법이다.

도구: `scripts/manual/social-login-test.cjs` — 한 페이지(`http://localhost:5500`)에 구글 · 카카오 로그인 버튼을 두고, 로그인하면 백엔드를 차례로 호출한다.

1. `POST /auth/social/login`
2. `GET /users/me` — 저장된 이름 · 이메일 확인
3. `POST /auth/logout` — 테스트 세션 정리

> **키는 저장소에 넣지 않는다.** 스크립트는 키를 실행 인자로만 받고, 카카오 클라이언트 시크릿은 터미널에서 가려서 입력받는다. 토큰 원문은 터미널에 찍지 않는다.
> 실제 제공자를 호출하므로 자동 테스트(`npm run test*`)에는 넣지 않는다. 백엔드 주소는 로컬만 허용한다.

## 1. 준비 (처음 한 번)

### 백엔드

- `.env` 에 실제 키를 넣고 `npm run start:dev` 로 띄운다 (`NODE_ENV=development`)
- 토큰의 `aud` 가 아래 값에 들어 있어야 검증을 통과한다. 바꿨으면 백엔드를 다시 띄운다

| 제공자 | `.env` 키           | 넣어야 하는 값                                   |
| ------ | ------------------- | ------------------------------------------------ |
| 구글   | `GOOGLE_CLIENT_IDS` | **웹 애플리케이션** 유형 OAuth 클라이언트 ID     |
| 카카오 | `KAKAO_APP_KEYS`    | **REST API 키** (이 도구는 REST API 방식 로그인) |

### Google Cloud Console — API 및 서비스 → 사용자 인증 정보

- **웹 애플리케이션** 유형 OAuth 클라이언트 (iOS · Android 유형으로는 웹 버튼이 동작하지 않는다)
- 승인된 JavaScript 원본: `http://localhost`, `http://localhost:5500` (반영까지 몇 분 걸릴 수 있다)
- OAuth 동의 화면이 "테스트" 상태면 로그인할 계정을 테스트 사용자에 추가

### Kakao Developers

- 카카오 로그인 **사용 ON**, **OpenID Connect 활성화 ON** (꺼져 있으면 `id_token` 이 오지 않는다)
- 리다이렉트 URI: `http://localhost:5500/kakao/callback`
- 동의항목: 닉네임(→ `name`), 이메일(비즈 앱일 때. 없으면 이메일 없이 가입)
- 클라이언트 시크릿을 켰다면 실행 시 입력한다

## 2. 실행

별도 터미널에서 (계속 떠 있어야 한다). 키는 따옴표 안에, 꺾쇠(`< >`) 없이 넣는다.

```bash
node scripts/manual/social-login-test.cjs --google "<웹 클라이언트 ID>" --kakao "<REST API 키>"
```

- 하나만 주면 그 제공자만 켜진다
- `--kakao` 를 주면 시작할 때 `카카오 클라이언트 시크릿` 을 묻는다 — 안 쓰면 Enter
- 이 명령은 셸 기록에 남는다. 클라이언트 ID · REST API 키는 앱에 들어가는 공개 값이라 괜찮지만, 시크릿은 인자로 주지 않는다

## 3. 테스트

1. `http://localhost:5500` 을 연다
2. 구글 · 카카오 버튼을 차례로 누른다 (카카오는 카카오 화면에 다녀온 뒤 같은 페이지로 돌아온다)
3. 칸마다 **성공** 이면 정상 — `login 200` · `me 200` · `logout 204`
4. **Swagger 로그인 요청 본문 복사** → `http://localhost:3000/docs` 의 `POST /auth/social/login` 에 붙여 넣으면 Swagger 로 이어서 테스트할 수 있다 (이후 방법은 [swagger-social-login.md](swagger-social-login.md) 3장)

- 구글 · 카카오는 이메일이 같아도 **다른 사용자**로 가입된다
- `id_token` 은 짧게 유효하다(구글 1시간). 만료되면 401 `SOCIAL_TOKEN_INVALID` — 다시 로그인해 복사한다
- 카카오 계정으로 `DELETE /users/me` 를 부르면 어드민 키로 **실제 카카오 연결 끊기**까지 실행된다. 다음 로그인에 동의 화면이 다시 나온다

## 4. 문제 해결

| 증상                                  | 원인 · 해결                                                                          |
| ------------------------------------- | ------------------------------------------------------------------------------------ |
| `localhost:5500` 이 안 열림           | 스크립트가 안 떠 있다 — 터미널 메시지 확인 (꺾쇠까지 입력하면 zsh 오류)              |
| 구글 "액세스 차단됨" `invalid_client` | 클라이언트 ID 오타 · 다른 값                                                         |
| 구글 `origin_mismatch`                | JavaScript 원본 미등록                                                               |
| 구글 `access_denied` · 403            | 동의 화면 "테스트" 상태인데 테스트 사용자가 아님                                     |
| 카카오 `KOE006`                       | 리다이렉트 URI 미등록                                                                |
| 카카오 `KOE010` · `invalid_client`    | 클라이언트 시크릿 틀림 · 켜져 있는데 미입력                                          |
| `id_token 이 없습니다`                | 카카오 OpenID Connect 꺼짐                                                           |
| 백엔드 401 `SOCIAL_TOKEN_INVALID`     | 결과의 `tokenClaims.aud` 가 `.env` 의 `GOOGLE_CLIENT_IDS` · `KAKAO_APP_KEYS` 에 없음 |

## 5. 확인 쿼리 (DBeaver 등)

```sql
SELECT s.provider, u.name, u.email,
       (SELECT count(*) FROM user_term_agreements a WHERE a.user_id = u.id) AS agreements,
       (SELECT count(*) FILTER (WHERE revoked_at IS NULL) FROM refresh_tokens r WHERE r.user_id = u.id) AS active_tokens
  FROM users u JOIN user_social_accounts s ON s.user_id = u.id
 WHERE s.provider_user_id <> 'dev-test-user'
 ORDER BY u.created_at;
```
