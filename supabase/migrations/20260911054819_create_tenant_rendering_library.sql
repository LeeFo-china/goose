-- Tenant-private draft foundation only. This migration does not publish assets.
-- Rollback: disable the library entry, preserve draft/file data, and use a new
-- forward migration for any permission or schema correction; do not drop data.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE UNIQUE INDEX rendering_file_tenant_id_key
  ON public.platform_file_objects (tenant_id, id);

CREATE TABLE public.tenant_rendering_styles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  title text NOT NULL,
  space text NOT NULL,
  style text NOT NULL,
  color_notes text NOT NULL DEFAULT '',
  material_notes text NOT NULL DEFAULT '',
  source_type text NOT NULL,
  rights_confirmed boolean NOT NULL,
  file_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  sort_order integer NOT NULL DEFAULT 0,
  version integer NOT NULL DEFAULT 1,
  created_by_employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT tenant_rendering_styles_tenant_id_key UNIQUE (tenant_id, id),
  CONSTRAINT tenant_rendering_styles_tenant_file_fkey
    FOREIGN KEY (tenant_id, file_id)
    REFERENCES public.platform_file_objects (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT tenant_rendering_styles_title_check
    CHECK (title = btrim(title) AND char_length(title) BETWEEN 1 AND 80),
  CONSTRAINT tenant_rendering_styles_space_check
    CHECK (space IN ('living_room', 'bedroom')),
  CONSTRAINT tenant_rendering_styles_style_check
    CHECK (style IN (
      'modern_simple', 'cream', 'new_chinese', 'nordic', 'light_luxury',
      'natural_wood', 'american', 'french', 'wabi_sabi'
    )),
  CONSTRAINT tenant_rendering_styles_color_notes_check CHECK (char_length(color_notes) <= 300),
  CONSTRAINT tenant_rendering_styles_material_notes_check CHECK (char_length(material_notes) <= 300),
  CONSTRAINT tenant_rendering_styles_source_type_check
    CHECK (source_type IN ('real_case', 'design', 'ai_concept')),
  CONSTRAINT tenant_rendering_styles_rights_confirmed_check CHECK (rights_confirmed = true),
  CONSTRAINT tenant_rendering_styles_status_check CHECK (status IN ('draft', 'hidden')),
  CONSTRAINT tenant_rendering_styles_sort_order_check CHECK (sort_order BETWEEN 0 AND 100000),
  CONSTRAINT tenant_rendering_styles_version_check CHECK (version > 0)
);

CREATE INDEX tenant_rendering_styles_list_idx
  ON public.tenant_rendering_styles (tenant_id, sort_order, id)
  WHERE deleted_at IS NULL;

CREATE INDEX tenant_rendering_styles_filter_idx
  ON public.tenant_rendering_styles (tenant_id, status, space, style, sort_order, id)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX tenant_rendering_styles_active_file_key
  ON public.tenant_rendering_styles (tenant_id, file_id)
  WHERE deleted_at IS NULL;

CREATE TRIGGER tr_tenant_rendering_styles_updated_at
  BEFORE UPDATE ON public.tenant_rendering_styles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.tenant_rendering_styles ENABLE ROW LEVEL SECURITY;
-- No anon/authenticated policies: API service code enforces tenant permissions.
REVOKE ALL ON TABLE public.tenant_rendering_styles FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.tenant_rendering_styles TO service_role;

COMMENT ON TABLE public.tenant_rendering_styles IS '租户私有装修效果素材草稿，仅支持草稿和隐藏状态，不对客户发布。';
COMMENT ON COLUMN public.tenant_rendering_styles.file_id IS '同租户私有原图文件；应用层校验 rendering_style_source 场景和文件归属。';
COMMENT ON COLUMN public.tenant_rendering_styles.version IS '乐观锁版本；更新、隐藏及软删除时由应用层原子递增。';

INSERT INTO public.permissions (code, name, module, resource, action, description, status)
VALUES
  ('rendering_library.read', '查看装修效果素材', 'rendering_library', 'rendering_library', 'read', '查看当前租户私有装修效果素材草稿', 'active'),
  ('rendering_library.manage', '管理装修效果素材', 'rendering_library', 'rendering_library', 'manage', '管理当前租户私有装修效果素材草稿', 'active')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id, access_scope)
SELECT roles.id, permissions.id, 'all'
FROM public.roles AS roles
JOIN public.permissions AS permissions
  ON permissions.code IN ('rendering_library.read', 'rendering_library.manage')
WHERE roles.code = 'system_admin'
  AND roles.status = 'active'
  AND roles.tenant_id IS NOT NULL
  AND permissions.status = 'active'
ON CONFLICT (role_id, permission_id) DO NOTHING;

COMMIT;
