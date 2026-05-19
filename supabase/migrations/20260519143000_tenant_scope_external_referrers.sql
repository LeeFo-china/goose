ALTER TABLE public.external_referrers
ADD COLUMN IF NOT EXISTS tenant_id uuid NULL REFERENCES public.tenants(id);

CREATE TEMP TABLE tmp_external_referrer_tenant_map (
  old_referrer_id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  target_referrer_id uuid NOT NULL
) ON COMMIT DROP;

CREATE TEMP TABLE tmp_external_referrer_clones (
  old_referrer_id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  target_referrer_id uuid NOT NULL
) ON COMMIT DROP;

WITH linked_referrers AS (
  SELECT DISTINCT
    referrals.referrer_id AS old_referrer_id,
    projects.tenant_id
  FROM public.project_referrals referrals
  JOIN public.projects projects ON projects.id = referrals.project_id
  WHERE referrals.referrer_id IS NOT NULL
    AND projects.tenant_id IS NOT NULL
),
ranked_referrers AS (
  SELECT
    old_referrer_id,
    tenant_id,
    row_number() OVER (
      PARTITION BY old_referrer_id
      ORDER BY tenant_id::text
    ) AS tenant_rank
  FROM linked_referrers
)
UPDATE public.external_referrers referrers
SET tenant_id = ranked_referrers.tenant_id
FROM ranked_referrers
WHERE referrers.id = ranked_referrers.old_referrer_id
  AND ranked_referrers.tenant_rank = 1
  AND referrers.tenant_id IS NULL;

WITH linked_referrers AS (
  SELECT DISTINCT
    referrals.referrer_id AS old_referrer_id,
    projects.tenant_id
  FROM public.project_referrals referrals
  JOIN public.projects projects ON projects.id = referrals.project_id
  WHERE referrals.referrer_id IS NOT NULL
    AND projects.tenant_id IS NOT NULL
),
ranked_referrers AS (
  SELECT
    old_referrer_id,
    tenant_id,
    row_number() OVER (
      PARTITION BY old_referrer_id
      ORDER BY tenant_id::text
    ) AS tenant_rank
  FROM linked_referrers
)
INSERT INTO tmp_external_referrer_tenant_map (
  old_referrer_id,
  tenant_id,
  target_referrer_id
)
SELECT
  old_referrer_id,
  tenant_id,
  old_referrer_id
FROM ranked_referrers
WHERE tenant_rank = 1;

WITH linked_referrers AS (
  SELECT DISTINCT
    referrals.referrer_id AS old_referrer_id,
    projects.tenant_id
  FROM public.project_referrals referrals
  JOIN public.projects projects ON projects.id = referrals.project_id
  WHERE referrals.referrer_id IS NOT NULL
    AND projects.tenant_id IS NOT NULL
),
ranked_referrers AS (
  SELECT
    old_referrer_id,
    tenant_id,
    row_number() OVER (
      PARTITION BY old_referrer_id
      ORDER BY tenant_id::text
    ) AS tenant_rank
  FROM linked_referrers
)
INSERT INTO tmp_external_referrer_clones (
  old_referrer_id,
  tenant_id,
  target_referrer_id
)
SELECT
  old_referrer_id,
  tenant_id,
  gen_random_uuid()
FROM ranked_referrers
WHERE tenant_rank > 1;

INSERT INTO public.external_referrers (
  id,
  tenant_id,
  name,
  phone,
  bank_name,
  bank_account,
  wechat_account,
  alipay_account,
  status,
  remark,
  created_at,
  updated_at
)
SELECT
  clones.target_referrer_id,
  clones.tenant_id,
  referrers.name,
  referrers.phone,
  referrers.bank_name,
  referrers.bank_account,
  referrers.wechat_account,
  referrers.alipay_account,
  referrers.status,
  referrers.remark,
  referrers.created_at,
  now()
FROM tmp_external_referrer_clones clones
JOIN public.external_referrers referrers
  ON referrers.id = clones.old_referrer_id;

INSERT INTO tmp_external_referrer_tenant_map (
  old_referrer_id,
  tenant_id,
  target_referrer_id
)
SELECT
  old_referrer_id,
  tenant_id,
  target_referrer_id
FROM tmp_external_referrer_clones;

UPDATE public.project_referrals referrals
SET referrer_id = map.target_referrer_id
FROM public.projects projects
JOIN tmp_external_referrer_tenant_map map
  ON map.tenant_id = projects.tenant_id
WHERE referrals.project_id = projects.id
  AND referrals.referrer_id = map.old_referrer_id
  AND referrals.referrer_id <> map.target_referrer_id;

WITH default_tenant AS (
  SELECT id FROM public.tenants WHERE slug = 'gooes_default'
)
UPDATE public.external_referrers
SET tenant_id = (SELECT id FROM default_tenant)
WHERE tenant_id IS NULL;

ALTER TABLE public.external_referrers
ALTER COLUMN tenant_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_external_referrers_tenant_status_created_at
ON public.external_referrers(tenant_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_external_referrers_tenant_phone
ON public.external_referrers(tenant_id, phone)
WHERE phone IS NOT NULL;

COMMENT ON COLUMN public.external_referrers.tenant_id IS '外部介绍人所属租户，介绍人按租户私有隔离';
