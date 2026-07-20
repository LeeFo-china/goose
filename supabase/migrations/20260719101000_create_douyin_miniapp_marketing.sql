-- Add the atomic Douyin miniapp lead and analytics model.
-- Rollback: deploy an API version that no longer calls submit_douyin_miniapp_lead,
-- then drop the RPC/table/indexes and added columns. Restore the previous event
-- and SMS scene checks only after proving no Douyin rows remain.
BEGIN;

ALTER TABLE public.marketing_leads
ADD COLUMN douyin_miniapp_installation_id uuid NULL
REFERENCES public.douyin_miniapp_installations(id) ON DELETE RESTRICT;

ALTER TABLE public.marketing_events
ADD COLUMN douyin_miniapp_installation_id uuid NULL
REFERENCES public.douyin_miniapp_installations(id) ON DELETE RESTRICT;

ALTER TABLE public.marketing_events
ADD COLUMN source text NOT NULL DEFAULT 'h5';

ALTER TABLE public.marketing_events
ADD COLUMN subject_hash text NULL;

ALTER TABLE public.marketing_events
ADD CONSTRAINT marketing_events_source_not_blank_check
CHECK (btrim(source) <> '');

ALTER TABLE public.marketing_events
ADD CONSTRAINT marketing_events_subject_hash_check
CHECK (subject_hash IS NULL OR subject_hash ~ '^[0-9a-f]{64}$');

ALTER TABLE public.marketing_leads
ADD CONSTRAINT marketing_leads_douyin_source_shape_check CHECK (
  (
    source = 'douyin_miniapp'
    AND tenant_id IS NOT NULL
    AND douyin_miniapp_installation_id IS NOT NULL
    AND phone IS NOT NULL
    AND page_id IS NULL
    AND page_version_id IS NULL
    AND wx_openid IS NULL
  ) OR (
    source <> 'douyin_miniapp'
    AND douyin_miniapp_installation_id IS NULL
  )
);

ALTER TABLE public.marketing_events
ADD CONSTRAINT marketing_events_douyin_source_shape_check CHECK (
  (
    source = 'douyin_miniapp'
    AND tenant_id IS NOT NULL
    AND douyin_miniapp_installation_id IS NOT NULL
    AND subject_hash IS NOT NULL
    AND page_id IS NULL
    AND page_version_id IS NULL
    AND wx_openid IS NULL
  ) OR (
    source <> 'douyin_miniapp'
    AND douyin_miniapp_installation_id IS NULL
    AND subject_hash IS NULL
  )
);

ALTER TABLE public.marketing_events
DROP CONSTRAINT IF EXISTS marketing_events_event_name_check;

ALTER TABLE public.marketing_events
ADD CONSTRAINT marketing_events_event_name_check CHECK (
  event_name IN (
    'page_view',
    'button_click',
    'phone_click',
    'form_submit',
    'app_launch',
    'case_view',
    'site_view',
    'lead_cta_click',
    'sms_send',
    'lead_submit',
    'lead_submit_success',
    'phone_call_click'
  )
);

ALTER TABLE public.sms_verification_codes
DROP CONSTRAINT IF EXISTS sms_verification_codes_scene_check;

ALTER TABLE public.sms_verification_codes
ADD CONSTRAINT sms_verification_codes_scene_check CHECK (
  scene IN (
    'bind_customer',
    'bind_employee',
    'admin_login',
    'rebind_wechat',
    'bind_platform_partner',
    'unbind_platform_partner',
    'rebind_platform_partner',
    'partner_application',
    'partner_tenant_onboarding',
    'tenant_onboarding_application',
    'login_identity',
    'douyin_lead'
  )
);

CREATE TABLE public.douyin_miniapp_lead_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  douyin_miniapp_installation_id uuid NOT NULL
    CONSTRAINT douyin_lead_submissions_installation_id_fkey
    REFERENCES public.douyin_miniapp_installations(id) ON DELETE RESTRICT,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  idempotency_key uuid NOT NULL,
  request_digest text NOT NULL,
  marketing_lead_id uuid NOT NULL
    REFERENCES public.marketing_leads(id) ON DELETE RESTRICT,
  sms_verification_code_id uuid NOT NULL UNIQUE
    REFERENCES public.sms_verification_codes(id) ON DELETE RESTRICT,
  already_submitted boolean NOT NULL,
  updated_existing boolean NOT NULL,
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (douyin_miniapp_installation_id, idempotency_key),
  CONSTRAINT douyin_lead_submissions_request_digest_check
    CHECK (request_digest ~ '^[0-9a-f]{64}$'),
  CONSTRAINT douyin_lead_submissions_message_check
    CHECK (btrim(message) <> '' AND length(message) <= 80),
  CONSTRAINT douyin_lead_submissions_result_check
    CHECK (NOT updated_existing OR already_submitted)
);

CREATE INDEX marketing_leads_douyin_phone_created_idx
ON public.marketing_leads(tenant_id, phone, created_at DESC)
WHERE source = 'douyin_miniapp' AND phone IS NOT NULL;

CREATE INDEX marketing_leads_douyin_installation_created_idx
ON public.marketing_leads(douyin_miniapp_installation_id, created_at DESC)
WHERE source = 'douyin_miniapp';

CREATE INDEX marketing_events_douyin_funnel_idx
ON public.marketing_events(tenant_id, source, event_name, created_at DESC)
WHERE source = 'douyin_miniapp';

CREATE INDEX marketing_events_douyin_installation_created_idx
ON public.marketing_events(douyin_miniapp_installation_id, created_at DESC)
WHERE source = 'douyin_miniapp';

CREATE INDEX douyin_lead_submissions_tenant_created_idx
ON public.douyin_miniapp_lead_submissions(tenant_id, created_at DESC);

CREATE INDEX douyin_lead_submissions_marketing_lead_idx
ON public.douyin_miniapp_lead_submissions(marketing_lead_id);

ALTER TABLE public.douyin_miniapp_lead_submissions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.douyin_miniapp_lead_submissions
FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.submit_douyin_miniapp_lead(
  p_douyin_miniapp_installation_id uuid,
  p_tenant_id uuid,
  p_phone text,
  p_name text,
  p_community text,
  p_area numeric,
  p_budget text,
  p_start_time text,
  p_demand text,
  p_sms_code text,
  p_request_digest text,
  p_idempotency_key uuid,
  p_subject_hash text,
  p_request_ip text,
  p_user_agent text,
  p_privacy_policy_version text,
  p_consented_at timestamptz,
  p_attribution jsonb
)
RETURNS TABLE (
  lead_id uuid,
  already_submitted boolean,
  updated_existing boolean,
  message text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_installation_id uuid;
  v_tenant_id uuid;
  v_expected_privacy_policy_version text;
  v_submission public.douyin_miniapp_lead_submissions%ROWTYPE;
  v_sms public.sms_verification_codes%ROWTYPE;
  v_lead_id uuid;
  v_already_submitted boolean := false;
  v_updated_existing boolean := false;
  v_message constant text := '你已提交预约，我们将尽快联系你';
  v_form_data jsonb;
  v_now timestamptz;
BEGIN
  v_now := clock_timestamp();

  IF p_douyin_miniapp_installation_id IS NULL
    OR p_tenant_id IS NULL
    OR p_idempotency_key IS NULL
    OR p_phone IS NULL
    OR p_phone <> btrim(p_phone)
    OR p_phone !~ '^1[3-9][0-9]{9}$'
    OR p_sms_code IS NULL
    OR p_sms_code !~ '^[0-9]{4,8}$'
    OR p_request_digest IS NULL
    OR p_request_digest !~ '^[0-9a-f]{64}$'
    OR p_subject_hash IS NULL
    OR p_subject_hash !~ '^[0-9a-f]{64}$'
    OR p_privacy_policy_version IS NULL
    OR btrim(p_privacy_policy_version) = ''
    OR length(p_privacy_policy_version) > 40
    OR p_consented_at IS NULL
    OR p_consented_at > v_now + interval '5 minutes'
    OR p_attribution IS NULL
    OR jsonb_typeof(p_attribution) <> 'object'
    OR (p_name IS NOT NULL AND (btrim(p_name) = '' OR length(p_name) > 40))
    OR (p_community IS NOT NULL AND (btrim(p_community) = '' OR length(p_community) > 80))
    OR (p_area IS NOT NULL AND (p_area <= 0 OR p_area > 100000))
    OR (p_budget IS NOT NULL AND (btrim(p_budget) = '' OR length(p_budget) > 40))
    OR (p_start_time IS NOT NULL AND (btrim(p_start_time) = '' OR length(p_start_time) > 40))
    OR (p_demand IS NOT NULL AND (btrim(p_demand) = '' OR length(p_demand) > 1000))
    OR (p_request_ip IS NOT NULL AND length(p_request_ip) > 64)
    OR (p_user_agent IS NOT NULL AND length(p_user_agent) > 512)
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'DOUYIN_LEAD_INVALID_INPUT';
  END IF;

  IF p_attribution - ARRAY[
    'source_type', 'entry_path', 'scene', 'campaign_code', 'content_id'
  ] <> '{}'::jsonb
    OR pg_catalog.octet_length(p_attribution::text) > 2048
    OR EXISTS (
      SELECT 1
      FROM jsonb_each(p_attribution) AS attribution(key, value)
      WHERE jsonb_typeof(attribution.value) <> 'string'
        OR length(attribution.value #>> '{}') > 120
    )
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'DOUYIN_ATTRIBUTION_INVALID';
  END IF;

  SELECT
    installation.id,
    installation.runtime_config ->> 'privacy_policy_version'
  INTO v_installation_id, v_expected_privacy_policy_version
  FROM public.douyin_miniapp_installations AS installation
  WHERE installation.id = p_douyin_miniapp_installation_id
    AND installation.tenant_id = p_tenant_id
    AND installation.authorization_status = 'active'
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'DOUYIN_INSTALLATION_DISABLED';
  END IF;

  IF v_expected_privacy_policy_version IS NULL
    OR v_expected_privacy_policy_version IS DISTINCT FROM p_privacy_policy_version
  THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'DOUYIN_PRIVACY_POLICY_VERSION_MISMATCH';
  END IF;

  SELECT tenant.id
  INTO v_tenant_id
  FROM public.tenants AS tenant
  WHERE tenant.id = p_tenant_id
    AND tenant.status = 'active'
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'DOUYIN_TENANT_NOT_ACTIVE';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'douyin:idempotency:' || p_douyin_miniapp_installation_id::text
        || ':' || p_idempotency_key::text,
      0
    )
  );

  SELECT submission.*
  INTO v_submission
  FROM public.douyin_miniapp_lead_submissions AS submission
  WHERE submission.douyin_miniapp_installation_id = p_douyin_miniapp_installation_id
    AND submission.idempotency_key = p_idempotency_key
  FOR UPDATE;

  IF FOUND THEN
    IF v_submission.request_digest IS DISTINCT FROM p_request_digest THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'DOUYIN_IDEMPOTENCY_CONFLICT';
    END IF;

    RETURN QUERY SELECT
      v_submission.marketing_lead_id,
      v_submission.already_submitted,
      v_submission.updated_existing,
      v_submission.message;
    RETURN;
  END IF;

  -- Share the reservation lock namespace so a newer code cannot be inserted
  -- between choosing the latest issued row and consuming it.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('sms:phone:douyin_lead:' || p_phone, 0)
  );

  SELECT sms.*
  INTO v_sms
  FROM public.sms_verification_codes AS sms
  WHERE sms.scene = 'douyin_lead'
    AND sms.phone = p_phone
  ORDER BY sms.created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SMS_CODE_INVALID';
  END IF;

  IF v_sms.status IS DISTINCT FROM 'pending'
    OR v_sms.request_device IS DISTINCT FROM p_subject_hash
    OR v_sms.code IS DISTINCT FROM p_sms_code
  THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SMS_CODE_INVALID';
  END IF;

  v_now := clock_timestamp();
  IF v_sms.expired_at <= v_now THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SMS_CODE_EXPIRED';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_tenant_id::text || ':' || p_phone, 0)
  );

  SELECT lead.id
  INTO v_lead_id
  FROM public.marketing_leads AS lead
  WHERE lead.tenant_id = p_tenant_id
    AND lead.source = 'douyin_miniapp'
    AND lead.phone = p_phone
    AND lead.created_at >= v_now - interval '24 hours'
  ORDER BY lead.created_at DESC
  LIMIT 1
  FOR UPDATE;

  v_form_data := jsonb_build_object(
    'area', p_area,
    'budget', p_budget,
    'start_time', p_start_time,
    'demand', p_demand,
    'privacy_policy_version', p_privacy_policy_version,
    'consented_at', p_consented_at,
    'attribution', p_attribution
  );

  IF FOUND THEN
    UPDATE public.marketing_leads AS lead
    SET douyin_miniapp_installation_id = p_douyin_miniapp_installation_id,
        name = p_name,
        community = p_community,
        form_data = v_form_data,
        request_ip = p_request_ip,
        user_agent = p_user_agent
    WHERE lead.id = v_lead_id;

    v_already_submitted := true;
    v_updated_existing := true;
  ELSE
    INSERT INTO public.marketing_leads (
      tenant_id,
      douyin_miniapp_installation_id,
      name,
      phone,
      community,
      form_data,
      source,
      request_ip,
      user_agent
    ) VALUES (
      p_tenant_id,
      p_douyin_miniapp_installation_id,
      p_name,
      p_phone,
      p_community,
      v_form_data,
      'douyin_miniapp',
      p_request_ip,
      p_user_agent
    )
    RETURNING id INTO v_lead_id;
  END IF;

  UPDATE public.sms_verification_codes
  SET status = 'verified',
      verified_at = v_now
  WHERE id = v_sms.id;

  INSERT INTO public.douyin_miniapp_lead_submissions (
    douyin_miniapp_installation_id,
    tenant_id,
    idempotency_key,
    request_digest,
    marketing_lead_id,
    sms_verification_code_id,
    already_submitted,
    updated_existing,
    message
  ) VALUES (
    p_douyin_miniapp_installation_id,
    p_tenant_id,
    p_idempotency_key,
    p_request_digest,
    v_lead_id,
    v_sms.id,
    v_already_submitted,
    v_updated_existing,
    v_message
  );

  INSERT INTO public.marketing_events (
    tenant_id,
    douyin_miniapp_installation_id,
    source,
    subject_hash,
    event_name,
    payload,
    request_ip,
    user_agent,
    created_at
  ) VALUES
    (
      p_tenant_id,
      p_douyin_miniapp_installation_id,
      'douyin_miniapp',
      p_subject_hash,
      'lead_submit',
      p_attribution || jsonb_build_object('lead_id', v_lead_id),
      p_request_ip,
      p_user_agent,
      v_now
    ),
    (
      p_tenant_id,
      p_douyin_miniapp_installation_id,
      'douyin_miniapp',
      p_subject_hash,
      'lead_submit_success',
      p_attribution || jsonb_build_object('lead_id', v_lead_id),
      p_request_ip,
      p_user_agent,
      v_now
    );

  RETURN QUERY SELECT
    v_lead_id,
    v_already_submitted,
    v_updated_existing,
    v_message;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_douyin_miniapp_lead(
  uuid, uuid, text, text, text, numeric, text, text, text, text, text,
  uuid, text, text, text, text, timestamptz, jsonb
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.submit_douyin_miniapp_lead(
  uuid, uuid, text, text, text, numeric, text, text, text, text, text,
  uuid, text, text, text, text, timestamptz, jsonb
) TO service_role;

COMMENT ON TABLE public.douyin_miniapp_lead_submissions
IS '抖音小程序留资幂等事实，只允许通过原子 RPC 写入';

COMMENT ON COLUMN public.marketing_leads.douyin_miniapp_installation_id
IS '抖音小程序来源线索的安装实例；H5 线索为空';

COMMENT ON COLUMN public.marketing_events.douyin_miniapp_installation_id
IS '抖音小程序营销事件的安装实例；H5 事件为空';

COMMENT ON COLUMN public.marketing_events.source
IS '营销事件来源，历史及 H5 事件默认 h5';

COMMENT ON COLUMN public.marketing_events.subject_hash
IS '不可逆的抖音访问主体哈希；不得存储原始 OpenID';

COMMIT;
