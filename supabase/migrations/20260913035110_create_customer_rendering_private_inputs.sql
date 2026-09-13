BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE TABLE public.customer_rendering_inputs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  channel text NOT NULL CHECK (channel IN ('wechat', 'douyin')),
  subject_key_version smallint NOT NULL CHECK (subject_key_version > 0),
  subject_digest text NOT NULL CHECK (subject_digest ~ '^[0-9a-f]{64}$'),
  application_id text,
  installation_id uuid,
  purpose text NOT NULL CHECK (purpose IN ('room', 'floor_plan')),
  declared_mime_type text NOT NULL CHECK (declared_mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
  declared_size_bytes integer NOT NULL CHECK (declared_size_bytes BETWEEN 1 AND 10485760),
  -- Both objects retain the issued storage location when server configuration changes.
  bucket text NOT NULL CHECK (btrim(bucket) <> ''),
  region text NOT NULL CHECK (btrim(region) <> ''),
  raw_object_key text NOT NULL UNIQUE,
  normalized_object_key text UNIQUE,
  normalized_size_bytes integer CHECK (normalized_size_bytes BETWEEN 1 AND 10485760),
  width integer CHECK (width > 0),
  height integer CHECK (height > 0),
  checksum text CHECK (checksum ~ '^[0-9a-f]{64}$'),
  status text NOT NULL DEFAULT 'issued' CHECK (status IN ('issued', 'processing', 'pending_review', 'approved', 'rejected', 'failed', 'deleted')),
  expires_at timestamptz NOT NULL,
  processing_lease_expires_at timestamptz,
  raw_cleanup_after timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  raw_deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customer_rendering_inputs_tenant_id_key UNIQUE (tenant_id, id),
  CONSTRAINT customer_rendering_inputs_scope_check CHECK (
    (channel = 'wechat' AND application_id IS NULL AND installation_id IS NULL)
    OR (channel = 'douyin' AND application_id IS NOT NULL AND installation_id IS NOT NULL)
  ),
  CONSTRAINT customer_rendering_inputs_normalized_check CHECK (
    status NOT IN ('pending_review', 'approved')
    OR (normalized_object_key IS NOT NULL AND normalized_size_bytes IS NOT NULL
      AND width IS NOT NULL AND height IS NOT NULL AND checksum IS NOT NULL)
  ),
  CONSTRAINT customer_rendering_inputs_processing_lease_check CHECK (
    status <> 'processing' OR processing_lease_expires_at IS NOT NULL
  )
);

CREATE INDEX customer_rendering_inputs_owner_idx
  ON public.customer_rendering_inputs (tenant_id, channel, subject_key_version, subject_digest, created_at DESC, id);
CREATE INDEX customer_rendering_inputs_raw_cleanup_idx
  ON public.customer_rendering_inputs (raw_cleanup_after, id)
  WHERE raw_deleted_at IS NULL;
CREATE TRIGGER tr_customer_rendering_inputs_updated_at
  BEFORE UPDATE ON public.customer_rendering_inputs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.customer_rendering_inputs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.customer_rendering_inputs FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.customer_rendering_inputs TO service_role;
COMMIT;
