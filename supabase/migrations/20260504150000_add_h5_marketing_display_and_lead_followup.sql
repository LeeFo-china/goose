ALTER TABLE public.marketing_pages
  ADD COLUMN IF NOT EXISTS display_scene text NOT NULL DEFAULT 'all',
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS start_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS end_at timestamptz NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'marketing_pages_display_scene_check'
  ) THEN
    ALTER TABLE public.marketing_pages
      ADD CONSTRAINT marketing_pages_display_scene_check
      CHECK (
        display_scene = ANY (
          ARRAY[
            'all'::text,
            'home'::text,
            'customer_home'::text,
            'project_detail'::text,
            'marketing_list'::text
          ]
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'marketing_pages_sort_order_check'
  ) THEN
    ALTER TABLE public.marketing_pages
      ADD CONSTRAINT marketing_pages_sort_order_check
      CHECK (sort_order >= 0 AND sort_order <= 9999);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'marketing_pages_active_window_check'
  ) THEN
    ALTER TABLE public.marketing_pages
      ADD CONSTRAINT marketing_pages_active_window_check
      CHECK (start_at IS NULL OR end_at IS NULL OR start_at <= end_at);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_marketing_pages_public_display
ON public.marketing_pages(status, display_scene, sort_order, published_at DESC);

CREATE INDEX IF NOT EXISTS idx_marketing_pages_active_window
ON public.marketing_pages(start_at, end_at);

ALTER TABLE public.marketing_leads
  ADD COLUMN IF NOT EXISTS lead_status text NOT NULL DEFAULT 'new',
  ADD COLUMN IF NOT EXISTS follow_remark text NULL,
  ADD COLUMN IF NOT EXISTS followed_by uuid NULL REFERENCES public.employees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS followed_at timestamptz NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'marketing_leads_lead_status_check'
  ) THEN
    ALTER TABLE public.marketing_leads
      ADD CONSTRAINT marketing_leads_lead_status_check
      CHECK (
        lead_status = ANY (
          ARRAY[
            'new'::text,
            'contacted'::text,
            'converted'::text,
            'invalid'::text
          ]
        )
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_marketing_leads_lead_status
ON public.marketing_leads(lead_status);

CREATE INDEX IF NOT EXISTS idx_marketing_leads_followed_by
ON public.marketing_leads(followed_by);

INSERT INTO public.permissions (code, name, module, resource, action, description, status)
VALUES
  (
    'marketing_lead.update',
    '跟进营销线索',
    'marketing',
    'marketing_lead',
    'update',
    '更新 H5 营销活动页线索跟进状态和备注',
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
  ON p.code = 'marketing_lead.update'
WHERE r.code = 'system_admin'
ON CONFLICT (role_id, permission_id) DO UPDATE SET
  access_scope = EXCLUDED.access_scope;

COMMENT ON COLUMN public.marketing_pages.display_scene IS '小程序展示场景: all/home/customer_home/project_detail/marketing_list';
COMMENT ON COLUMN public.marketing_pages.sort_order IS '小程序活动入口排序值，越小越靠前';
COMMENT ON COLUMN public.marketing_pages.start_at IS '活动开始展示时间，为空表示立即开始';
COMMENT ON COLUMN public.marketing_pages.end_at IS '活动结束展示时间，为空表示长期有效';
COMMENT ON COLUMN public.marketing_leads.lead_status IS '营销线索跟进状态: new/contacted/converted/invalid';
COMMENT ON COLUMN public.marketing_leads.follow_remark IS '营销线索跟进备注';
COMMENT ON COLUMN public.marketing_leads.followed_by IS '最近跟进员工';
COMMENT ON COLUMN public.marketing_leads.followed_at IS '最近跟进时间';
