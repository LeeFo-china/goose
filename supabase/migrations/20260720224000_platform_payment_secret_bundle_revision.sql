-- Bind platform payment validation to the exact opaque secret bundle revision.

ALTER TABLE public.platform_payment_configs
  ADD COLUMN IF NOT EXISTS secret_bundle_revision text NULL;

ALTER TABLE public.platform_payment_configs
  DROP CONSTRAINT IF EXISTS platform_payment_configs_secret_bundle_revision_not_blank;

ALTER TABLE public.platform_payment_configs
  ADD CONSTRAINT platform_payment_configs_secret_bundle_revision_not_blank
    CHECK (secret_bundle_revision IS NULL
      OR btrim(secret_bundle_revision) <> '');

COMMENT ON COLUMN public.platform_payment_configs.secret_bundle_revision
IS 'An opaque revision binding validation to a secret bundle version; never secret material.';
