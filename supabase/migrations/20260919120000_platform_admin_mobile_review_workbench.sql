ALTER TABLE public.platform_partner_applications
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;

ALTER TABLE public.platform_partner_applications
  DROP CONSTRAINT IF EXISTS platform_partner_applications_status_check;

ALTER TABLE public.platform_partner_applications
  ADD CONSTRAINT platform_partner_applications_status_check CHECK (
    status IN (
      'submitted',
      'reviewing',
      'supplement_required',
      'approved',
      'rejected',
      'withdrawn'
    )
  );

ALTER TABLE public.platform_partner_applications
  DROP CONSTRAINT IF EXISTS platform_partner_applications_version_check;

ALTER TABLE public.platform_partner_applications
  ADD CONSTRAINT platform_partner_applications_version_check CHECK (version > 0);

CREATE INDEX IF NOT EXISTS platform_partner_applications_status_updated_idx
  ON public.platform_partner_applications(status, updated_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS public.platform_partner_application_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.platform_partner_applications(id),
  action text NOT NULL,
  from_status text NOT NULL,
  to_status text NOT NULL,
  expected_version integer NOT NULL,
  result_version integer NOT NULL,
  required_fields text[] NOT NULL DEFAULT '{}'::text[],
  remark text NOT NULL,
  actor_employee_id uuid NOT NULL REFERENCES public.employees(id),
  idempotency_key uuid NOT NULL,
  request_hash text NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_partner_application_reviews_action_check CHECK (
    action IN ('approve', 'reject', 'request_supplement')
  ),
  CONSTRAINT platform_partner_application_reviews_version_check CHECK (
    expected_version > 0 AND result_version > expected_version
  ),
  CONSTRAINT platform_partner_application_reviews_remark_not_blank CHECK (
    btrim(remark) <> ''
  ),
  CONSTRAINT platform_partner_application_reviews_request_hash_not_blank CHECK (
    btrim(request_hash) <> ''
  ),
  UNIQUE (actor_employee_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS platform_partner_application_reviews_target_created_idx
  ON public.platform_partner_application_reviews(application_id, created_at DESC, id DESC);

ALTER TABLE public.platform_partner_application_reviews ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.review_platform_partner_application(
  p_application_id uuid,
  p_expected_version integer,
  p_action text,
  p_remark text,
  p_required_fields text[],
  p_partner_level_code text,
  p_region_codes text[],
  p_generate_default_invite_code boolean,
  p_actor_employee_id uuid,
  p_idempotency_key uuid,
  p_request_hash text,
  p_now timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_application public.platform_partner_applications%ROWTYPE;
  v_existing_review public.platform_partner_application_reviews%ROWTYPE;
  v_from_status text;
  v_to_status text;
  v_level_id uuid;
  v_partner_id uuid;
  v_member_id uuid;
  v_invite_code_id uuid;
  v_invite_code text;
  v_result jsonb;
BEGIN
  IF p_application_id IS NULL
    OR p_expected_version IS NULL
    OR p_expected_version < 1
    OR p_action IS NULL
    OR p_actor_employee_id IS NULL
    OR p_idempotency_key IS NULL
    OR NULLIF(pg_catalog.btrim(COALESCE(p_request_hash, '')), '') IS NULL
    OR NULLIF(pg_catalog.btrim(COALESCE(p_remark, '')), '') IS NULL
  THEN
    RETURN pg_catalog.jsonb_build_object('status', 'validation_error');
  END IF;

  IF p_action NOT IN ('approve', 'reject', 'request_supplement') THEN
    RETURN pg_catalog.jsonb_build_object('status', 'validation_error');
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'partner-application-review:' || p_actor_employee_id::text || ':' || p_idempotency_key::text,
      0
    )
  );

  SELECT review.*
  INTO v_existing_review
  FROM public.platform_partner_application_reviews AS review
  WHERE review.actor_employee_id = p_actor_employee_id
    AND review.idempotency_key = p_idempotency_key
  LIMIT 1;

  IF FOUND THEN
    IF v_existing_review.request_hash <> p_request_hash THEN
      RETURN pg_catalog.jsonb_build_object('status', 'idempotency_conflict');
    END IF;
    RETURN v_existing_review.result || pg_catalog.jsonb_build_object('idempotent', true);
  END IF;

  SELECT application.*
  INTO v_application
  FROM public.platform_partner_applications AS application
  WHERE application.id = p_application_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('status', 'application_not_found');
  END IF;

  IF v_application.version <> p_expected_version THEN
    RETURN pg_catalog.jsonb_build_object(
      'status', 'version_conflict',
      'current_version', v_application.version
    );
  END IF;

  IF v_application.status IN ('approved', 'rejected', 'withdrawn') THEN
    RETURN pg_catalog.jsonb_build_object(
      'status', 'already_reviewed',
      'current_status', v_application.status,
      'current_version', v_application.version
    );
  END IF;

  v_from_status := v_application.status;

  IF p_action = 'approve' THEN
    IF v_application.status NOT IN ('submitted', 'reviewing')
      OR NULLIF(pg_catalog.btrim(COALESCE(p_partner_level_code, '')), '') IS NULL
      OR pg_catalog.coalesce(pg_catalog.array_length(p_region_codes, 1), 0) = 0
    THEN
      RETURN pg_catalog.jsonb_build_object('status', 'validation_error');
    END IF;

    SELECT level.id
    INTO v_level_id
    FROM public.platform_partner_levels AS level
    WHERE level.code = p_partner_level_code
      AND level.status = 'active'
    LIMIT 1;

    IF v_level_id IS NULL THEN
      RETURN pg_catalog.jsonb_build_object('status', 'partner_level_not_found');
    END IF;

    INSERT INTO public.platform_partners (
      name,
      subject_type,
      contact_name,
      phone,
      status,
      level_id,
      region_codes,
      contract_status,
      settlement_account_status,
      settlement_account,
      remark,
      created_by_employee_id,
      updated_by_employee_id
    ) VALUES (
      v_application.applicant_name,
      v_application.subject_type,
      v_application.contact_name,
      v_application.phone,
      'active',
      v_level_id,
      p_region_codes,
      'pending',
      'pending',
      '{}'::jsonb,
      pg_catalog.btrim(p_remark),
      p_actor_employee_id,
      p_actor_employee_id
    )
    RETURNING id INTO v_partner_id;

    INSERT INTO public.platform_partner_members (
      partner_id,
      name,
      phone,
      role,
      status,
      created_by_employee_id,
      updated_by_employee_id
    ) VALUES (
      v_partner_id,
      v_application.contact_name,
      v_application.phone,
      'owner',
      'pending_bind',
      p_actor_employee_id,
      p_actor_employee_id
    )
    RETURNING id INTO v_member_id;

    IF COALESCE(p_generate_default_invite_code, false) THEN
      v_invite_code := 'CP-' || p_region_codes[1] || '-' ||
        pg_catalog.upper(pg_catalog.right(pg_catalog.replace(v_partner_id::text, '-', ''), 12));
      INSERT INTO public.platform_partner_invite_codes (
        partner_id,
        code,
        region_code,
        campaign_code,
        status,
        created_by_employee_id
      ) VALUES (
        v_partner_id,
        v_invite_code,
        p_region_codes[1],
        pg_catalog.replace(v_invite_code, 'CP-', 'PIC-'),
        'active',
        p_actor_employee_id
      )
      RETURNING id INTO v_invite_code_id;
    END IF;

    v_to_status := 'approved';
  ELSIF p_action = 'request_supplement' THEN
    IF v_application.status NOT IN ('submitted', 'reviewing')
      OR pg_catalog.coalesce(pg_catalog.array_length(p_required_fields, 1), 0) = 0
    THEN
      RETURN pg_catalog.jsonb_build_object('status', 'validation_error');
    END IF;
    v_to_status := 'supplement_required';
  ELSIF p_action = 'reject' THEN
    IF v_application.status NOT IN ('submitted', 'reviewing') THEN
      RETURN pg_catalog.jsonb_build_object('status', 'validation_error');
    END IF;
    v_to_status := 'rejected';
  ELSE
    RETURN pg_catalog.jsonb_build_object('status', 'validation_error');
  END IF;

  UPDATE public.platform_partner_applications AS application
  SET status = v_to_status,
      converted_partner_id = CASE
        WHEN p_action = 'approve' THEN v_partner_id
        ELSE application.converted_partner_id
      END,
      reviewed_by_employee_id = p_actor_employee_id,
      reviewed_at = p_now,
      review_remark = pg_catalog.btrim(p_remark),
      version = application.version + 1,
      metadata = CASE
        WHEN p_action = 'request_supplement' THEN
          application.metadata || pg_catalog.jsonb_build_object(
            'required_fields', COALESCE(p_required_fields, '{}'::text[])
          )
        ELSE application.metadata
      END
  WHERE application.id = p_application_id
  RETURNING application.* INTO v_application;

  v_result := pg_catalog.jsonb_build_object(
    'status', 'updated',
    'idempotent', false,
    'application', pg_catalog.jsonb_build_object(
      'id', v_application.id,
      'status', v_application.status,
      'version', v_application.version,
      'converted_partner_id', v_application.converted_partner_id
    ),
    'partner', CASE
      WHEN v_partner_id IS NULL THEN NULL
      ELSE pg_catalog.jsonb_build_object(
        'id', v_partner_id,
        'name', v_application.applicant_name,
        'status', 'active',
        'default_invite_code', v_invite_code
      )
    END
  );

  INSERT INTO public.platform_partner_application_reviews (
    application_id,
    action,
    from_status,
    to_status,
    expected_version,
    result_version,
    required_fields,
    remark,
    actor_employee_id,
    idempotency_key,
    request_hash,
    result,
    created_at
  ) VALUES (
    p_application_id,
    p_action,
    v_from_status,
    v_to_status,
    p_expected_version,
    v_application.version,
    COALESCE(p_required_fields, '{}'::text[]),
    pg_catalog.btrim(p_remark),
    p_actor_employee_id,
    p_idempotency_key,
    p_request_hash,
    v_result,
    p_now
  );

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.review_platform_partner_application(
  uuid,
  integer,
  text,
  text,
  text[],
  text,
  text[],
  boolean,
  uuid,
  uuid,
  text,
  timestamptz
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.review_platform_partner_application(
  uuid,
  integer,
  text,
  text,
  text[],
  text,
  text[],
  boolean,
  uuid,
  uuid,
  text,
  timestamptz
) TO service_role;

COMMENT ON COLUMN public.platform_partner_applications.version IS
  '城市合伙人申请乐观并发版本号';

COMMENT ON TABLE public.platform_partner_application_reviews IS
  '城市合伙人申请最终平台审核记录与幂等回放结果';

COMMENT ON FUNCTION public.review_platform_partner_application(
  uuid,
  integer,
  text,
  text,
  text[],
  text,
  text[],
  boolean,
  uuid,
  uuid,
  text,
  timestamptz
) IS '原子执行城市合伙人申请审核、转正式合伙人、记录审核证据并支持幂等回放';
