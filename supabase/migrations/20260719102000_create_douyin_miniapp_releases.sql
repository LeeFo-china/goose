-- Persist safe Douyin miniapp package delivery metadata. Provider response
-- bodies and credentials must never be stored in this ledger.
-- Rollback: stop release operations, then drop this table; installations and
-- previously published packages on Douyin are intentionally unaffected.
BEGIN;

CREATE TABLE public.douyin_miniapp_releases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  installation_id uuid NOT NULL
    REFERENCES public.douyin_miniapp_installations(id) ON DELETE RESTRICT,
  template_id text NOT NULL,
  template_version text NOT NULL,
  description text NOT NULL,
  channel text NOT NULL DEFAULT 'default',
  ext_json jsonb NOT NULL,
  status text NOT NULL DEFAULT 'created',
  douyin_log_id text NULL,
  test_qr_url text NULL,
  audit_host_names text[] NOT NULL DEFAULT ARRAY[]::text[],
  audit_note text NULL,
  audit_result jsonb NULL,
  submitted_at timestamptz NULL,
  audited_at timestamptz NULL,
  released_at timestamptz NULL,
  platform_operator_id uuid NOT NULL
    REFERENCES public.employees(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT douyin_miniapp_releases_template_id_check
    CHECK (template_id ~ '^[1-9][0-9]{0,18}$'),
  CONSTRAINT douyin_miniapp_releases_template_version_check CHECK (
    length(template_version) <= 64
    AND template_version ~
      '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-(0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*)(\.(0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*))*)?(\+[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?$'
  ),
  CONSTRAINT douyin_miniapp_releases_description_check
    CHECK (description = btrim(description) AND length(description) BETWEEN 1 AND 200),
  CONSTRAINT douyin_miniapp_releases_channel_check
    CHECK (channel IN ('default', '1')),
  CONSTRAINT douyin_miniapp_releases_status_check CHECK (
    status IN (
      'created',
      'uploaded',
      'testing',
      'audit_pending',
      'audit_rejected',
      'audit_approved',
      'released',
      'failed'
    )
  ),
  CONSTRAINT douyin_miniapp_releases_ext_json_check CHECK (
    jsonb_typeof(ext_json) = 'object'
    AND ext_json ?& ARRAY['extEnable', 'extAppid', 'ext']::text[]
    AND ext_json - ARRAY['extEnable', 'extAppid', 'ext']::text[] = '{}'::jsonb
    AND ext_json -> 'extEnable' = 'true'::jsonb
    AND jsonb_typeof(ext_json -> 'extAppid') = 'string'
    AND length(ext_json ->> 'extAppid') BETWEEN 1 AND 128
    AND (ext_json ->> 'extAppid') = btrim(ext_json ->> 'extAppid')
    AND jsonb_typeof(ext_json -> 'ext') = 'object'
    AND ext_json -> 'ext' ? 'deployment_key'
    AND ext_json -> 'ext' - 'deployment_key' = '{}'::jsonb
    AND jsonb_typeof(ext_json -> 'ext' -> 'deployment_key') = 'string'
    AND length(ext_json -> 'ext' ->> 'deployment_key') BETWEEN 1 AND 128
    AND (ext_json -> 'ext' ->> 'deployment_key')
      = btrim(ext_json -> 'ext' ->> 'deployment_key')
  ),
  CONSTRAINT douyin_miniapp_releases_log_id_check
    CHECK (douyin_log_id IS NULL OR douyin_log_id ~ '^[A-Za-z0-9._:-]{1,128}$'),
  CONSTRAINT douyin_miniapp_releases_test_qr_url_check CHECK (
    test_qr_url IS NULL
    OR (
      length(test_qr_url) <= 2048
      AND test_qr_url ~ '^https://[^[:space:]]+$'
      AND position('@' IN test_qr_url) = 0
    )
  ),
  CONSTRAINT douyin_miniapp_releases_audit_host_names_check CHECK (
    cardinality(audit_host_names) <= 20
    AND array_position(audit_host_names, NULL) IS NULL
    AND array_position(audit_host_names, '') IS NULL
    AND octet_length(array_to_string(audit_host_names, ',')) <= 4096
    AND array_to_string(audit_host_names, ',')
      ~ '^(|[A-Za-z0-9.-]{1,253}(,[A-Za-z0-9.-]{1,253})*)$'
    AND array_to_string(audit_host_names, ',') !~* '(token|secret|phone|openid)'
  ),
  CONSTRAINT douyin_miniapp_releases_audit_note_check CHECK (
    audit_note IS NULL
    OR (
      audit_note = btrim(audit_note)
      AND length(audit_note) BETWEEN 1 AND 1000
      AND audit_note !~* '(token|secret|phone|openid)'
    )
  ),
  CONSTRAINT douyin_miniapp_releases_audit_result_check CHECK (
    audit_result IS NULL
    OR (
      jsonb_typeof(audit_result) = 'object'
      AND octet_length(audit_result::text) <= 4096
      AND audit_result
        - ARRAY['audit_id', 'status', 'reason', 'error_code']::text[] = '{}'::jsonb
      AND (
        NOT audit_result ? 'audit_id'
        OR (
          jsonb_typeof(audit_result -> 'audit_id') = 'string'
          AND audit_result ->> 'audit_id' ~ '^[A-Za-z0-9._:-]{1,128}$'
        )
      )
      AND (
        NOT audit_result ? 'status'
        OR audit_result ->> 'status' IN ('pending', 'approved', 'rejected', 'failed')
      )
      AND (
        NOT audit_result ? 'reason'
        OR (
          jsonb_typeof(audit_result -> 'reason') = 'string'
          AND length(audit_result ->> 'reason') BETWEEN 1 AND 1000
        )
      )
      AND (
        NOT audit_result ? 'error_code'
        OR (
          jsonb_typeof(audit_result -> 'error_code') = 'string'
          AND audit_result ->> 'error_code' ~ '^[A-Z0-9_:-]{1,128}$'
        )
      )
      AND audit_result::text !~* '(token|secret|phone|openid)'
    )
  ),
  CONSTRAINT douyin_miniapp_releases_timestamps_check CHECK (
    (audited_at IS NULL OR submitted_at IS NOT NULL)
    AND (released_at IS NULL OR (submitted_at IS NOT NULL AND audited_at IS NOT NULL))
    AND (status <> 'audit_pending' OR submitted_at IS NOT NULL)
    AND (status NOT IN ('audit_rejected', 'audit_approved') OR audited_at IS NOT NULL)
    AND (status <> 'released' OR released_at IS NOT NULL)
    AND (released_at IS NULL OR status = 'released')
  )
);

CREATE INDEX douyin_miniapp_releases_installation_created_idx
ON public.douyin_miniapp_releases(installation_id, created_at DESC, id DESC);

CREATE INDEX douyin_miniapp_releases_status_updated_idx
ON public.douyin_miniapp_releases(status, updated_at DESC);

CREATE TRIGGER tr_douyin_miniapp_releases_updated_at
  BEFORE UPDATE ON public.douyin_miniapp_releases
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.douyin_miniapp_releases ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.douyin_miniapp_releases
FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT, INSERT, UPDATE ON TABLE public.douyin_miniapp_releases
TO service_role;

COMMIT;
