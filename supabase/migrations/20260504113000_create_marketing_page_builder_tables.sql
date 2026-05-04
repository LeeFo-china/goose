CREATE TABLE IF NOT EXISTS public.marketing_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  slug text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  description text NULL,
  cover_image text NULL,
  published_version_id uuid NULL,
  created_by uuid NULL REFERENCES public.employees(id) ON DELETE SET NULL,
  updated_by uuid NULL REFERENCES public.employees(id) ON DELETE SET NULL,
  published_by uuid NULL REFERENCES public.employees(id) ON DELETE SET NULL,
  published_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT marketing_pages_title_not_blank CHECK (btrim(title) <> ''),
  CONSTRAINT marketing_pages_slug_not_blank CHECK (btrim(slug) <> ''),
  CONSTRAINT marketing_pages_slug_format_check CHECK (
    slug ~ '^[a-z0-9]([a-z0-9-]{0,78}[a-z0-9])?$'
  ),
  CONSTRAINT marketing_pages_status_check CHECK (
    status = ANY (
      ARRAY[
        'draft'::text,
        'published'::text,
        'offline'::text,
        'archived'::text
      ]
    )
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_marketing_pages_slug
ON public.marketing_pages(slug);

CREATE INDEX IF NOT EXISTS idx_marketing_pages_status
ON public.marketing_pages(status);

CREATE INDEX IF NOT EXISTS idx_marketing_pages_published_version_id
ON public.marketing_pages(published_version_id);

CREATE INDEX IF NOT EXISTS idx_marketing_pages_updated_at
ON public.marketing_pages(updated_at DESC);

DROP TRIGGER IF EXISTS tr_marketing_pages_updated_at ON public.marketing_pages;
CREATE TRIGGER tr_marketing_pages_updated_at
BEFORE UPDATE ON public.marketing_pages
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.marketing_page_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id uuid NOT NULL REFERENCES public.marketing_pages(id) ON DELETE CASCADE,
  version_no integer NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  schema_version integer NOT NULL DEFAULT 1,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid NULL REFERENCES public.employees(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz NULL,
  CONSTRAINT marketing_page_versions_version_no_positive CHECK (version_no > 0),
  CONSTRAINT marketing_page_versions_schema_version_positive CHECK (schema_version > 0),
  CONSTRAINT marketing_page_versions_config_object_check CHECK (jsonb_typeof(config) = 'object'),
  CONSTRAINT marketing_page_versions_status_check CHECK (
    status = ANY (
      ARRAY[
        'draft'::text,
        'published'::text,
        'archived'::text
      ]
    )
  ),
  UNIQUE(page_id, version_no)
);

CREATE INDEX IF NOT EXISTS idx_marketing_page_versions_page_id
ON public.marketing_page_versions(page_id);

CREATE INDEX IF NOT EXISTS idx_marketing_page_versions_status
ON public.marketing_page_versions(status);

CREATE UNIQUE INDEX IF NOT EXISTS idx_marketing_page_versions_one_draft
ON public.marketing_page_versions(page_id)
WHERE status = 'draft';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'marketing_pages_published_version_id_fkey'
  ) THEN
    ALTER TABLE public.marketing_pages
      ADD CONSTRAINT marketing_pages_published_version_id_fkey
      FOREIGN KEY (published_version_id)
      REFERENCES public.marketing_page_versions(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.marketing_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_url text NOT NULL,
  file_name text NULL,
  mime_type text NULL,
  file_size integer NULL,
  width integer NULL,
  height integer NULL,
  created_by uuid NULL REFERENCES public.employees(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT marketing_assets_file_url_not_blank CHECK (btrim(file_url) <> ''),
  CONSTRAINT marketing_assets_file_size_positive CHECK (file_size IS NULL OR file_size >= 0),
  CONSTRAINT marketing_assets_width_positive CHECK (width IS NULL OR width > 0),
  CONSTRAINT marketing_assets_height_positive CHECK (height IS NULL OR height > 0)
);

CREATE INDEX IF NOT EXISTS idx_marketing_assets_created_at
ON public.marketing_assets(created_at DESC);

CREATE TABLE IF NOT EXISTS public.marketing_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id uuid NULL REFERENCES public.marketing_pages(id) ON DELETE SET NULL,
  page_version_id uuid NULL REFERENCES public.marketing_page_versions(id) ON DELETE SET NULL,
  name text NULL,
  phone text NULL,
  community text NULL,
  city text NULL,
  form_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  source text NOT NULL DEFAULT 'h5',
  wx_openid text NULL,
  customer_id uuid NULL REFERENCES public.customers(id) ON DELETE SET NULL,
  request_ip text NULL,
  user_agent text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT marketing_leads_form_data_object_check CHECK (jsonb_typeof(form_data) = 'object'),
  CONSTRAINT marketing_leads_source_not_blank CHECK (btrim(source) <> '')
);

CREATE INDEX IF NOT EXISTS idx_marketing_leads_page_id
ON public.marketing_leads(page_id);

CREATE INDEX IF NOT EXISTS idx_marketing_leads_page_version_id
ON public.marketing_leads(page_version_id);

CREATE INDEX IF NOT EXISTS idx_marketing_leads_phone
ON public.marketing_leads(phone);

CREATE INDEX IF NOT EXISTS idx_marketing_leads_customer_id
ON public.marketing_leads(customer_id);

CREATE INDEX IF NOT EXISTS idx_marketing_leads_created_at
ON public.marketing_leads(created_at DESC);

CREATE TABLE IF NOT EXISTS public.marketing_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id uuid NULL REFERENCES public.marketing_pages(id) ON DELETE SET NULL,
  page_version_id uuid NULL REFERENCES public.marketing_page_versions(id) ON DELETE SET NULL,
  event_name text NOT NULL,
  block_id text NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  wx_openid text NULL,
  customer_id uuid NULL REFERENCES public.customers(id) ON DELETE SET NULL,
  request_ip text NULL,
  user_agent text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT marketing_events_payload_object_check CHECK (jsonb_typeof(payload) = 'object'),
  CONSTRAINT marketing_events_event_name_check CHECK (
    event_name = ANY (
      ARRAY[
        'page_view'::text,
        'button_click'::text,
        'phone_click'::text,
        'form_submit'::text
      ]
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_marketing_events_page_id
ON public.marketing_events(page_id);

CREATE INDEX IF NOT EXISTS idx_marketing_events_page_version_id
ON public.marketing_events(page_version_id);

CREATE INDEX IF NOT EXISTS idx_marketing_events_event_name
ON public.marketing_events(event_name);

CREATE INDEX IF NOT EXISTS idx_marketing_events_customer_id
ON public.marketing_events(customer_id);

CREATE INDEX IF NOT EXISTS idx_marketing_events_created_at
ON public.marketing_events(created_at DESC);

INSERT INTO public.permissions (code, name, module, resource, action, description, status)
VALUES
  (
    'marketing_page.read',
    '查看 H5 活动页',
    'marketing',
    'marketing_page',
    'read',
    '查看 H5 营销活动页列表和详情',
    'active'
  ),
  (
    'marketing_page.create',
    '新建 H5 活动页',
    'marketing',
    'marketing_page',
    'create',
    '新建 H5 营销活动页',
    'active'
  ),
  (
    'marketing_page.update',
    '编辑 H5 活动页',
    'marketing',
    'marketing_page',
    'update',
    '编辑 H5 营销活动页草稿',
    'active'
  ),
  (
    'marketing_page.publish',
    '发布 H5 活动页',
    'marketing',
    'marketing_page',
    'publish',
    '发布或下线 H5 营销活动页',
    'active'
  ),
  (
    'marketing_page.delete',
    '删除 H5 活动页',
    'marketing',
    'marketing_page',
    'delete',
    '删除或归档 H5 营销活动页',
    'active'
  ),
  (
    'marketing_lead.read',
    '查看营销线索',
    'marketing',
    'marketing_lead',
    'read',
    '查看 H5 营销活动页收集的预约线索',
    'active'
  ),
  (
    'marketing_event.read',
    '查看营销埋点',
    'marketing',
    'marketing_event',
    'read',
    '查看 H5 营销活动页访问、点击、提交等埋点数据',
    'active'
  )
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  module = EXCLUDED.module,
  resource = EXCLUDED.resource,
  action = EXCLUDED.action,
  description = EXCLUDED.description,
  status = EXCLUDED.status,
  updated_at = now();

INSERT INTO public.role_permissions (role_id, permission_id, access_scope)
SELECT r.id, p.id, 'all'
FROM public.roles r
JOIN public.permissions p
  ON p.code = ANY (
    ARRAY[
      'marketing_page.read',
      'marketing_page.create',
      'marketing_page.update',
      'marketing_page.publish',
      'marketing_page.delete',
      'marketing_lead.read',
      'marketing_event.read'
    ]
  )
WHERE r.code = 'system_admin'
ON CONFLICT (role_id, permission_id) DO UPDATE SET
  access_scope = EXCLUDED.access_scope;

COMMENT ON TABLE public.marketing_pages IS 'H5 营销页主表';
COMMENT ON TABLE public.marketing_page_versions IS 'H5 营销页版本快照表';
COMMENT ON TABLE public.marketing_assets IS 'H5 营销页素材表';
COMMENT ON TABLE public.marketing_leads IS 'H5 营销页线索表';
COMMENT ON TABLE public.marketing_events IS 'H5 营销页埋点事件表';
COMMENT ON COLUMN public.marketing_pages.slug IS '公开访问路径标识，例如 /p/spring-sale 中的 spring-sale';
COMMENT ON COLUMN public.marketing_pages.published_version_id IS '当前线上发布版本';
COMMENT ON COLUMN public.marketing_page_versions.config IS '页面配置 JSON，包含 theme 和 blocks';
COMMENT ON COLUMN public.marketing_leads.form_data IS '动态预约表单原始数据';
COMMENT ON COLUMN public.marketing_events.event_name IS '埋点事件名: page_view/button_click/phone_click/form_submit';
