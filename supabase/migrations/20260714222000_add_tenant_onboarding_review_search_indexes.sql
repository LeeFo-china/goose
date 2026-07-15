-- Support the platform review queue's bounded four-field contains search.
-- Rollback by dropping only the four indexes below. Keep pg_trgm installed
-- because the extension can be shared by other features.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

CREATE INDEX IF NOT EXISTS tenant_onboarding_applications_application_no_trgm_idx
  ON public.tenant_onboarding_applications
  USING gin (application_no extensions.gin_trgm_ops);

CREATE INDEX IF NOT EXISTS tenant_onboarding_applications_company_name_trgm_idx
  ON public.tenant_onboarding_applications
  USING gin (company_name extensions.gin_trgm_ops);

CREATE INDEX IF NOT EXISTS tenant_onboarding_applications_admin_phone_trgm_idx
  ON public.tenant_onboarding_applications
  USING gin (admin_phone extensions.gin_trgm_ops);

CREATE INDEX IF NOT EXISTS tenant_onboarding_applications_credit_code_trgm_idx
  ON public.tenant_onboarding_applications
  USING gin (unified_social_credit_code extensions.gin_trgm_ops);

COMMENT ON INDEX public.tenant_onboarding_applications_application_no_trgm_idx
  IS 'Accelerates platform onboarding queue contains search by application number.';
COMMENT ON INDEX public.tenant_onboarding_applications_company_name_trgm_idx
  IS 'Accelerates platform onboarding queue contains search by company name.';
COMMENT ON INDEX public.tenant_onboarding_applications_admin_phone_trgm_idx
  IS 'Accelerates platform onboarding queue contains search by admin phone.';
COMMENT ON INDEX public.tenant_onboarding_applications_credit_code_trgm_idx
  IS 'Accelerates platform onboarding queue contains search by social credit code.';

COMMIT;
