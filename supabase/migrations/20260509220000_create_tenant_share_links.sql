CREATE TABLE IF NOT EXISTS public.tenant_share_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  share_employee_id uuid NOT NULL REFERENCES public.employees(id),
  source text NOT NULL DEFAULT 'employee_share',
  target_type text NOT NULL DEFAULT 'miniprogram',
  target_id text,
  token text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'active',
  expires_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  use_count integer NOT NULL DEFAULT 0,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_share_links_source_check CHECK (
    source IN ('employee_share', 'h5_campaign', 'quote_form', 'miniprogram_qrcode')
  ),
  CONSTRAINT tenant_share_links_target_type_check CHECK (
    target_type IN ('miniprogram', 'h5_page', 'quote_form', 'campaign', 'custom')
  ),
  CONSTRAINT tenant_share_links_status_check CHECK (
    status IN ('active', 'disabled')
  ),
  CONSTRAINT tenant_share_links_metadata_object_check CHECK (jsonb_typeof(metadata) = 'object')
);

DROP TRIGGER IF EXISTS tr_tenant_share_links_updated_at ON public.tenant_share_links;
CREATE TRIGGER tr_tenant_share_links_updated_at
  BEFORE UPDATE ON public.tenant_share_links
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.customer_sources
ADD COLUMN IF NOT EXISTS source_employee_id uuid REFERENCES public.employees(id),
ADD COLUMN IF NOT EXISTS related_type text,
ADD COLUMN IF NOT EXISTS related_id text,
ADD COLUMN IF NOT EXISTS share_link_id uuid REFERENCES public.tenant_share_links(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS tenant_share_links_tenant_employee_created_at_idx
ON public.tenant_share_links(tenant_id, share_employee_id, created_at DESC);

CREATE INDEX IF NOT EXISTS tenant_share_links_token_status_idx
ON public.tenant_share_links(token, status);

CREATE INDEX IF NOT EXISTS customer_sources_share_link_idx
ON public.customer_sources(share_link_id)
WHERE share_link_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS customer_sources_source_employee_idx
ON public.customer_sources(tenant_id, source_employee_id, created_at DESC)
WHERE source_employee_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS customer_sources_share_link_unique
ON public.customer_sources(customer_id, share_link_id)
WHERE share_link_id IS NOT NULL;

ALTER TABLE public.customers
DROP CONSTRAINT IF EXISTS customers_source_check;

ALTER TABLE public.customers
ADD CONSTRAINT customers_source_check
CHECK (
  source IS NULL OR source = ANY (
    ARRAY[
      'douyin'::text,
      'referral'::text,
      'walk_in'::text,
      'telemarketing'::text,
      'platform'::text,
      'platform_lead'::text,
      'platform_assigned'::text,
      'employee_share'::text,
      'h5_campaign'::text,
      'quote_form'::text,
      'miniprogram_qrcode'::text
    ]
  )
);

CREATE OR REPLACE FUNCTION public.bind_customer_from_tenant_share(
  p_auth_user_id uuid,
  p_phone text,
  p_share_token text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_link public.tenant_share_links%ROWTYPE;
  v_tenant public.tenants%ROWTYPE;
  v_employee public.employees%ROWTYPE;
  v_customer_id uuid;
  v_customer_user_id uuid;
  v_dedupe_result text;
  v_now timestamptz := now();
BEGIN
  SELECT *
  INTO v_link
  FROM public.tenant_share_links
  WHERE token = p_share_token
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TENANT_SHARE_LINK_NOT_FOUND';
  END IF;

  IF v_link.status <> 'active' THEN
    RAISE EXCEPTION 'TENANT_SHARE_LINK_DISABLED';
  END IF;

  IF v_link.expires_at IS NOT NULL AND v_link.expires_at <= v_now THEN
    RAISE EXCEPTION 'TENANT_SHARE_LINK_EXPIRED';
  END IF;

  SELECT *
  INTO v_tenant
  FROM public.tenants
  WHERE id = v_link.tenant_id
    AND status = 'active';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TENANT_NOT_AVAILABLE';
  END IF;

  SELECT *
  INTO v_employee
  FROM public.employees
  WHERE id = v_link.share_employee_id
    AND tenant_id = v_link.tenant_id
    AND status = 'active';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TENANT_SHARE_EMPLOYEE_NOT_AVAILABLE';
  END IF;

  SELECT id, user_id
  INTO v_customer_id, v_customer_user_id
  FROM public.customers
  WHERE tenant_id = v_link.tenant_id
    AND phone = p_phone
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_customer_id IS NULL THEN
    INSERT INTO public.customers (
      tenant_id,
      name,
      phone,
      status,
      source,
      owner_id,
      user_id,
      customer_origin,
      claimed_at
    )
    VALUES (
      v_link.tenant_id,
      '客户' || right(p_phone, 4),
      p_phone,
      'potential',
      v_link.source,
      v_link.share_employee_id,
      p_auth_user_id,
      'visitor_self_registered',
      v_now
    )
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_customer_id;

    IF v_customer_id IS NULL THEN
      SELECT id, user_id
      INTO v_customer_id, v_customer_user_id
      FROM public.customers
      WHERE tenant_id = v_link.tenant_id
        AND phone = p_phone
      ORDER BY created_at ASC
      LIMIT 1;

      v_dedupe_result := 'existing_customer';
    ELSE
      v_dedupe_result := 'created_customer';
      v_customer_user_id := p_auth_user_id;
    END IF;
  ELSE
    v_dedupe_result := 'existing_customer';
  END IF;

  IF v_customer_id IS NULL THEN
    RAISE EXCEPTION 'TENANT_SHARE_CUSTOMER_UPSERT_FAILED';
  END IF;

  IF v_customer_user_id IS NOT NULL AND v_customer_user_id <> p_auth_user_id THEN
    RAISE EXCEPTION 'CUSTOMER_ALREADY_BOUND';
  END IF;

  UPDATE public.customers
  SET
    user_id = p_auth_user_id,
    claimed_at = COALESCE(claimed_at, v_now)
  WHERE id = v_customer_id
    AND tenant_id = v_link.tenant_id
    AND (user_id IS NULL OR user_id = p_auth_user_id);

  INSERT INTO public.customer_sources (
    tenant_id,
    customer_id,
    source,
    source_label,
    source_employee_id,
    related_type,
    related_id,
    share_link_id,
    assigned_by_employee_id,
    assigned_at,
    metadata
  )
  VALUES (
    v_link.tenant_id,
    v_customer_id,
    v_link.source,
    CASE
      WHEN v_link.source = 'h5_campaign' THEN '员工 H5 活动分享'
      WHEN v_link.source = 'quote_form' THEN '员工报价表单分享'
      WHEN v_link.source = 'miniprogram_qrcode' THEN '员工小程序码分享'
      ELSE '员工拓客分享'
    END,
    v_link.share_employee_id,
    v_link.target_type,
    v_link.target_id,
    v_link.id,
    v_link.share_employee_id,
    v_now,
    jsonb_build_object(
      'share_link_id', v_link.id,
      'share_token', v_link.token,
      'source', v_link.source,
      'target_type', v_link.target_type,
      'target_id', v_link.target_id,
      'share_employee_id', v_link.share_employee_id,
      'dedupe_result', v_dedupe_result
    )
  )
  ON CONFLICT DO NOTHING;

  UPDATE public.tenant_share_links
  SET
    use_count = use_count + 1,
    last_used_at = v_now,
    updated_at = v_now
  WHERE id = v_link.id;

  RETURN jsonb_build_object(
    'tenant_id', v_link.tenant_id,
    'customer_id', v_customer_id,
    'share_link_id', v_link.id,
    'share_employee_id', v_link.share_employee_id,
    'dedupe_result', v_dedupe_result,
    'source', v_link.source,
    'status', 'bound'
  );
END;
$$;

COMMENT ON TABLE public.tenant_share_links IS '租户员工拓客分享链接/小程序码上下文';
COMMENT ON COLUMN public.tenant_share_links.expires_at IS '分享上下文过期时间，MVP 可为空表示长期有效';
COMMENT ON COLUMN public.customer_sources.source_employee_id IS '客户来源关联的分享员工';
COMMENT ON COLUMN public.customer_sources.share_link_id IS '客户来源关联的员工分享链接';
COMMENT ON FUNCTION public.bind_customer_from_tenant_share(uuid, text, text) IS '员工分享路径直绑定客户到目标租户，租户内手机号去重并写入客户来源时间线';
