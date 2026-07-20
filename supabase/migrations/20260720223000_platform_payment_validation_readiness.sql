-- Persist sanitized platform validation evidence and tenant profile provenance.

ALTER TABLE public.platform_payment_configs
  ADD COLUMN IF NOT EXISTS last_validation_error_code text NULL,
  ADD COLUMN IF NOT EXISTS last_validation_error_message text NULL,
  ADD COLUMN IF NOT EXISTS last_validation_request_id text NULL;

ALTER TABLE public.platform_payment_configs
  DROP CONSTRAINT IF EXISTS platform_payment_configs_validation_error_code_not_blank,
  DROP CONSTRAINT IF EXISTS platform_payment_configs_validation_error_message_not_blank,
  DROP CONSTRAINT IF EXISTS platform_payment_configs_validation_request_id_not_blank;

ALTER TABLE public.platform_payment_configs
  ADD CONSTRAINT platform_payment_configs_validation_error_code_not_blank
    CHECK (last_validation_error_code IS NULL
      OR btrim(last_validation_error_code) <> ''),
  ADD CONSTRAINT platform_payment_configs_validation_error_message_not_blank
    CHECK (last_validation_error_message IS NULL
      OR btrim(last_validation_error_message) <> ''),
  ADD CONSTRAINT platform_payment_configs_validation_request_id_not_blank
    CHECK (last_validation_request_id IS NULL
      OR btrim(last_validation_request_id) <> '');

ALTER TABLE public.tenant_payment_configs
  ADD COLUMN IF NOT EXISTS platform_payment_config_id uuid NULL;

ALTER TABLE public.tenant_payment_configs
  DROP CONSTRAINT IF EXISTS tenant_payment_configs_platform_payment_config_id_fkey;

ALTER TABLE public.tenant_payment_configs
  ADD CONSTRAINT tenant_payment_configs_platform_payment_config_id_fkey
    FOREIGN KEY (platform_payment_config_id)
    REFERENCES public.platform_payment_configs(id)
    ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS tenant_payment_configs_platform_payment_config_id_idx
ON public.tenant_payment_configs(platform_payment_config_id)
WHERE platform_payment_config_id IS NOT NULL;

COMMENT ON COLUMN public.platform_payment_configs.last_validation_error_code
IS 'Sanitized validation error code; must not contain secret material or raw WeChat payloads.';

COMMENT ON COLUMN public.platform_payment_configs.last_validation_error_message
IS 'Sanitized validation error message; must not contain secret material or raw WeChat payloads.';

COMMENT ON COLUMN public.platform_payment_configs.last_validation_request_id
IS 'WeChat Pay Request-ID from the latest validation; must not contain secret material or raw WeChat payloads.';

COMMENT ON COLUMN public.tenant_payment_configs.platform_payment_config_id
IS 'Central platform payment profile inherited by this tenant payment configuration.';
