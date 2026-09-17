BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '1min';

ALTER TABLE public.tenant_onboarding_applications
  ALTER COLUMN unified_social_credit_code DROP NOT NULL;

COMMENT ON COLUMN public.tenant_onboarding_applications.unified_social_credit_code IS
  'Optional unified social credit code supplied by the tenant onboarding applicant.';

COMMIT;
