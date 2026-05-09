CREATE TABLE IF NOT EXISTS public.platform_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id uuid,
  phone text NOT NULL,
  name text,
  city text,
  community text,
  area numeric,
  budget text,
  description text,
  source text NOT NULL DEFAULT 'platform_visitor',
  status text NOT NULL DEFAULT 'new',
  assigned_tenant_id uuid REFERENCES public.tenants(id),
  assigned_customer_id uuid REFERENCES public.customers(id),
  assigned_by_employee_id uuid REFERENCES public.employees(id),
  assigned_at timestamptz,
  assigned_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_leads_phone_not_blank CHECK (btrim(phone) <> ''),
  CONSTRAINT platform_leads_status_check CHECK (status IN ('new', 'assigned', 'invalid'))
);

DROP TRIGGER IF EXISTS tr_platform_leads_updated_at ON public.platform_leads;
CREATE TRIGGER tr_platform_leads_updated_at
  BEFORE UPDATE ON public.platform_leads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.platform_lead_assign_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_lead_id uuid NOT NULL REFERENCES public.platform_leads(id) ON DELETE CASCADE,
  target_tenant_id uuid REFERENCES public.tenants(id),
  assigned_customer_id uuid REFERENCES public.customers(id),
  action text NOT NULL,
  dedupe_result text,
  operator_employee_id uuid REFERENCES public.employees(id),
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_lead_assign_logs_action_check CHECK (
    action IN ('assign', 'assign_idempotent', 'mark_invalid')
  ),
  CONSTRAINT platform_lead_assign_logs_dedupe_result_check CHECK (
    dedupe_result IS NULL OR dedupe_result IN ('existing_customer', 'created_customer', 'already_assigned')
  )
);

CREATE TABLE IF NOT EXISTS public.customer_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  source text NOT NULL,
  source_label text,
  platform_lead_id uuid REFERENCES public.platform_leads(id) ON DELETE SET NULL,
  assigned_by_employee_id uuid REFERENCES public.employees(id),
  assigned_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customer_sources_metadata_object_check CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX IF NOT EXISTS platform_leads_status_created_at_idx
ON public.platform_leads(status, created_at DESC);

CREATE INDEX IF NOT EXISTS platform_leads_phone_created_at_idx
ON public.platform_leads(phone, created_at DESC);

CREATE INDEX IF NOT EXISTS platform_leads_assigned_tenant_status_idx
ON public.platform_leads(assigned_tenant_id, status, assigned_at DESC);

CREATE INDEX IF NOT EXISTS platform_lead_assign_logs_lead_created_at_idx
ON public.platform_lead_assign_logs(platform_lead_id, created_at DESC);

CREATE INDEX IF NOT EXISTS customer_sources_tenant_customer_created_at_idx
ON public.customer_sources(tenant_id, customer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS customer_sources_platform_lead_idx
ON public.customer_sources(platform_lead_id)
WHERE platform_lead_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS customer_sources_platform_lead_unique
ON public.customer_sources(customer_id, platform_lead_id)
WHERE platform_lead_id IS NOT NULL;

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
      'platform_assigned'::text
    ]
  )
);

CREATE OR REPLACE FUNCTION public.assign_platform_lead(
  p_lead_id uuid,
  p_tenant_id uuid,
  p_operator_employee_id uuid,
  p_assigned_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead public.platform_leads%ROWTYPE;
  v_tenant public.tenants%ROWTYPE;
  v_customer_id uuid;
  v_dedupe_result text;
BEGIN
  SELECT *
  INTO v_lead
  FROM public.platform_leads
  WHERE id = p_lead_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PLATFORM_LEAD_NOT_FOUND';
  END IF;

  SELECT *
  INTO v_tenant
  FROM public.tenants
  WHERE id = p_tenant_id
    AND status = 'active';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TENANT_NOT_AVAILABLE';
  END IF;

  IF v_lead.status = 'assigned' THEN
    IF v_lead.assigned_tenant_id = p_tenant_id THEN
      INSERT INTO public.platform_lead_assign_logs (
        platform_lead_id,
        target_tenant_id,
        assigned_customer_id,
        action,
        dedupe_result,
        operator_employee_id,
        note
      )
      VALUES (
        v_lead.id,
        p_tenant_id,
        v_lead.assigned_customer_id,
        'assign_idempotent',
        'already_assigned',
        p_operator_employee_id,
        p_assigned_note
      );

      RETURN jsonb_build_object(
        'platform_lead_id', v_lead.id,
        'assigned_tenant_id', v_lead.assigned_tenant_id,
        'assigned_customer_id', v_lead.assigned_customer_id,
        'dedupe_result', 'already_assigned',
        'status', 'assigned'
      );
    END IF;

    RAISE EXCEPTION 'PLATFORM_LEAD_ALREADY_ASSIGNED';
  END IF;

  IF v_lead.status <> 'new' THEN
    RAISE EXCEPTION 'PLATFORM_LEAD_NOT_ASSIGNABLE';
  END IF;

  SELECT id
  INTO v_customer_id
  FROM public.customers
  WHERE tenant_id = p_tenant_id
    AND phone = v_lead.phone
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_customer_id IS NULL THEN
    INSERT INTO public.customers (
      tenant_id,
      name,
      phone,
      status,
      source
    )
    VALUES (
      p_tenant_id,
      COALESCE(NULLIF(btrim(v_lead.name), ''), '客户' || right(v_lead.phone, 4)),
      v_lead.phone,
      'potential',
      'platform_assigned'
    )
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_customer_id;

    IF v_customer_id IS NULL THEN
      SELECT id
      INTO v_customer_id
      FROM public.customers
      WHERE tenant_id = p_tenant_id
        AND phone = v_lead.phone
      ORDER BY created_at ASC
      LIMIT 1;

      v_dedupe_result := 'existing_customer';
    ELSE
      v_dedupe_result := 'created_customer';
    END IF;
  ELSE
    v_dedupe_result := 'existing_customer';
  END IF;

  IF v_customer_id IS NULL THEN
    RAISE EXCEPTION 'PLATFORM_LEAD_CUSTOMER_UPSERT_FAILED';
  END IF;

  INSERT INTO public.customer_sources (
    tenant_id,
    customer_id,
    source,
    source_label,
    platform_lead_id,
    assigned_by_employee_id,
    assigned_at,
    metadata
  )
  VALUES (
    p_tenant_id,
    v_customer_id,
    'platform_lead',
    '平台分配线索',
    v_lead.id,
    p_operator_employee_id,
    now(),
    jsonb_build_object(
      'platform_lead_id', v_lead.id,
      'phone', v_lead.phone,
      'name', v_lead.name,
      'city', v_lead.city,
      'community', v_lead.community,
      'area', v_lead.area,
      'budget', v_lead.budget,
      'source', v_lead.source,
      'assigned_note', p_assigned_note,
      'dedupe_result', v_dedupe_result
    )
  )
  ON CONFLICT DO NOTHING;

  UPDATE public.platform_leads
  SET
    status = 'assigned',
    assigned_tenant_id = p_tenant_id,
    assigned_customer_id = v_customer_id,
    assigned_by_employee_id = p_operator_employee_id,
    assigned_at = now(),
    assigned_note = p_assigned_note,
    updated_at = now()
  WHERE id = v_lead.id;

  INSERT INTO public.platform_lead_assign_logs (
    platform_lead_id,
    target_tenant_id,
    assigned_customer_id,
    action,
    dedupe_result,
    operator_employee_id,
    note
  )
  VALUES (
    v_lead.id,
    p_tenant_id,
    v_customer_id,
    'assign',
    v_dedupe_result,
    p_operator_employee_id,
    p_assigned_note
  );

  RETURN jsonb_build_object(
    'platform_lead_id', v_lead.id,
    'assigned_tenant_id', p_tenant_id,
    'assigned_customer_id', v_customer_id,
    'dedupe_result', v_dedupe_result,
    'status', 'assigned'
  );
END;
$$;

COMMENT ON TABLE public.platform_leads IS '平台访客态产生的公海线索，分配前不归属任何租户';
COMMENT ON TABLE public.platform_lead_assign_logs IS '平台线索分配审计日志';
COMMENT ON TABLE public.customer_sources IS '租户客户来源时间线，保留首次来源之外的后续触达记录';
COMMENT ON FUNCTION public.assign_platform_lead(uuid, uuid, uuid, text) IS '平台线索原子化分配：租户内手机号去重、客户来源记录、分配审计';
