-- 租户自行发布装修效果素材，由租户承担内容及版权责任，不代表平台审核。
-- 回退：关闭发布入口和公开目录，保留素材、命令及历史文件，使用后续 forward migration 修正。
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE public.tenant_rendering_styles
  DROP CONSTRAINT tenant_rendering_styles_status_check,
  ADD CONSTRAINT tenant_rendering_styles_status_check CHECK (status IN ('draft', 'published', 'hidden')),
  ADD COLUMN published_title text,
  ADD COLUMN published_space text,
  ADD COLUMN published_style text,
  ADD COLUMN published_color_notes text,
  ADD COLUMN published_material_notes text,
  ADD COLUMN published_source_type text,
  ADD COLUMN published_file_id uuid,
  ADD COLUMN published_version integer,
  ADD COLUMN published_at timestamptz,
  ADD COLUMN published_by_employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  ADD CONSTRAINT tenant_rendering_styles_published_file_fkey
    FOREIGN KEY (tenant_id, published_file_id) REFERENCES public.platform_file_objects (tenant_id, id) ON DELETE RESTRICT,
  ADD CONSTRAINT tenant_rendering_styles_snapshot_check CHECK (
    (published_title IS NULL AND published_space IS NULL AND published_style IS NULL
      AND published_color_notes IS NULL AND published_material_notes IS NULL AND published_source_type IS NULL
      AND published_file_id IS NULL AND published_version IS NULL AND published_at IS NULL
      AND published_by_employee_id IS NULL)
    OR (published_title IS NOT NULL AND published_space IS NOT NULL AND published_style IS NOT NULL
      AND published_color_notes IS NOT NULL AND published_material_notes IS NOT NULL AND published_source_type IS NOT NULL
      AND published_file_id IS NOT NULL AND published_version IS NOT NULL AND published_at IS NOT NULL)
  ),
  ADD CONSTRAINT tenant_rendering_styles_published_title_check
    CHECK (published_title = btrim(published_title) AND char_length(published_title) BETWEEN 1 AND 80),
  ADD CONSTRAINT tenant_rendering_styles_published_space_check CHECK (published_space IN ('living_room', 'bedroom')),
  ADD CONSTRAINT tenant_rendering_styles_published_style_check CHECK (published_style IN (
    'modern_simple', 'cream', 'new_chinese', 'nordic', 'light_luxury', 'natural_wood', 'american', 'french', 'wabi_sabi'
  )),
  ADD CONSTRAINT tenant_rendering_styles_published_color_notes_check CHECK (char_length(published_color_notes) <= 300),
  ADD CONSTRAINT tenant_rendering_styles_published_material_notes_check CHECK (char_length(published_material_notes) <= 300),
  ADD CONSTRAINT tenant_rendering_styles_published_source_type_check
    CHECK (published_source_type IN ('real_case', 'design', 'ai_concept')),
  ADD CONSTRAINT tenant_rendering_styles_published_version_check CHECK (published_version > 0 AND published_version <= version),
  ADD CONSTRAINT tenant_rendering_styles_draft_snapshot_check CHECK (status <> 'draft' OR published_version IS NULL),
  ADD CONSTRAINT tenant_rendering_styles_published_snapshot_check CHECK (status <> 'published' OR published_version IS NOT NULL);

CREATE INDEX tenant_rendering_styles_public_catalog_idx
  ON public.tenant_rendering_styles (tenant_id, published_space, published_style, sort_order, id)
  WHERE status = 'published' AND deleted_at IS NULL;

CREATE TABLE public.tenant_rendering_style_publish_commands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  style_id uuid NOT NULL,
  idempotency_key uuid NOT NULL,
  request_hash char(64) NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  expected_version integer NOT NULL CHECK (expected_version > 0 AND expected_version < 2147483647),
  public_file_id uuid NOT NULL,
  lease_token uuid NOT NULL,
  lease_expires_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'preparing' CHECK (status IN ('preparing', 'succeeded', 'failed')),
  result_version integer,
  failure_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CONSTRAINT tenant_rendering_publish_tenant_key UNIQUE (tenant_id, idempotency_key),
  CONSTRAINT tenant_rendering_publish_style_version_key UNIQUE (tenant_id, style_id, expected_version),
  CONSTRAINT tenant_rendering_publish_style_fkey
    FOREIGN KEY (tenant_id, style_id) REFERENCES public.tenant_rendering_styles (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT tenant_rendering_publish_file_fkey
    FOREIGN KEY (tenant_id, public_file_id) REFERENCES public.platform_file_objects (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT tenant_rendering_publish_result_check CHECK (
    (status = 'succeeded' AND result_version IS NOT NULL AND result_version = expected_version + 1
      AND completed_at IS NOT NULL AND failure_code IS NULL)
    OR (status = 'preparing' AND result_version IS NULL AND completed_at IS NULL AND failure_code IS NULL)
    OR (status = 'failed' AND result_version IS NULL AND completed_at IS NOT NULL
      AND failure_code IS NOT NULL AND failure_code IN ('copy_failed', 'storage_unavailable', 'commit_failed', 'not_publishable', 'version_conflict'))
  )
);

CREATE TRIGGER tr_tenant_rendering_publish_updated_at
  BEFORE UPDATE ON public.tenant_rendering_style_publish_commands
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
ALTER TABLE public.tenant_rendering_style_publish_commands ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.tenant_rendering_style_publish_commands FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.tenant_rendering_style_publish_commands TO service_role;

COMMENT ON TABLE public.tenant_rendering_styles IS '租户自助发布装修效果素材；当前可编辑资料与线上发布快照分离。';
COMMENT ON COLUMN public.tenant_rendering_styles.published_by_employee_id IS '发布时记录本租户员工；员工被删除后允许置空，不删除发布快照。';
COMMENT ON TABLE public.tenant_rendering_style_publish_commands IS '租户自行发布的幂等命令及短租约；外部复制可重试，不删除历史公开文件。';

-- 所有修改入口按素材 -> 命令 -> 文件 UUID 升序锁定；complete 在此之前锁发布人。
-- begin 额外先锁租户幂等键，
-- 防止不同素材并发使用同一个键触发唯一键异常。返回位置只供受信服务复制，禁止直接作为 HTTP DTO。
CREATE FUNCTION public.begin_tenant_rendering_style_publish(
  p_tenant_id uuid, p_style_id uuid, p_expected_version integer,
  p_idempotency_key uuid, p_request_hash text, p_lease_token uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_style public.tenant_rendering_styles%ROWTYPE;
  v_command public.tenant_rendering_style_publish_commands%ROWTYPE;
  v_source public.platform_file_objects%ROWTYPE;
  v_public public.platform_file_objects%ROWTYPE;
BEGIN
  IF p_tenant_id IS NULL OR p_style_id IS NULL OR p_idempotency_key IS NULL OR p_lease_token IS NULL
    OR p_expected_version IS NULL OR p_expected_version < 1 OR p_expected_version >= 2147483647
    OR p_request_hash IS NULL OR p_request_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN jsonb_build_object('decision', 'invalid_request');
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('rendering-publish:' || p_tenant_id::text || ':' || p_idempotency_key::text, 0));
  SELECT * INTO v_style FROM public.tenant_rendering_styles
    WHERE tenant_id = p_tenant_id AND id = p_style_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('decision', 'not_found'); END IF;
  SELECT * INTO v_command FROM public.tenant_rendering_style_publish_commands
    WHERE tenant_id = p_tenant_id AND idempotency_key = p_idempotency_key FOR UPDATE;
  IF FOUND THEN
    IF v_command.request_hash::text IS DISTINCT FROM p_request_hash OR v_command.style_id <> p_style_id
      OR v_command.expected_version <> p_expected_version THEN
      RETURN jsonb_build_object('decision', 'idempotency_conflict');
    END IF;
    IF v_command.status = 'succeeded' THEN
      RETURN jsonb_build_object('decision', 'succeeded', 'command_id', v_command.id, 'result_version', v_command.result_version);
    END IF;
    IF v_command.status = 'preparing' AND v_command.lease_expires_at > clock_timestamp() THEN
      RETURN jsonb_build_object('decision', 'in_progress');
    END IF;
    IF v_command.lease_token = p_lease_token THEN
      RETURN jsonb_build_object('decision', 'lease_conflict');
    END IF;
  END IF;
  IF v_style.deleted_at IS NOT NULL THEN RETURN jsonb_build_object('decision', 'not_found'); END IF;
  IF v_style.version <> p_expected_version OR (v_command.id IS NULL AND EXISTS (
    SELECT 1 FROM public.tenant_rendering_style_publish_commands
    WHERE tenant_id = p_tenant_id AND style_id = p_style_id AND expected_version = p_expected_version
  )) THEN RETURN jsonb_build_object('decision', 'version_conflict'); END IF;

  PERFORM id FROM public.platform_file_objects
    WHERE tenant_id = p_tenant_id AND id IN (v_style.file_id, v_command.public_file_id) ORDER BY id FOR UPDATE;
  SELECT * INTO v_source FROM public.platform_file_objects WHERE tenant_id = p_tenant_id AND id = v_style.file_id;
  IF (v_source.id IS NOT NULL AND v_source.status = 'active' AND v_source.deleted_at IS NULL
    AND v_source.visibility = 'private' AND v_source.scene = 'rendering_style_source'
    AND v_source.provider = 'tencent_cos' AND v_source.owner_type = 'tenant' AND v_source.owner_id = p_tenant_id
    AND v_source.mime_type = 'image/webp' AND v_source.size_bytes BETWEEN 1 AND 10485760
    AND v_source.width > 0 AND v_source.height > 0 AND v_source.width::bigint * v_source.height <= 16777216
    AND v_source.checksum ~ '^[0-9a-f]{64}$' AND v_source.bucket ~ '^[a-z0-9-]+-[0-9]+$'
    AND char_length(v_source.region) <= 63 AND v_source.region ~ '^[a-z]+(-[a-z0-9]+)+$'
    AND v_source.public_url IS NULL AND v_source.legacy_url IS NULL AND v_source.legacy_path IS NULL
    AND v_source.object_key = 'private/renovation-styles/' || p_tenant_id::text || '/' || v_source.id::text || '.webp'
    AND v_style.rights_confirmed = true) IS NOT TRUE THEN
    RETURN jsonb_build_object('decision', 'not_publishable');
  END IF;
  IF v_command.id IS NULL THEN
    INSERT INTO public.platform_file_objects (
      tenant_id, owner_type, owner_id, scene, provider, bucket, region, object_key,
      mime_type, size_bytes, width, height, checksum, visibility, status, metadata
    ) VALUES (
      p_tenant_id, 'tenant', p_tenant_id, 'rendering_style_public', 'tencent_cos', v_source.bucket, v_source.region,
      'public/renovation-styles/' || p_tenant_id::text || '/' || p_style_id::text || '/' || (p_expected_version + 1)::text || '.webp',
      'image/webp', v_source.size_bytes, v_source.width, v_source.height, v_source.checksum, 'public', 'migrating',
      jsonb_build_object('source_file_id', v_source.id)
    ) RETURNING * INTO v_public;
    INSERT INTO public.tenant_rendering_style_publish_commands (
      tenant_id, style_id, idempotency_key, request_hash, expected_version, public_file_id, lease_token, lease_expires_at
    ) VALUES (
      p_tenant_id, p_style_id, p_idempotency_key, p_request_hash, p_expected_version,
      v_public.id, p_lease_token, clock_timestamp() + interval '120 seconds'
    ) RETURNING * INTO v_command;
  ELSE
    SELECT * INTO v_public FROM public.platform_file_objects WHERE tenant_id = p_tenant_id AND id = v_command.public_file_id;
    IF (v_public.id IS NOT NULL AND v_public.status = 'migrating' AND v_public.deleted_at IS NULL
      AND v_public.visibility = 'public' AND v_public.scene = 'rendering_style_public'
      AND v_public.provider = 'tencent_cos' AND v_public.owner_type = 'tenant' AND v_public.owner_id = p_tenant_id
      AND v_public.mime_type = 'image/webp' AND v_public.bucket = v_source.bucket AND v_public.region = v_source.region
      AND v_public.size_bytes = v_source.size_bytes AND v_public.checksum = v_source.checksum
      AND v_public.width = v_source.width AND v_public.height = v_source.height
      AND v_public.public_url IS NULL AND v_public.legacy_url IS NULL AND v_public.legacy_path IS NULL
      AND v_public.metadata->>'source_file_id' = v_source.id::text
      AND v_public.object_key = 'public/renovation-styles/' || p_tenant_id::text || '/' || p_style_id::text || '/' || (p_expected_version + 1)::text || '.webp'
    ) IS NOT TRUE THEN RETURN jsonb_build_object('decision', 'not_publishable'); END IF;
    UPDATE public.tenant_rendering_style_publish_commands
      SET status = 'preparing', lease_token = p_lease_token, lease_expires_at = clock_timestamp() + interval '120 seconds',
        failure_code = NULL, completed_at = NULL
      WHERE id = v_command.id;
  END IF;
  RETURN jsonb_build_object('decision', 'claimed', 'command_id', v_command.id, 'public_file_id', v_public.id,
    'source_file_id', v_source.id, 'source_location', jsonb_build_object('bucket', v_source.bucket, 'region', v_source.region, 'object_key', v_source.object_key),
    'public_location', jsonb_build_object('bucket', v_public.bucket, 'region', v_public.region, 'object_key', v_public.object_key),
    'source_checksum', v_source.checksum, 'source_size_bytes', v_source.size_bytes, 'target_version', p_expected_version + 1);
END;
$$;

CREATE FUNCTION public.complete_tenant_rendering_style_publish(
  p_tenant_id uuid, p_command_id uuid, p_lease_token uuid, p_public_url text, p_employee_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_style_id uuid;
  v_style public.tenant_rendering_styles%ROWTYPE;
  v_command public.tenant_rendering_style_publish_commands%ROWTYPE;
  v_source public.platform_file_objects%ROWTYPE;
  v_public public.platform_file_objects%ROWTYPE;
  v_now timestamptz;
  v_employee_valid boolean;
BEGIN
  SELECT style_id INTO v_style_id FROM public.tenant_rendering_style_publish_commands
    WHERE tenant_id = p_tenant_id AND id = p_command_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('decision', 'not_found'); END IF;
  -- 员工删除会通过 FK 更新素材；先锁员工可避免反向锁竞争，FOR SHARE 同时固定租户及状态。
  -- 已成功命令仍可重放，发布人有效性只对尚未完成的命令生效。
  PERFORM id FROM public.employees WHERE tenant_id = p_tenant_id AND id = p_employee_id AND status = 'active' FOR SHARE;
  v_employee_valid := FOUND;
  SELECT * INTO v_style FROM public.tenant_rendering_styles WHERE tenant_id = p_tenant_id AND id = v_style_id FOR UPDATE;
  SELECT * INTO v_command FROM public.tenant_rendering_style_publish_commands
    WHERE tenant_id = p_tenant_id AND id = p_command_id FOR UPDATE;
  IF v_command.lease_token IS DISTINCT FROM p_lease_token THEN
    RETURN jsonb_build_object('decision', 'lease_conflict');
  END IF;
  IF v_command.status = 'succeeded' THEN
    RETURN jsonb_build_object('decision', 'succeeded', 'command_id', v_command.id, 'result_version', v_command.result_version);
  END IF;
  IF v_command.status <> 'preparing' OR v_command.lease_expires_at <= clock_timestamp() THEN
    RETURN jsonb_build_object('decision', 'lease_conflict');
  END IF;
  IF v_style.id IS NULL OR v_style.deleted_at IS NOT NULL THEN RETURN jsonb_build_object('decision', 'not_found'); END IF;
  IF v_style.version <> v_command.expected_version THEN RETURN jsonb_build_object('decision', 'version_conflict'); END IF;
  IF NOT v_employee_valid THEN RETURN jsonb_build_object('decision', 'not_publishable'); END IF;
  PERFORM id FROM public.platform_file_objects
    WHERE tenant_id = p_tenant_id AND id IN (v_style.file_id, v_command.public_file_id) ORDER BY id FOR UPDATE;
  SELECT * INTO v_source FROM public.platform_file_objects WHERE tenant_id = p_tenant_id AND id = v_style.file_id;
  SELECT * INTO v_public FROM public.platform_file_objects WHERE tenant_id = p_tenant_id AND id = v_command.public_file_id;
  IF (v_source.id IS NOT NULL AND v_source.status = 'active' AND v_source.deleted_at IS NULL
    AND v_source.visibility = 'private' AND v_source.scene = 'rendering_style_source'
    AND v_source.provider = 'tencent_cos' AND v_source.owner_type = 'tenant' AND v_source.owner_id = p_tenant_id
    AND v_source.mime_type = 'image/webp' AND v_source.size_bytes BETWEEN 1 AND 10485760
    AND v_source.width > 0 AND v_source.height > 0 AND v_source.width::bigint * v_source.height <= 16777216
    AND v_source.checksum ~ '^[0-9a-f]{64}$' AND v_source.bucket ~ '^[a-z0-9-]+-[0-9]+$'
    AND char_length(v_source.region) <= 63 AND v_source.region ~ '^[a-z]+(-[a-z0-9]+)+$'
    AND v_source.public_url IS NULL AND v_source.legacy_url IS NULL AND v_source.legacy_path IS NULL
    AND v_source.object_key = 'private/renovation-styles/' || p_tenant_id::text || '/' || v_source.id::text || '.webp'
    AND v_style.rights_confirmed = true
    AND v_public.id IS NOT NULL AND v_public.id <> v_source.id AND v_public.status = 'migrating' AND v_public.deleted_at IS NULL
    AND v_public.visibility = 'public' AND v_public.scene = 'rendering_style_public'
    AND v_public.provider = 'tencent_cos' AND v_public.owner_type = 'tenant' AND v_public.owner_id = p_tenant_id
    AND v_public.mime_type = 'image/webp' AND v_public.bucket = v_source.bucket AND v_public.region = v_source.region
    AND v_public.size_bytes = v_source.size_bytes AND v_public.checksum = v_source.checksum
    AND v_public.width = v_source.width AND v_public.height = v_source.height
    AND v_public.public_url IS NULL AND v_public.legacy_url IS NULL AND v_public.legacy_path IS NULL
    AND v_public.metadata->>'source_file_id' = v_source.id::text
    AND v_public.object_key = 'public/renovation-styles/' || p_tenant_id::text || '/' || v_style.id::text || '/' || (v_command.expected_version + 1)::text || '.webp'
  ) IS NOT TRUE THEN RETURN jsonb_build_object('decision', 'not_publishable'); END IF;

  -- SQL 只验证 HTTPS/长度/字符以及确定性对象路径；PLATFORM_COS_PUBLIC_BASE_URL 可配置 CDN。
  -- host 与服务端配置、bucket/region 的精确匹配由受信 gateway/service 验证，不能接受 HTTP 客户端 URL。
  IF p_public_url IS NULL OR char_length(p_public_url) > 2048 OR p_public_url !~ '^https://'
    OR p_public_url ~ '[[:space:][:cntrl:]?#\\]' OR p_public_url !~ '^https://[a-zA-Z0-9.-]+(:[0-9]{1,5})?/'
    OR right(p_public_url, char_length(v_public.object_key) + 1) <> '/' || v_public.object_key THEN
    RETURN jsonb_build_object('decision', 'not_publishable');
  END IF;
  v_now := clock_timestamp();
  UPDATE public.platform_file_objects
    SET status = 'active', visibility = 'public', public_url = p_public_url, created_by_employee_id = p_employee_id
    WHERE tenant_id = p_tenant_id AND id = v_command.public_file_id;
  UPDATE public.tenant_rendering_styles SET
    published_title = v_style.title, published_space = v_style.space, published_style = v_style.style,
    published_color_notes = v_style.color_notes, published_material_notes = v_style.material_notes,
    published_source_type = v_style.source_type, published_file_id = v_command.public_file_id,
    published_version = v_style.version + 1, published_at = v_now, published_by_employee_id = p_employee_id,
    status = 'published', version = v_style.version + 1
    WHERE tenant_id = p_tenant_id AND id = v_style.id;
  UPDATE public.tenant_rendering_style_publish_commands
    SET status = 'succeeded', result_version = v_style.version + 1, completed_at = v_now, failure_code = NULL
    WHERE tenant_id = p_tenant_id AND id = v_command.id;
  RETURN jsonb_build_object('decision', 'succeeded', 'command_id', v_command.id, 'result_version', v_style.version + 1);
END;
$$;

CREATE FUNCTION public.fail_tenant_rendering_style_publish(
  p_tenant_id uuid, p_command_id uuid, p_lease_token uuid, p_failure_code text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_style_id uuid;
  v_command public.tenant_rendering_style_publish_commands%ROWTYPE;
BEGIN
  IF p_failure_code IS NULL OR p_failure_code NOT IN ('copy_failed', 'storage_unavailable', 'commit_failed', 'not_publishable', 'version_conflict') THEN
    RETURN jsonb_build_object('decision', 'invalid_request');
  END IF;
  SELECT style_id INTO v_style_id FROM public.tenant_rendering_style_publish_commands
    WHERE tenant_id = p_tenant_id AND id = p_command_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('decision', 'not_found'); END IF;
  PERFORM id FROM public.tenant_rendering_styles WHERE tenant_id = p_tenant_id AND id = v_style_id FOR UPDATE;
  SELECT * INTO v_command FROM public.tenant_rendering_style_publish_commands
    WHERE tenant_id = p_tenant_id AND id = p_command_id FOR UPDATE;
  IF v_command.lease_token IS DISTINCT FROM p_lease_token THEN RETURN jsonb_build_object('decision', 'lease_conflict'); END IF;
  IF v_command.status = 'succeeded' THEN
    RETURN jsonb_build_object('decision', 'succeeded', 'command_id', v_command.id, 'result_version', v_command.result_version);
  END IF;
  IF v_command.status = 'failed' THEN RETURN jsonb_build_object('decision', 'failed'); END IF;
  UPDATE public.tenant_rendering_style_publish_commands
    SET status = 'failed', failure_code = p_failure_code, completed_at = clock_timestamp()
    WHERE tenant_id = p_tenant_id AND id = v_command.id AND status = 'preparing';
  RETURN jsonb_build_object('decision', 'failed');
END;
$$;

REVOKE ALL ON FUNCTION public.begin_tenant_rendering_style_publish(uuid, uuid, integer, uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.begin_tenant_rendering_style_publish(uuid, uuid, integer, uuid, text, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.complete_tenant_rendering_style_publish(uuid, uuid, uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_tenant_rendering_style_publish(uuid, uuid, uuid, text, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.fail_tenant_rendering_style_publish(uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fail_tenant_rendering_style_publish(uuid, uuid, uuid, text) TO service_role;

UPDATE public.permissions SET description = '查看当前租户装修效果素材及发布状态'
  WHERE code = 'rendering_library.read';
UPDATE public.permissions SET description = '管理当前租户装修效果素材，自行发布、重新发布及隐藏'
  WHERE code = 'rendering_library.manage';

COMMIT;
