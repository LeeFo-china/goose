-- Allow unified phone login to persist a platform administrator candidate.
-- Rollback: remove platform_admin candidate rows, then restore the previous
-- target mode and target-shape constraints from 20260715100000.

BEGIN;

ALTER TABLE public.phone_identity_login_candidates
  DROP CONSTRAINT phone_identity_login_candidates_target_mode_check,
  DROP CONSTRAINT phone_identity_login_candidate_target_check;

ALTER TABLE public.phone_identity_login_candidates
  ADD CONSTRAINT phone_identity_login_candidates_target_mode_check CHECK (
    target_mode IN ('customer', 'tenant_employee', 'platform_partner', 'platform_admin')
  ),
  ADD CONSTRAINT phone_identity_login_candidate_target_check CHECK (
    (target_mode = 'customer' AND tenant_id IS NOT NULL AND customer_id IS NOT NULL
      AND employee_id IS NULL AND partner_id IS NULL AND partner_member_id IS NULL)
    OR
    (target_mode = 'tenant_employee' AND tenant_id IS NOT NULL AND employee_id IS NOT NULL
      AND customer_id IS NULL AND partner_id IS NULL AND partner_member_id IS NULL)
    OR
    (target_mode = 'platform_partner' AND partner_id IS NOT NULL
      AND partner_member_id IS NOT NULL AND tenant_id IS NULL
      AND customer_id IS NULL AND employee_id IS NULL)
    OR
    (target_mode = 'platform_admin' AND tenant_id IS NULL AND employee_id IS NOT NULL
      AND customer_id IS NULL AND partner_id IS NULL AND partner_member_id IS NULL)
  );

COMMIT;
