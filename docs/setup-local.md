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
5. 의존성 설치: `npm ci`
6. DB 생성: `npm run db:setup` (`harukok_dev`, `harukok_test` 생성만 하며 삭제하지 않는다. 로컬 호스트만 허용)
7. Claude Code 에 superpowers 플러그인이 설치되어 있는지 확인한다.
