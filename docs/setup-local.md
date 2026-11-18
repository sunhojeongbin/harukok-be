# 로컬 환경 설정 (macOS)

1. PostgreSQL 18 설치 및 실행
   ```bash
   brew install postgresql@18
   brew services start postgresql@18
   ```
2. PATH 추가 (`~/.zshrc`)
   ```bash
   export PATH="/opt/homebrew/opt/postgresql@18/bin:$PATH"
   ```
3. 버전 확인: `psql --version` 이 18 이어야 한다.
4. 환경 변수: `cp .env.example .env` 후 `<mac-user>` 를 본인 Mac 사용자 이름으로 수정한다.
   - 2단위부터 JWT·암호화·애플·구글·카카오 키가 **부팅 시 필수**다. 빠지면 서버가 키 이름을 알려주며 뜨지 않는다
   - `NODE_ENV` 도 필수다 — 로컬은 `development`. Swagger · 테스트 로그인은 `development` · `test` 에서만 켜진다
   - 요청 제한: 같은 IP 1분 `RATE_LIMIT_PER_MINUTE`(기본 30)회. 로컬에서 많이 두드리면 429 가 난다 — 올려서 쓰면 된다
   - 로컬 개발은 가짜 값이어도 부팅된다 (실제 소셜 로그인만 실패). 예: `TOKEN_ENCRYPTION_KEY` 는 `openssl rand -base64 32`, `APPLE_PRIVATE_KEY` 는 `openssl ecparam -genkey -name prime256v1 | openssl pkcs8 -topk8 -nocrypt` 결과를 `\n` 으로 이은 한 줄
   - e2e 는 `.env` 와 무관하게 항상 가짜 값을 쓴다 (`test/fixtures/fake-env.ts`)
5. 의존성 설치: `npm ci`
6. DB 생성: `npm run db:setup` (`harukok_dev`, `harukok_test` 생성만 하며 삭제하지 않는다. 로컬 호스트만 허용)
7. 스키마 적용: `npm run db:migrate` (`harukok_dev` 에 미적용 마이그레이션 적용). 기동 후 `curl localhost:3000/health` 가 `{"status":"ok","db":"up"}` 이면 정상
8. 임시 데이터: `npm run db:seed` (임시 이용약관 + 테스트 계정). Swagger 로 로그인 테스트는 [guides/swagger-social-login.md](guides/swagger-social-login.md), 계정은 [guides/test-account.md](guides/test-account.md)
9. Claude Code 에 superpowers 플러그인이 설치되어 있는지 확인한다.
