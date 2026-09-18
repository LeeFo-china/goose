-- Add secure share attribution for tenant-onboarding applications.
-- Rollback: drop the three RPCs, drop the five application attribution columns,
-- then drop tenant_onboarding_share_links. Existing applications remain valid.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '1min';

CREATE TABLE public.tenant_onboarding_share_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  share_token text NOT NULL UNIQUE,
  scene text NOT NULL DEFAULT 'tenant_onboarding',
  sharer_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  sharer_employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
  sharer_openid text NULL,
  sharer_display_name text NULL,
  idempotency_key uuid NOT NULL,
  status text NOT NULL DEFAULT 'active',
  expires_at timestamptz NOT NULL,
  view_count bigint NOT NULL DEFAULT 0,
  submitted_count bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_onboarding_share_links_scene_check
    CHECK (scene = 'tenant_onboarding'),
  CONSTRAINT tenant_onboarding_share_links_token_check
    CHECK (share_token ~ '^tnob_[A-Za-z0-9_-]{24,96}$'),
  CONSTRAINT tenant_onboarding_share_links_status_check
    CHECK (status IN ('active', 'revoked')),
  CONSTRAINT tenant_onboarding_share_links_open_count_check
    CHECK (view_count >= 0),
  CONSTRAINT tenant_onboarding_share_links_submitted_count_check
    CHECK (submitted_count >= 0),
  CONSTRAINT tenant_onboarding_share_links_expiry_check
    CHECK (expires_at > created_at),
  UNIQUE (sharer_user_id, idempotency_key)
);

CREATE INDEX tenant_onboarding_share_links_sharer_created_idx
  ON public.tenant_onboarding_share_links(sharer_user_id, created_at DESC, id DESC);

CREATE INDEX tenant_onboarding_share_links_token_active_idx
  ON public.tenant_onboarding_share_links(share_token, expires_at)
  WHERE status = 'active';

ALTER TABLE public.tenant_onboarding_share_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.tenant_onboarding_share_links FROM PUBLIC;
REVOKE ALL ON TABLE public.tenant_onboarding_share_links FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.tenant_onboarding_share_links TO service_role;

ALTER TABLE public.tenant_onboarding_applications
  ADD COLUMN share_link_id uuid NULL
    REFERENCES public.tenant_onboarding_share_links(id) ON DELETE SET NULL,
  ADD COLUMN referred_by_user_id uuid NULL
    REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN referred_by_openid text NULL,
  ADD COLUMN referred_by_employee_id uuid NULL
    REFERENCES public.employees(id) ON DELETE SET NULL,
  ADD COLUMN referral_source text NULL,
  ADD CONSTRAINT tenant_onboarding_applications_referral_source_check
    CHECK (referral_source IS NULL OR referral_source = 'tenant_onboarding_share'),
  ADD CONSTRAINT tenant_onboarding_applications_referral_shape_check
    CHECK (
      (share_link_id IS NULL
        AND referred_by_user_id IS NULL
        AND referred_by_openid IS NULL
        AND referred_by_employee_id IS NULL
        AND referral_source IS NULL)
      OR
      (share_link_id IS NOT NULL
        AND referred_by_user_id IS NOT NULL
        AND referred_by_employee_id IS NOT NULL
        AND referral_source = 'tenant_onboarding_share')
    );

CREATE INDEX tenant_onboarding_applications_share_link_created_idx
  ON public.tenant_onboarding_applications(share_link_id, created_at DESC, id DESC)
  WHERE share_link_id IS NOT NULL;

CREATE INDEX tenant_onboarding_applications_share_link_status_idx
  ON public.tenant_onboarding_applications(share_link_id, status)
  WHERE share_link_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.create_tenant_onboarding_share_link(
  p_share_token text,
  p_sharer_user_id uuid,
  p_sharer_employee_id uuid,
  p_sharer_openid text,
  p_sharer_display_name text,
  p_idempotency_key uuid,
  p_expires_at timestamptz,
  p_now timestamptz
)
RETURNS SETOF public.tenant_onboarding_share_links
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  INSERT INTO public.tenant_onboarding_share_links (
    share_token,
    sharer_user_id,
    sharer_employee_id,
    sharer_openid,
    sharer_display_name,
    idempotency_key,
    expires_at,
    created_at,
    updated_at
  ) VALUES (
    p_share_token,
    p_sharer_user_id,
    p_sharer_employee_id,
    NULLIF(btrim(p_sharer_openid), ''),
    NULLIF(btrim(p_sharer_display_name), ''),
    p_idempotency_key,
    p_expires_at,
    p_now,
    p_now
  )
  ON CONFLICT (sharer_user_id, idempotency_key) DO NOTHING;

  RETURN QUERY
  SELECT share_link.*
  FROM public.tenant_onboarding_share_links AS share_link
  WHERE share_link.sharer_user_id = p_sharer_user_id
    AND share_link.idempotency_key = p_idempotency_key;
END;
$$;

REVOKE ALL ON FUNCTION public.create_tenant_onboarding_share_link(
  text, uuid, uuid, text, text, uuid, timestamptz, timestamptz
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_tenant_onboarding_share_link(
  text, uuid, uuid, text, text, uuid, timestamptz, timestamptz
) TO service_role;

CREATE OR REPLACE FUNCTION public.record_tenant_onboarding_share_open(
  p_share_token text,
  p_visitor_id text,
  p_now timestamptz
)
RETURNS TABLE(valid boolean, share_token text, sharer_display_name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_share_token text;
  v_sharer_display_name text;
BEGIN
  IF NULLIF(btrim(COALESCE(p_share_token, '')), '') IS NULL
    OR NULLIF(btrim(COALESCE(p_visitor_id, '')), '') IS NULL
  THEN
    RETURN QUERY SELECT false, NULL::text, NULL::text;
    RETURN;
  END IF;

  UPDATE public.tenant_onboarding_share_links AS share_link
  SET
    view_count = share_link.view_count + 1,
    updated_at = p_now
  WHERE share_link.share_token = p_share_token
    AND share_link.scene = 'tenant_onboarding'
    AND share_link.status = 'active'
    AND share_link.expires_at > p_now
  RETURNING share_link.share_token, share_link.sharer_display_name
  INTO v_share_token, v_sharer_display_name;

  IF v_share_token IS NULL THEN
    RETURN QUERY SELECT false, NULL::text, NULL::text;
    RETURN;
  END IF;

  RETURN QUERY SELECT true, v_share_token, v_sharer_display_name;
END;
$$;

REVOKE ALL ON FUNCTION public.record_tenant_onboarding_share_open(
  text, text, timestamptz
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_tenant_onboarding_share_open(
  text, text, timestamptz
) TO service_role;

CREATE OR REPLACE FUNCTION public.list_tenant_onboarding_share_links(
  p_sharer_user_id uuid,
  p_offset integer,
  p_limit integer
)
RETURNS TABLE(
  id uuid,
  share_token text,
  status text,
  expires_at timestamptz,
  view_count bigint,
  submitted_count bigint,
  approved_count bigint,
  created_at timestamptz,
  total_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  WITH page AS (
    SELECT
      share_link.id,
      share_link.share_token,
      share_link.status,
      share_link.expires_at,
      share_link.view_count,
      share_link.submitted_count,
      share_link.created_at,
      count(*) OVER () AS total_count
    FROM public.tenant_onboarding_share_links AS share_link
    WHERE share_link.sharer_user_id = p_sharer_user_id
      AND share_link.scene = 'tenant_onboarding'
    ORDER BY share_link.created_at DESC, share_link.id DESC
    OFFSET greatest(COALESCE(p_offset, 0), 0)
    LIMIT least(greatest(COALESCE(p_limit, 20), 1), 100)
  )
  SELECT
    page.id,
    page.share_token,
    page.status,
    page.expires_at,
    page.view_count,
    page.submitted_count,
    count(*) FILTER (WHERE application.status = 'approved')::bigint AS approved_count,
    page.created_at,
    page.total_count
  FROM page
  LEFT JOIN public.tenant_onboarding_applications AS application
    ON application.share_link_id = page.id
  GROUP BY
    page.id,
    page.share_token,
    page.status,
    page.expires_at,
    page.view_count,
    page.submitted_count,
    page.created_at,
    page.total_count
  ORDER BY page.created_at DESC, page.id DESC;
$$;

REVOKE ALL ON FUNCTION public.list_tenant_onboarding_share_links(
  uuid, integer, integer
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_tenant_onboarding_share_links(
  uuid, integer, integer
) TO service_role;

CREATE OR REPLACE FUNCTION public.submit_tenant_onboarding_application(
  p_application jsonb,
  p_sms_code_id uuid,
  p_sms_phone text,
  p_now timestamptz
)
RETURNS TABLE(application_id uuid, created boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_application_id uuid;
  v_constraint_name text;
  v_share_link public.tenant_onboarding_share_links%ROWTYPE;
  v_allowed_keys constant text[] := ARRAY[
    'application_no', 'visitor_id', 'visitor_context_id', 'company_name',
    'unified_social_credit_code', 'business_license_file_id', 'admin_name',
    'admin_phone', 'address_province', 'address_city', 'address_district',
    'address_region_code', 'address', 'address_latitude', 'address_longitude',
    'service_region_codes', 'source_channel', 'invite_code_id',
    'candidate_partner_id', 'candidate_match_reason', 'candidate_snapshot',
    'partner_assist_status', 'partner_assist_requested_at',
    'partner_assist_due_at', 'privacy_policy_version',
    'onboarding_terms_version', 'consented_at', 'idempotency_key',
    'share_token'
  ];
BEGIN
  IF jsonb_typeof(p_application) IS DISTINCT FROM 'object'
    OR p_application - v_allowed_keys <> '{}'::jsonb
    OR NULLIF(btrim(p_application->>'visitor_id'), '') IS NULL
    OR NULLIF(btrim(p_application->>'idempotency_key'), '') IS NULL
    OR p_application->>'admin_phone' IS DISTINCT FROM p_sms_phone
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'TENANT_ONBOARDING_APPLICATION_PAYLOAD_INVALID';
  END IF;

  SELECT application.id
  INTO v_application_id
  FROM public.tenant_onboarding_applications AS application
  WHERE application.visitor_id = p_application->>'visitor_id'
    AND application.idempotency_key = p_application->>'idempotency_key';

  IF v_application_id IS NOT NULL THEN
    RETURN QUERY SELECT v_application_id, false;
    RETURN;
  END IF;

  IF NULLIF(btrim(p_application->>'share_token'), '') IS NOT NULL THEN
    SELECT share_link.*
    INTO v_share_link
    FROM public.tenant_onboarding_share_links AS share_link
    WHERE share_link.share_token = p_application->>'share_token'
      AND share_link.scene = 'tenant_onboarding'
      AND share_link.status = 'active'
      AND share_link.expires_at > p_now
    FOR UPDATE;
  END IF;

  PERFORM context.id
  FROM public.user_location_contexts AS context
  WHERE context.id = (p_application->>'visitor_context_id')::uuid
    AND context.visitor_id = p_application->>'visitor_id'
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'TENANT_ONBOARDING_CONTEXT_FORBIDDEN';
  END IF;

  PERFORM file.id
  FROM public.platform_file_objects AS file
  WHERE file.id = (p_application->>'business_license_file_id')::uuid
    AND file.owner_type = 'visitor'
    AND file.owner_visitor_id = p_application->>'visitor_id'
    AND file.scene = 'tenant_onboarding_license'
    AND file.status = 'active'
    AND file.visibility = 'private'
    AND file.deleted_at IS NULL
    AND file.public_url IS NULL
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'TENANT_ONBOARDING_DOCUMENT_FORBIDDEN';
  END IF;

  BEGIN
    UPDATE public.sms_verification_codes AS sms
    SET status = 'verified', verified_at = p_now
    WHERE sms.id = p_sms_code_id
      AND sms.phone = p_sms_phone
      AND sms.scene = 'tenant_onboarding_application'
      AND sms.status = 'pending'
      AND sms.expired_at > p_now
    RETURNING sms.id INTO v_application_id;

    IF v_application_id IS NULL THEN
      SELECT application.id
      INTO v_application_id
      FROM public.tenant_onboarding_applications AS application
      WHERE application.visitor_id = p_application->>'visitor_id'
        AND application.idempotency_key = p_application->>'idempotency_key';

      IF v_application_id IS NOT NULL THEN
        RETURN QUERY SELECT v_application_id, false;
        RETURN;
      END IF;

      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'TENANT_ONBOARDING_SMS_INVALID';
    END IF;

    INSERT INTO public.tenant_onboarding_applications (
      application_no, visitor_id, visitor_context_id, company_name,
      unified_social_credit_code, business_license_file_id, admin_name,
      admin_phone, address_province, address_city, address_district,
      address_region_code, address, address_latitude, address_longitude,
      service_region_codes, source_channel, invite_code_id,
      candidate_partner_id, candidate_match_reason, candidate_snapshot,
      partner_assist_status, partner_assist_requested_at,
      partner_assist_due_at, privacy_policy_version, onboarding_terms_version,
      consented_at, idempotency_key, share_link_id, referred_by_user_id,
      referred_by_openid, referred_by_employee_id, referral_source
    ) VALUES (
      p_application->>'application_no',
      p_application->>'visitor_id',
      NULLIF(p_application->>'visitor_context_id', '')::uuid,
      p_application->>'company_name',
      NULLIF(p_application->>'unified_social_credit_code', ''),
      (p_application->>'business_license_file_id')::uuid,
      p_application->>'admin_name',
      p_application->>'admin_phone',
      p_application->>'address_province',
      p_application->>'address_city',
      p_application->>'address_district',
      p_application->>'address_region_code',
      p_application->>'address',
      (p_application->>'address_latitude')::double precision,
      (p_application->>'address_longitude')::double precision,
      ARRAY(SELECT jsonb_array_elements_text(p_application->'service_region_codes')),
      p_application->>'source_channel',
      NULLIF(p_application->>'invite_code_id', '')::uuid,
      NULLIF(p_application->>'candidate_partner_id', '')::uuid,
      p_application->>'candidate_match_reason',
      COALESCE(p_application->'candidate_snapshot', '{}'::jsonb),
      p_application->>'partner_assist_status',
      NULLIF(p_application->>'partner_assist_requested_at', '')::timestamptz,
      NULLIF(p_application->>'partner_assist_due_at', '')::timestamptz,
      p_application->>'privacy_policy_version',
      p_application->>'onboarding_terms_version',
      (p_application->>'consented_at')::timestamptz,
      p_application->>'idempotency_key',
      v_share_link.id,
      v_share_link.sharer_user_id,
      v_share_link.sharer_openid,
      v_share_link.sharer_employee_id,
      CASE WHEN v_share_link.id IS NULL THEN NULL ELSE 'tenant_onboarding_share' END
    )
    RETURNING id INTO v_application_id;

    IF v_share_link.id IS NOT NULL THEN
      UPDATE public.tenant_onboarding_share_links AS share_link
      SET
        submitted_count = share_link.submitted_count + 1,
        updated_at = p_now
      WHERE share_link.id = v_share_link.id;
    END IF;
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS v_constraint_name = CONSTRAINT_NAME;
    IF v_constraint_name = 'tenant_onboarding_applications_visitor_idempotency_unique' THEN
      SELECT application.id
      INTO v_application_id
      FROM public.tenant_onboarding_applications AS application
      WHERE application.visitor_id = p_application->>'visitor_id'
        AND application.idempotency_key = p_application->>'idempotency_key';
      IF v_application_id IS NOT NULL THEN
        RETURN QUERY SELECT v_application_id, false;
        RETURN;
      END IF;
    END IF;
    RAISE;
  END;

  RETURN QUERY SELECT v_application_id, true;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_tenant_onboarding_application(
  jsonb, uuid, text, timestamptz
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_tenant_onboarding_application(
  jsonb, uuid, text, timestamptz
) TO service_role;

COMMENT ON TABLE public.tenant_onboarding_share_links IS
  'Server-issued tenant-onboarding share links and aggregate attribution counters.';
COMMENT ON COLUMN public.tenant_onboarding_share_links.share_token IS
  'Opaque random token returned only through authenticated API responses.';
COMMENT ON COLUMN public.tenant_onboarding_applications.referral_source IS
  'Server-derived referral source; tenant_onboarding_share when a valid share token was used.';

COMMIT;
