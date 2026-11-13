-- ============================================================================
--  하루콕 (HaruKok) — 005 롤백
--
--  ⚠️ 이 스크립트는 저장된 애플 refresh token 을 '전부 파기' 한다.
--     롤백 후 005 를 다시 적용해도 기존 애플 사용자의 토큰은 복구되지 않으며,
--     그 사용자들은 탈퇴 시 수동 해제 경로(사용자가 애플 설정에서 직접 연결 해제)로 떨어진다.
--     운영 적용 후 롤백은 사실상 비가역이라고 보고 판단할 것.
-- ============================================================================

BEGIN;

-- 컬럼을 지우면 ck_user_social_accounts_provider_refresh_token_enc 도 함께 사라진다.
ALTER TABLE user_social_accounts
  DROP COLUMN IF EXISTS provider_refresh_token_enc;

COMMIT;
