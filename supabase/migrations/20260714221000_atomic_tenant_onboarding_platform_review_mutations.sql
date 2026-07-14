-- Keep each platform review state transition and its append-only review record
-- in one transaction. Rollback by revoking/dropping this function and dropping
-- the service-region GIN index. Existing review/application rows are business
-- data and must not be deleted on rollback.

BEGIN;

CREATE INDEX IF NOT EXISTS tenant_onboarding_applications_service_regions_gin_idx
  ON public.tenant_onboarding_applications USING gin(service_region_codes);

CREATE OR REPLACE FUNCTION public.mutate_tenant_onboarding_platform_review(
  p_application_id uuid,
  p_expected_version integer,
  p_reviewer_employee_id uuid,
  p_action text,
  p_required_fields text[],
  p_remark text,
  p_partner_id uuid,
  p_candidate_snapshot jsonb,
  p_now timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_application public.tenant_onboarding_applications%ROWTYPE;
  v_after public.tenant_onboarding_applications%ROWTYPE;
  v_remark text;
  v_invalid_required_field text;
  v_partner_name text;
  v_partner_region_codes text[];
  v_candidate_snapshot jsonb;
  v_fresh_invite_partner_id uuid;
  v_fresh_eligible_partner_ids uuid[];
BEGIN
  IF p_application_id IS NULL
    OR p_expected_version IS NULL
    OR p_expected_version < 1
    OR p_reviewer_employee_id IS NULL
    OR p_action NOT IN (
      'start_review',
      'request_supplement',
      'request_partner_assist',
      'reject'
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'TENANT_ONBOARDING_PLATFORM_REVIEW_INPUT_INVALID';
  END IF;

  v_remark := NULLIF(pg_catalog.btrim(COALESCE(p_remark, '')), '');

  SELECT application.*
  INTO v_application
  FROM public.tenant_onboarding_applications AS application
  WHERE application.id = p_application_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('status', 'application_not_found');
  END IF;

  IF p_action = 'start_review'
    AND v_application.status = 'reviewing'
    AND v_application.version = p_expected_version
  THEN
    RETURN pg_catalog.jsonb_build_object(
      'status', 'updated',
      'application_id', v_application.id,
      'application_version', v_application.version,
      'idempotent', true
    );
  END IF;

  IF v_application.version IS DISTINCT FROM p_expected_version THEN
    RETURN pg_catalog.jsonb_build_object('status', 'version_conflict');
  END IF;

  IF p_action = 'start_review' THEN
    IF v_application.status <> 'submitted' THEN
      RETURN pg_catalog.jsonb_build_object('status', 'state_conflict');
    END IF;

    UPDATE public.tenant_onboarding_applications AS application
    SET
      status = 'reviewing',
      version = application.version + 1,
      updated_at = p_now
    WHERE application.id = v_application.id
    RETURNING application.* INTO v_after;

  ELSIF p_action = 'request_supplement' THEN
    IF v_application.status NOT IN ('submitted', 'reviewing') THEN
      RETURN pg_catalog.jsonb_build_object('status', 'state_conflict');
    END IF;
    IF v_remark IS NULL
      OR pg_catalog.cardinality(COALESCE(p_required_fields, '{}'::text[]))
        NOT BETWEEN 1 AND 20
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'TENANT_ONBOARDING_SUPPLEMENT_INPUT_INVALID';
    END IF;

    SELECT field.value
    INTO v_invalid_required_field
    FROM pg_catalog.unnest(p_required_fields) AS field(value)
    WHERE field.value NOT IN (
      'company_name',
      'unified_social_credit_code',
      'business_license_file_id',
      'admin_name',
      'company_location',
      'service_region_codes'
    )
    LIMIT 1;
    IF v_invalid_required_field IS NOT NULL
      OR pg_catalog.cardinality(p_required_fields) <> (
        SELECT pg_catalog.count(DISTINCT field.value)::integer
        FROM pg_catalog.unnest(p_required_fields) AS field(value)
      )
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'TENANT_ONBOARDING_SUPPLEMENT_INPUT_INVALID';
    END IF;

    UPDATE public.tenant_onboarding_applications AS application
    SET
      status = 'supplement_required',
      review_remark = v_remark,
      version = application.version + 1,
      updated_at = p_now
    WHERE application.id = v_application.id
    RETURNING application.* INTO v_after;

  ELSIF p_action = 'request_partner_assist' THEN
    IF v_application.status NOT IN (
      'submitted',
      'reviewing',
      'supplement_required'
    ) OR v_application.partner_assist_status NOT IN (
      'not_applicable',
      'expired'
    ) THEN
      RETURN pg_catalog.jsonb_build_object('status', 'state_conflict');
    END IF;
    IF p_partner_id IS NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'TENANT_ONBOARDING_PARTNER_ASSIST_INPUT_INVALID';
    END IF;

    -- The review queue is low frequency. Recompute the authoritative eligible
    -- set under these locks so service-side resolution cannot go stale before
    -- this mutation commits.
    LOCK TABLE public.administrative_areas IN SHARE MODE;
    LOCK TABLE public.platform_partners IN SHARE MODE;
    LOCK TABLE public.platform_partner_invite_codes IN SHARE MODE;

    SELECT partner.id
    INTO v_fresh_invite_partner_id
    FROM public.platform_partner_invite_codes AS invite
    JOIN public.platform_partners AS partner
      ON partner.id = invite.partner_id
     AND partner.status = 'active'
    WHERE invite.id = v_application.invite_code_id
      AND invite.status = 'active'
      AND (invite.expires_at IS NULL OR invite.expires_at > pg_catalog.now())
      AND EXISTS (
        SELECT 1
        FROM public.resolve_tenant_onboarding_region_paths(
          v_application.service_region_codes
        ) AS invite_path
        WHERE invite_path.adcode = ANY (partner.region_codes)
      )
    LIMIT 1;

    IF v_fresh_invite_partner_id IS NOT NULL THEN
      v_fresh_eligible_partner_ids := ARRAY[v_fresh_invite_partner_id];
    ELSE
      WITH fresh_region_paths AS (
        SELECT path.service_code, path.adcode, path.level
        FROM public.resolve_tenant_onboarding_region_paths(
          v_application.service_region_codes
        ) AS path
      ),
      fresh_bounded_region_partners AS (
        SELECT partner.id, partner.region_codes
        FROM public.platform_partners AS partner
        WHERE partner.status = 'active'
          AND EXISTS (
            SELECT 1
            FROM fresh_region_paths AS path
            WHERE path.adcode = ANY (partner.region_codes)
          )
        ORDER BY partner.id ASC
        LIMIT 101
      ),
      fresh_region_partner_matches AS (
        SELECT
          partner.id AS partner_id,
          path.service_code,
          pg_catalog.max(
            CASE path.level
              WHEN 'district' THEN 2
              WHEN 'city' THEN 1
              ELSE 0
            END
          ) AS specificity
        FROM fresh_bounded_region_partners AS partner
        JOIN fresh_region_paths AS path
          ON path.adcode = ANY (partner.region_codes)
        GROUP BY partner.id, path.service_code
      ),
      fresh_region_partner_scores AS (
        SELECT
          matched.partner_id,
          pg_catalog.count(*) FILTER (
            WHERE matched.specificity = 2
          )::integer AS district_matches,
          pg_catalog.count(*) FILTER (
            WHERE matched.specificity = 1
          )::integer AS city_matches,
          pg_catalog.count(*) FILTER (
            WHERE matched.specificity = 0
          )::integer AS province_matches
        FROM fresh_region_partner_matches AS matched
        GROUP BY matched.partner_id
      ),
      fresh_best_region_score AS (
        SELECT score.district_matches, score.city_matches,
          score.province_matches
        FROM fresh_region_partner_scores AS score
        ORDER BY score.district_matches DESC, score.city_matches DESC,
          score.province_matches DESC
        LIMIT 1
      ),
      fresh_best_region_partners AS (
        SELECT score.partner_id
        FROM fresh_region_partner_scores AS score
        CROSS JOIN fresh_best_region_score AS best
        WHERE score.district_matches = best.district_matches
          AND score.city_matches = best.city_matches
          AND score.province_matches = best.province_matches
      )
      SELECT CASE
        WHEN (
          SELECT pg_catalog.count(*)
          FROM fresh_bounded_region_partners
        ) > 100 THEN '{}'::uuid[]
        ELSE COALESCE(
          (
            SELECT pg_catalog.array_agg(
              eligible.partner_id ORDER BY eligible.partner_id
            )
            FROM fresh_best_region_partners AS eligible
          ),
          '{}'::uuid[]
        )
      END
      INTO v_fresh_eligible_partner_ids;
    END IF;

    SELECT partner.name, partner.region_codes
    INTO v_partner_name, v_partner_region_codes
    FROM public.platform_partners AS partner
    WHERE partner.id = p_partner_id
      AND partner.status = 'active'
      AND p_partner_id = ANY (v_fresh_eligible_partner_ids)
    LIMIT 1;

    IF NOT FOUND THEN
      RETURN pg_catalog.jsonb_build_object('status', 'partner_unavailable');
    END IF;

    v_candidate_snapshot := COALESCE(p_candidate_snapshot, '{}'::jsonb)
      || pg_catalog.jsonb_build_object(
        'partner_id', p_partner_id,
        'partner_name', v_partner_name,
        'region_codes', v_partner_region_codes,
        'eligible_partner_ids', v_fresh_eligible_partner_ids,
        'match_reason', 'platform_manual_assist'
      );

    UPDATE public.tenant_onboarding_applications AS application
    SET
      candidate_partner_id = p_partner_id,
      candidate_match_reason = 'platform_manual_assist',
      candidate_snapshot = v_candidate_snapshot,
      partner_assist_status = 'pending',
      partner_assist_requested_at = p_now,
      partner_assist_due_at = p_now + interval '48 hours',
      version = application.version + 1,
      updated_at = p_now
    WHERE application.id = v_application.id
    RETURNING application.* INTO v_after;

  ELSIF p_action = 'reject' THEN
    IF v_application.status NOT IN (
      'submitted',
      'reviewing',
      'supplement_required'
    ) THEN
      RETURN pg_catalog.jsonb_build_object('status', 'state_conflict');
    END IF;
    IF v_remark IS NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'TENANT_ONBOARDING_REJECT_REASON_REQUIRED';
    END IF;

    UPDATE public.tenant_onboarding_applications AS application
    SET
      status = 'rejected',
      partner_assist_status = CASE
        WHEN application.partner_assist_status = 'pending' THEN 'expired'
        ELSE application.partner_assist_status
      END,
      reviewed_by_employee_id = p_reviewer_employee_id,
      reviewed_at = p_now,
      review_remark = v_remark,
      version = application.version + 1,
      updated_at = p_now
    WHERE application.id = v_application.id
    RETURNING application.* INTO v_after;
  END IF;

  INSERT INTO public.tenant_onboarding_application_reviews (
    application_id,
    review_stage,
    decision,
    actor_type,
    actor_employee_id,
    before_status,
    after_status,
    before_partner_assist_status,
    after_partner_assist_status,
    required_fields,
    remark,
    metadata
  )
  VALUES (
    v_application.id,
    'platform_review',
    p_action,
    'platform_employee',
    p_reviewer_employee_id,
    v_application.status,
    v_after.status,
    v_application.partner_assist_status,
    v_after.partner_assist_status,
    CASE
      WHEN p_action = 'request_supplement' THEN p_required_fields
      ELSE '{}'::text[]
    END,
    v_remark,
    pg_catalog.jsonb_build_object(
      'before_version', v_application.version,
      'after_version', v_after.version
    ) || CASE
      WHEN p_action = 'request_partner_assist' THEN
        pg_catalog.jsonb_build_object(
          'candidate_partner_id', p_partner_id,
          'assist_due_at', v_after.partner_assist_due_at
        )
      ELSE '{}'::jsonb
    END
  );

  RETURN pg_catalog.jsonb_build_object(
    'status', 'updated',
    'application_id', v_after.id,
    'application_version', v_after.version,
    'idempotent', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.mutate_tenant_onboarding_platform_review(
  uuid,
  integer,
  uuid,
  text,
  text[],
  text,
  uuid,
  jsonb,
  timestamptz
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mutate_tenant_onboarding_platform_review(
  uuid,
  integer,
  uuid,
  text,
  text[],
  text,
  uuid,
  jsonb,
  timestamptz
) FROM anon;
REVOKE ALL ON FUNCTION public.mutate_tenant_onboarding_platform_review(
  uuid,
  integer,
  uuid,
  text,
  text[],
  text,
  uuid,
  jsonb,
  timestamptz
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.mutate_tenant_onboarding_platform_review(
  uuid,
  integer,
  uuid,
  text,
  text[],
  text,
  uuid,
  jsonb,
  timestamptz
) TO service_role;

COMMENT ON FUNCTION public.mutate_tenant_onboarding_platform_review(
  uuid,
  integer,
  uuid,
  text,
  text[],
  text,
  uuid,
  jsonb,
  timestamptz
) IS 'Atomically mutates one platform onboarding review action and appends its immutable review event.';

COMMIT;
