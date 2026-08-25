-- Split persisted Douyin release QR URLs by official version stage.
-- Rollback: deploy API that reads legacy test_qr_url only, then drop the two
-- stage columns and restore the operation_name check without audit_qr.
BEGIN;

ALTER TABLE public.douyin_miniapp_releases
  ADD COLUMN IF NOT EXISTS latest_test_qr_url text NULL,
  ADD COLUMN IF NOT EXISTS audit_qr_url text NULL;

UPDATE public.douyin_miniapp_releases
SET latest_test_qr_url = COALESCE(latest_test_qr_url, test_qr_url)
WHERE test_qr_url IS NOT NULL
  AND latest_test_qr_url IS NULL;

ALTER TABLE public.douyin_miniapp_releases
  DROP CONSTRAINT IF EXISTS douyin_miniapp_releases_latest_test_qr_url_check,
  ADD CONSTRAINT douyin_miniapp_releases_latest_test_qr_url_check CHECK (
    latest_test_qr_url IS NULL
    OR (
      length(latest_test_qr_url) <= 2048
      AND latest_test_qr_url ~ '^https://[^[:space:]]+$'
      AND position('@' IN latest_test_qr_url) = 0
    )
  ),
  DROP CONSTRAINT IF EXISTS douyin_miniapp_releases_audit_qr_url_check,
  ADD CONSTRAINT douyin_miniapp_releases_audit_qr_url_check CHECK (
    audit_qr_url IS NULL
    OR (
      length(audit_qr_url) <= 2048
      AND audit_qr_url ~ '^https://[^[:space:]]+$'
      AND position('@' IN audit_qr_url) = 0
    )
  );

ALTER TABLE public.douyin_miniapp_releases
  DROP CONSTRAINT IF EXISTS douyin_miniapp_releases_operation_name_check,
  ADD CONSTRAINT douyin_miniapp_releases_operation_name_check CHECK (
    operation_name IS NULL
    OR operation_name IN (
      'upload', 'test_qr', 'audit_qr', 'submit_audit', 'sync_status', 'publish'
    )
  );

COMMIT;
