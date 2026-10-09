-- Collection starts only with the first successfully committed valid event.
-- Rollback: stop collectors/readers first; retain these additive tables as history.
BEGIN;
CREATE TABLE public.tenant_activity_collection_config (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  collection_started_at timestamptz
);
INSERT INTO public.tenant_activity_collection_config(singleton) VALUES (true);

CREATE TABLE public.tenant_activity_events (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  -- Historical employee IDs intentionally survive employee deletion/reassignment.
  employee_id uuid NOT NULL,
  channel text NOT NULL CHECK (channel IN ('admin_web','wechat_mini')),
  kind text NOT NULL CHECK (kind IN ('view','login','customer_created','follow_up_created',
    'project_created','construction_log_created','acceptance_handled')),
  event_key_hash text NOT NULL CHECK (event_key_hash ~ '^[a-f0-9]{64}$'),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,employee_id,channel,kind,event_key_hash)
);
COMMENT ON TABLE public.tenant_activity_events IS
  'Idempotency receipts only: no raw event key, tokens, phones, IPs or business payload. Retain receipts to prevent old retries.';

CREATE TABLE public.tenant_activity_daily (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL,
  channel text NOT NULL CHECK (channel IN ('admin_web','wechat_mini')),
  activity_date date NOT NULL,
  active boolean NOT NULL DEFAULT false,
  login_count bigint NOT NULL DEFAULT 0 CHECK (login_count >= 0),
  customer_created bigint NOT NULL DEFAULT 0 CHECK (customer_created >= 0),
  follow_up_created bigint NOT NULL DEFAULT 0 CHECK (follow_up_created >= 0),
  project_created bigint NOT NULL DEFAULT 0 CHECK (project_created >= 0),
  construction_log_created bigint NOT NULL DEFAULT 0 CHECK (construction_log_created >= 0),
  acceptance_handled bigint NOT NULL DEFAULT 0 CHECK (acceptance_handled >= 0),
  PRIMARY KEY (tenant_id,activity_date,employee_id,channel)
);
-- The primary key bounds the read to requested tenants and seven Beijing dates.
CREATE TABLE public.tenant_activity_last_active (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  last_active_at timestamptz NOT NULL
);

ALTER TABLE public.tenant_activity_collection_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_activity_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_activity_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_activity_last_active ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.tenant_activity_collection_config, public.tenant_activity_events,
  public.tenant_activity_daily, public.tenant_activity_last_active FROM PUBLIC, anon, authenticated, service_role;
-- No table policies/grants: even service_role writes through the validated RPC.

CREATE FUNCTION public.record_tenant_activity(
  p_tenant_id uuid, p_employee_id uuid, p_channel text, p_kind text, p_event_key text
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_now timestamptz := now();
  v_active boolean;
BEGIN
  IF p_tenant_id IS NULL OR p_employee_id IS NULL
    OR p_channel IS NULL OR p_channel NOT IN ('admin_web','wechat_mini')
    OR p_kind IS NULL OR p_kind NOT IN ('view','login','customer_created','follow_up_created',
      'project_created','construction_log_created','acceptance_handled')
    OR p_event_key IS NULL OR btrim(p_event_key) = '' OR length(p_event_key) > 512 THEN
    RETURN false;
  END IF;
  -- Installed schema represents platform employees with employees.tenant_id IS NULL;
  -- there is no is_platform flag. Require the actual active tenant employee row.
  -- SHARE prevents status/ownership changes during this transaction.
  PERFORM 1 FROM public.employees e
  WHERE e.id = p_employee_id AND e.tenant_id = p_tenant_id AND e.status = 'active'
  FOR SHARE;
  IF NOT FOUND THEN RETURN false; END IF;

  INSERT INTO public.tenant_activity_events(tenant_id,employee_id,channel,kind,event_key_hash,recorded_at)
  VALUES (p_tenant_id,p_employee_id,p_channel,p_kind,
    encode(sha256(convert_to(p_event_key,'UTF8')),'hex'),v_now)
  ON CONFLICT (tenant_id,employee_id,channel,kind,event_key_hash) DO NOTHING;
  IF NOT FOUND THEN RETURN false; END IF;

  v_active := p_kind <> 'login';
  INSERT INTO public.tenant_activity_daily AS daily (
    tenant_id,employee_id,channel,activity_date,active,login_count,customer_created,
    follow_up_created,project_created,construction_log_created,acceptance_handled
  ) VALUES (
    p_tenant_id,p_employee_id,p_channel,(v_now AT TIME ZONE 'Asia/Shanghai')::date,v_active,
    (p_kind='login')::int,(p_kind='customer_created')::int,(p_kind='follow_up_created')::int,
    (p_kind='project_created')::int,(p_kind='construction_log_created')::int,(p_kind='acceptance_handled')::int
  ) ON CONFLICT (tenant_id,activity_date,employee_id,channel) DO UPDATE SET
    active = daily.active OR EXCLUDED.active,
    login_count = daily.login_count + EXCLUDED.login_count,
    customer_created = daily.customer_created + EXCLUDED.customer_created,
    follow_up_created = daily.follow_up_created + EXCLUDED.follow_up_created,
    project_created = daily.project_created + EXCLUDED.project_created,
    construction_log_created = daily.construction_log_created + EXCLUDED.construction_log_created,
    acceptance_handled = daily.acceptance_handled + EXCLUDED.acceptance_handled;

  IF v_active THEN
    INSERT INTO public.tenant_activity_last_active AS activity(tenant_id,last_active_at)
    VALUES (p_tenant_id,v_now)
    ON CONFLICT (tenant_id) DO UPDATE
      SET last_active_at = greatest(activity.last_active_at,EXCLUDED.last_active_at);
  END IF;
  -- A failed write rolls back this activation and the receipt together. Conditional
  -- update avoids taking a global row lock after collection has started.
  UPDATE public.tenant_activity_collection_config SET collection_started_at=v_now
    WHERE singleton AND collection_started_at IS NULL;
  IF NOT EXISTS (SELECT 1 FROM public.tenant_activity_collection_config WHERE singleton) THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='Tenant activity collection config missing';
  END IF;
  RETURN true;
END;
$$;

CREATE FUNCTION public.get_tenant_activity_summaries(p_tenant_ids uuid[]) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_now timestamptz := now();
  v_today date := (v_now AT TIME ZONE 'Asia/Shanghai')::date;
  v_window_start timestamptz := ((v_today-6)::timestamp AT TIME ZONE 'Asia/Shanghai');
  v_collection_start timestamptz;
  v_result jsonb;
BEGIN
  IF p_tenant_ids IS NULL OR cardinality(p_tenant_ids)>100
    OR array_position(p_tenant_ids,NULL) IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Expected at most 100 tenant IDs';
  END IF;
  IF cardinality(p_tenant_ids)=0 THEN RETURN '[]'::jsonb; END IF;
  SELECT collection_started_at INTO v_collection_start FROM public.tenant_activity_collection_config WHERE singleton;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='Tenant activity collection config missing';
  END IF;

  WITH requested AS (
    SELECT t.id, CASE WHEN v_collection_start IS NULL THEN NULL
      ELSE greatest(v_collection_start,t.created_at) END AS started_at
    FROM public.tenants t WHERE t.id=ANY(p_tenant_ids)
  ), counts AS (
    SELECT d.tenant_id,
      count(DISTINCT d.employee_id) FILTER (WHERE d.active) AS active_employee_count,
      count(DISTINCT d.employee_id) FILTER (WHERE d.active AND d.channel='admin_web') AS admin_active_employee_count,
      count(DISTINCT d.employee_id) FILTER (WHERE d.active AND d.channel='wechat_mini') AS mini_active_employee_count,
      count(DISTINCT d.activity_date) FILTER (WHERE d.active) AS active_days,
      sum(d.login_count) FILTER (WHERE d.channel='admin_web') AS admin_login_count,
      sum(d.login_count) FILTER (WHERE d.channel='wechat_mini') AS mini_login_count,
      sum(d.customer_created) AS customer_created, sum(d.follow_up_created) AS follow_up_created,
      sum(d.project_created) AS project_created, sum(d.construction_log_created) AS construction_log_created,
      sum(d.acceptance_handled) AS acceptance_handled
    FROM public.tenant_activity_daily d
    WHERE d.tenant_id=ANY(p_tenant_ids) AND d.activity_date BETWEEN v_today-6 AND v_today
    GROUP BY d.tenant_id
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'tenant_id',r.id,
    'status',CASE WHEN r.started_at <= v_window_start THEN 'ready' ELSE 'collecting' END,
    'collection_started_at',r.started_at,
    'window_start',CASE WHEN r.started_at IS NOT NULL THEN v_window_start END,
    'window_end',CASE WHEN r.started_at IS NOT NULL THEN v_now END,
    'observed_days',CASE WHEN r.started_at IS NULL THEN 0
      ELSE least(7,greatest(0,v_today-(r.started_at AT TIME ZONE 'Asia/Shanghai')::date+1)) END,
    'last_active_at',a.last_active_at,
    'active_employee_count',CASE WHEN r.started_at IS NOT NULL THEN coalesce(c.active_employee_count,0) END,
    'admin_active_employee_count',CASE WHEN r.started_at IS NOT NULL THEN coalesce(c.admin_active_employee_count,0) END,
    'mini_active_employee_count',CASE WHEN r.started_at IS NOT NULL THEN coalesce(c.mini_active_employee_count,0) END,
    'active_days',CASE WHEN r.started_at IS NOT NULL THEN coalesce(c.active_days,0) END,
    'admin_login_count',CASE WHEN r.started_at IS NOT NULL THEN coalesce(c.admin_login_count,0) END,
    'mini_login_count',CASE WHEN r.started_at IS NOT NULL THEN coalesce(c.mini_login_count,0) END,
    'business_actions',CASE WHEN r.started_at IS NOT NULL THEN jsonb_build_object(
      'customer_created',coalesce(c.customer_created,0),'follow_up_created',coalesce(c.follow_up_created,0),
      'project_created',coalesce(c.project_created,0),'construction_log_created',coalesce(c.construction_log_created,0),
      'acceptance_handled',coalesce(c.acceptance_handled,0)) END
  ) ORDER BY r.id),'[]'::jsonb) INTO v_result
  FROM requested r LEFT JOIN counts c ON c.tenant_id=r.id
  LEFT JOIN public.tenant_activity_last_active a ON a.tenant_id=r.id;
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.record_tenant_activity(uuid,uuid,text,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_tenant_activity_summaries(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_tenant_activity(uuid,uuid,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_tenant_activity_summaries(uuid[]) TO service_role;
COMMIT;
