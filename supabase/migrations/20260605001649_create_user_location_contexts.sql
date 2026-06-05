CREATE TABLE IF NOT EXISTS public.user_location_contexts (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  auth_user_id uuid NOT NULL,
  source text NOT NULL DEFAULT 'gps',
  province text NULL,
  city text NULL,
  district text NULL,
  adcode text NULL,
  latitude double precision NULL,
  longitude double precision NULL,
  accuracy double precision NULL,
  matched_tenants jsonb NOT NULL DEFAULT '[]'::jsonb,
  recommended_tenant_id uuid NULL REFERENCES public.tenants(id) ON DELETE SET NULL,
  selected_tenant_id uuid NULL REFERENCES public.tenants(id) ON DELETE SET NULL,
  fallback_reason text NULL,
  confirmed_at timestamptz NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_location_contexts_pkey PRIMARY KEY (id),
  CONSTRAINT user_location_contexts_source_check CHECK (
    source = ANY (ARRAY['gps'::text, 'manual_city'::text, 'manual_address'::text])
  ),
  CONSTRAINT user_location_contexts_latitude_range CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  CONSTRAINT user_location_contexts_longitude_range CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),
  CONSTRAINT user_location_contexts_accuracy_positive CHECK (accuracy IS NULL OR accuracy >= 0),
  CONSTRAINT user_location_contexts_matched_tenants_array CHECK (jsonb_typeof(matched_tenants) = 'array')
);

CREATE INDEX IF NOT EXISTS idx_user_location_contexts_auth_user
ON public.user_location_contexts(auth_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_location_contexts_expires_at
ON public.user_location_contexts(expires_at);

CREATE INDEX IF NOT EXISTS idx_user_location_contexts_selected_tenant
ON public.user_location_contexts(selected_tenant_id)
WHERE selected_tenant_id IS NOT NULL;

DROP TRIGGER IF EXISTS tr_user_location_contexts_updated_at ON public.user_location_contexts;
CREATE TRIGGER tr_user_location_contexts_updated_at
BEFORE UPDATE ON public.user_location_contexts
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE public.user_location_contexts IS '小程序登录后定位匹配上下文，用于记录候选租户和用户确认结果';
COMMENT ON COLUMN public.user_location_contexts.auth_user_id IS 'Supabase Auth 用户 ID';
COMMENT ON COLUMN public.user_location_contexts.matched_tenants IS '定位和身份决策产生的候选租户快照';
COMMENT ON COLUMN public.user_location_contexts.recommended_tenant_id IS '后端推荐租户';
COMMENT ON COLUMN public.user_location_contexts.selected_tenant_id IS '用户最终选择的租户';
COMMENT ON COLUMN public.user_location_contexts.expires_at IS '定位上下文过期时间';

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
      'LOCATION_MATCH_ENABLED',
      'location',
      '定位匹配开关',
      '控制小程序登录后是否启用定位匹配装修公司能力。',
      'boolean',
      'true',
      false,
      'active'
    ),
    (
      'LOCATION_CONTEXT_TTL_HOURS',
      'location',
      '定位上下文有效期',
      '用户定位匹配上下文的有效期，单位小时。',
      'number',
      '24',
      false,
      'active'
    ),
    (
      'LOCATION_STORE_RAW_COORDINATE',
      'location',
      '保存原始定位坐标',
      '控制是否长期保存用户原始经纬度；默认关闭，仅保存行政区和匹配结果。',
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
      'LOCATION_MATCH_ENABLED',
      'location',
      '定位匹配开关',
      '控制小程序登录后是否启用定位匹配装修公司能力。',
      'boolean',
      false,
      'active'
    ),
    (
      'LOCATION_CONTEXT_TTL_HOURS',
      'location',
      '定位上下文有效期',
      '用户定位匹配上下文的有效期，单位小时。',
      'number',
      false,
      'active'
    ),
    (
      'LOCATION_STORE_RAW_COORDINATE',
      'location',
      '保存原始定位坐标',
      '控制是否长期保存用户原始经纬度；默认关闭，仅保存行政区和匹配结果。',
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
