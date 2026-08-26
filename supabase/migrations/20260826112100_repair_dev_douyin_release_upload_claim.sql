-- Repair the one development release claim created by the pre-v2 API. The
-- repository rejected the legacy RPC projection before any provider call, so
-- this exact row has no uncertain remote side effect to reconcile.
-- Rollback: none. A subsequent upload claim is still guarded by the normal
-- atomic command and can be recovered through provider version truth.
BEGIN;

UPDATE public.douyin_miniapp_releases
SET
  operation_name = NULL,
  operation_claim_token = NULL,
  operation_claim_expires_at = NULL
WHERE id = '3f9460a3-aefe-4b84-a926-a783db0c1b96'::uuid
  AND installation_id = '82061c96-29ac-4426-baff-5efc1061fbc8'::uuid
  AND template_id = '78572'
  AND template_version = '0.1.6'
  AND status = 'created'
  AND douyin_log_id IS NULL
  AND test_qr_url IS NULL
  AND latest_test_qr_url IS NULL
  AND audit_qr_url IS NULL
  AND audit_host_names = ARRAY[]::text[]
  AND audit_note IS NULL
  AND audit_result IS NULL
  AND submitted_at IS NULL
  AND audited_at IS NULL
  AND released_at IS NULL
  AND operation_name = 'upload'
  AND operation_claim_token IS NOT NULL
  AND operation_claim_expires_at <= clock_timestamp();

COMMIT;
