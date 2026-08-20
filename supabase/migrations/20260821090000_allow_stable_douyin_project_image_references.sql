-- Forward rollback procedure:
-- 1. Disable new public-project profile writes and keep compatibility readers.
-- 2. Confirm no published client stores canonical project-log object keys.
-- 3. Only then use a forward migration to restore the prior HTTPS-only validator
--    after every stored object key has a durable replacement reference.
-- This migration performs no data rewrite or destructive schema change.

-- Public-project profiles store stable image references. Canonical tenant
-- project-log object keys are resolved to a fresh signed HTTPS URL at read time;
-- expiring signed URLs must not be persisted as the only durable reference.

BEGIN;

CREATE OR REPLACE FUNCTION public.douyin_public_image_urls_are_valid(p_urls text[])
RETURNS boolean
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = pg_catalog, public
AS $$
  SELECT cardinality(p_urls) <= 30
    AND NOT EXISTS (
      SELECT 1
      FROM unnest(p_urls) AS image_reference(value)
      WHERE image_reference.value IS NULL
        OR (
          NOT (
            char_length(image_reference.value) <= 2048
            AND image_reference.value ~ '^https://[^[:space:]]+$'
          )
          AND NOT (
            char_length(image_reference.value) <= 1000
            AND image_reference.value ~ '^tenants/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/project-log/projects/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9]{4}/(0[1-9]|1[0-2])/(0[1-9]|[12][0-9]|3[01])/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](jpg|jpeg|png|webp|heic|heif)$'
          )
        )
    )
    AND cardinality(p_urls) = (
      SELECT count(DISTINCT image_reference.value)
      FROM unnest(p_urls) AS image_reference(value)
    );
$$;

COMMIT;
