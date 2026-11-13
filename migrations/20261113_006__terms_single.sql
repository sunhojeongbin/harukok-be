-- ============================================================================
--  하루콕 (HaruKok) — 006 이용약관 단일화
--  Target   : PostgreSQL 18+
--  Created  : 2026-11-13
--  Encoding : UTF-8
--
--  적용 : npm run db:migrate
--  롤백 : npm run db:rollback (harukok_test 대상)
--
--  [배경]
--    약관은 이용약관 1종이다. 개인정보 처리방침은 DB 에 두지 않고 앱이 노션 링크로 표시한다.
--    GET /terms 는 목록이 아니라 현행 이용약관 1개를 돌려준다.
--    가입에 항상 필수이므로 is_required 도 없앤다.
-- ============================================================================

BEGIN;

-- 개인정보 처리방침 행은 더 이상 쓰지 않는다.
-- 동의 이력이 있으면 user_term_agreements 의 ON DELETE RESTRICT 로 실패한다 — 조용히 지워지지 않는다.
DELETE FROM terms WHERE type = 'PRIVACY';

DROP INDEX idx_terms_type_effective_from;
ALTER TABLE terms DROP CONSTRAINT uq_terms_type_version;
ALTER TABLE terms DROP CONSTRAINT ck_terms_type;
ALTER TABLE terms DROP COLUMN type;
ALTER TABLE terms DROP COLUMN is_required;

ALTER TABLE terms ADD CONSTRAINT uq_terms_version UNIQUE (version);

-- 시행일 기준 현행 약관 조회: WHERE effective_from <= now() ORDER BY effective_from DESC LIMIT 1
CREATE INDEX idx_terms_effective_from ON terms (effective_from DESC);

COMMENT ON TABLE terms IS '이용약관 버전. 개정 시 행을 추가하고 기존 행은 보존한다. 개인정보 처리방침은 DB 에 두지 않는다.';

COMMIT;
