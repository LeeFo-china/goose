CREATE TABLE IF NOT EXISTS public.visitor_project_follows (
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  visitor_id text NOT NULL,
  verified_phone text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, visitor_id),
  CONSTRAINT visitor_project_follows_visitor_not_blank CHECK (btrim(visitor_id) <> ''),
  CONSTRAINT visitor_project_follows_phone_not_blank CHECK (btrim(verified_phone) <> '')
);

CREATE INDEX IF NOT EXISTS visitor_project_follows_visitor_created_at_idx
ON public.visitor_project_follows(visitor_id, created_at DESC);

CREATE INDEX IF NOT EXISTS visitor_project_follows_project_created_at_idx
ON public.visitor_project_follows(project_id, created_at DESC);

COMMENT ON TABLE public.visitor_project_follows IS '访客公开项目关注表';
COMMENT ON COLUMN public.visitor_project_follows.visitor_id IS 'visitor_session visitor_id 或手机号验证后的 auth user id';
COMMENT ON COLUMN public.visitor_project_follows.verified_phone IS '关注时已验证手机号';

ALTER TABLE public.platform_leads
ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id),
ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id),
ADD COLUMN IF NOT EXISTS source_context jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.platform_leads
DROP CONSTRAINT IF EXISTS platform_leads_source_context_object_check;

ALTER TABLE public.platform_leads
ADD CONSTRAINT platform_leads_source_context_object_check
CHECK (jsonb_typeof(source_context) = 'object');

CREATE INDEX IF NOT EXISTS platform_leads_tenant_project_created_at_idx
ON public.platform_leads(tenant_id, project_id, created_at DESC)
WHERE tenant_id IS NOT NULL AND project_id IS NOT NULL;

INSERT INTO public.system_settings (
  key,
  group_code,
  name,
  description,
  value_type,
  value_text,
  is_secret,
  status
)
SELECT *
FROM (
  VALUES
    (
      'VISITOR_PROJECT_CONSULTATION_ENABLED',
      'visitor',
      '访客项目详情咨询开关',
      '控制租户公开项目详情页是否展示并允许提交咨询线索。',
      'boolean',
      'false',
      false,
      'active'
    )
) AS incoming (
  key,
  group_code,
  name,
  description,
  value_type,
  value_text,
  is_secret,
  status
)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.system_settings existing
  WHERE existing.tenant_id IS NULL
    AND existing.key = incoming.key
);

UPDATE public.system_settings existing
SET
  group_code = incoming.group_code,
  name = incoming.name,
  description = incoming.description,
  value_type = incoming.value_type,
  is_secret = incoming.is_secret,
  status = incoming.status,
  updated_at = now()
FROM (
  VALUES
    (
      'VISITOR_PROJECT_CONSULTATION_ENABLED',
      'visitor',
      '访客项目详情咨询开关',
      '控制租户公开项目详情页是否展示并允许提交咨询线索。',
      'boolean',
      false,
      'active'
    )
) AS incoming (
  key,
  group_code,
  name,
  description,
  value_type,
  is_secret,
  status
)
WHERE existing.tenant_id IS NULL
  AND existing.key = incoming.key;
