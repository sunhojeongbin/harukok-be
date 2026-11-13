-- 하루콕 (HaruKok) — 001 롤백: 자식 → 부모 순으로 삭제한다.
BEGIN;

DROP TABLE IF EXISTS todos, user_term_agreements, terms, refresh_tokens, user_social_accounts, users CASCADE;
DROP FUNCTION IF EXISTS set_updated_at();

COMMIT;
