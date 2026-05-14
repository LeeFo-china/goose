CREATE TABLE IF NOT EXISTS public.platform_file_objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NULL REFERENCES public.tenants(id) ON DELETE SET NULL,
  owner_type text NOT NULL,
  owner_id uuid NULL,
  scene text NOT NULL,
  provider text NOT NULL DEFAULT 'tencent_cos',
  bucket text NOT NULL,
  region text NULL,
  object_key text NOT NULL,
  original_name text NULL,
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL DEFAULT 0,
  width integer NULL,
  height integer NULL,
  checksum text NULL,
  visibility text NOT NULL DEFAULT 'public',
  public_url text NULL,
  legacy_url text NULL,
  legacy_path text NULL,
  status text NOT NULL DEFAULT 'active',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by_auth_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_employee_id uuid NULL REFERENCES public.employees(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL,
  CONSTRAINT platform_file_objects_owner_type_not_blank
    CHECK (btrim(owner_type) <> ''),
  CONSTRAINT platform_file_objects_scene_not_blank
    CHECK (btrim(scene) <> ''),
  CONSTRAINT platform_file_objects_provider_check
    CHECK (provider IN ('tencent_cos', 'supabase_storage')),
  CONSTRAINT platform_file_objects_object_key_not_blank
    CHECK (btrim(object_key) <> ''),
  CONSTRAINT platform_file_objects_mime_type_not_blank
    CHECK (btrim(mime_type) <> ''),
  CONSTRAINT platform_file_objects_size_bytes_check
    CHECK (size_bytes >= 0),
  CONSTRAINT platform_file_objects_dimensions_check
    CHECK (
      (width IS NULL OR width > 0)
      AND (height IS NULL OR height > 0)
    ),
  CONSTRAINT platform_file_objects_visibility_check
    CHECK (visibility IN ('public', 'private', 'signed')),
  CONSTRAINT platform_file_objects_status_check
    CHECK (status IN ('active', 'deleted', 'migrating', 'failed')),
  CONSTRAINT platform_file_objects_metadata_object_check
    CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_platform_file_objects_provider_bucket_key
ON public.platform_file_objects(provider, bucket, object_key)
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_platform_file_objects_tenant_scene_created_at
ON public.platform_file_objects(tenant_id, scene, created_at DESC)
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_platform_file_objects_owner
ON public.platform_file_objects(owner_type, owner_id)
WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS tr_platform_file_objects_updated_at
ON public.platform_file_objects;

CREATE TRIGGER tr_platform_file_objects_updated_at
BEFORE UPDATE ON public.platform_file_objects
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE public.platform_file_objects IS '平台统一文件对象索引。第一阶段用于记录 COS/Supabase 上传文件，后续承接历史迁移。';
COMMENT ON COLUMN public.platform_file_objects.provider IS '存储提供商：tencent_cos/supabase_storage。';
COMMENT ON COLUMN public.platform_file_objects.object_key IS '对象存储 key 或 Supabase Storage path，不包含域名。';
COMMENT ON COLUMN public.platform_file_objects.public_url IS '稳定公网/CDN URL；不保存短期 signed URL。';
COMMENT ON COLUMN public.platform_file_objects.legacy_url IS '历史公网 URL，迁移回滚和对账使用。';
COMMENT ON COLUMN public.platform_file_objects.legacy_path IS '历史 Supabase Storage path，迁移回滚和对账使用。';
