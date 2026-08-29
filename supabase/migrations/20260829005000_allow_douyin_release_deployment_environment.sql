BEGIN;

-- Keep the persisted release envelope aligned with the upload RPC. Existing
-- releases may omit deployment_environment; new releases pin it server-side.
ALTER TABLE public.douyin_miniapp_releases
  DROP CONSTRAINT IF EXISTS douyin_miniapp_releases_ext_json_check;

ALTER TABLE public.douyin_miniapp_releases
  ADD CONSTRAINT douyin_miniapp_releases_ext_json_check CHECK (
    jsonb_typeof(ext_json) = 'object'
    AND ext_json ?& ARRAY['extEnable', 'extAppid', 'ext']::text[]
    AND ext_json - ARRAY['extEnable', 'extAppid', 'ext']::text[] = '{}'::jsonb
    AND ext_json -> 'extEnable' = 'true'::jsonb
    AND jsonb_typeof(ext_json -> 'extAppid') = 'string'
    AND length(ext_json ->> 'extAppid') BETWEEN 1 AND 128
    AND ext_json ->> 'extAppid' = btrim(ext_json ->> 'extAppid')
    AND jsonb_typeof(ext_json -> 'ext') = 'object'
    AND ext_json -> 'ext' ? 'deployment_key'
    AND (ext_json -> 'ext')
      - ARRAY['deployment_key', 'deployment_environment']::text[] = '{}'::jsonb
    AND jsonb_typeof(ext_json -> 'ext' -> 'deployment_key') = 'string'
    AND length(ext_json -> 'ext' ->> 'deployment_key') BETWEEN 1 AND 128
    AND ext_json -> 'ext' ->> 'deployment_key'
      = btrim(ext_json -> 'ext' ->> 'deployment_key')
    AND (
      NOT (ext_json -> 'ext' ? 'deployment_environment')
      OR (
        jsonb_typeof(ext_json -> 'ext' -> 'deployment_environment') = 'string'
        AND ext_json -> 'ext' ->> 'deployment_environment'
          = ANY(ARRAY['development', 'production']::text[])
      )
    )
  ) NOT VALID;

ALTER TABLE public.douyin_miniapp_releases
  VALIDATE CONSTRAINT douyin_miniapp_releases_ext_json_check;

COMMIT;

-- Rollback: restore douyin_miniapp_releases_ext_json_check from
-- 20260719102000_create_douyin_miniapp_releases.sql only after deploying an API
-- that no longer persists ext.deployment_environment.
