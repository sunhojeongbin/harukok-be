-- ============================================================================
--  하루콕 (HaruKok) — 006 롤백
--
--  ⚠️ 적용 시 지운 PRIVACY 행은 복구되지 않는다. 남은 행은 전부 SERVICE · 필수로 채운다.
--     복구한 컬럼은 테이블 끝에 붙는다 (컬럼 순서만 001 과 다르다).
-- ============================================================================

BEGIN;

DROP INDEX idx_terms_effective_from;
ALTER TABLE terms DROP CONSTRAINT uq_terms_version;

ALTER TABLE terms ADD COLUMN type varchar(20) NOT NULL DEFAULT 'SERVICE';
ALTER TABLE terms ALTER COLUMN type DROP DEFAULT;
ALTER TABLE terms ADD COLUMN is_required boolean NOT NULL DEFAULT true;

ALTER TABLE terms ADD CONSTRAINT ck_terms_type CHECK (type IN ('SERVICE', 'PRIVACY'));
ALTER TABLE terms ADD CONSTRAINT uq_terms_type_version UNIQUE (type, version);
CREATE INDEX idx_terms_type_effective_from ON terms (type, effective_from DESC);

COMMENT ON TABLE  terms      IS '약관 버전. 개정 시 행을 추가하고 기존 행은 보존한다.';
COMMENT ON COLUMN terms.type IS 'SERVICE(이용약관) | PRIVACY(개인정보 처리방침)';

COMMIT;
