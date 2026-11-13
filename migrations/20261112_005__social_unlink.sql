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
