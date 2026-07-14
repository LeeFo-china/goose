-- Create the shared tenant-onboarding workflow, immutable review history,
-- service-provider publication profile, and notification delivery ledger.
--
-- Rollback: before onboarding data exists, revoke and drop the expiry function,
-- triggers, tables, indexes, permission grants, permissions, and added columns in
-- reverse dependency order. After data exists, disable workflow entry points and
-- use a forward migration so applications and append-only review history remain.

BEGIN;

ALTER TABLE public.tenants
ADD COLUMN IF NOT EXISTS unified_social_credit_code text NULL;

ALTER TABLE public.platform_file_objects
ADD COLUMN IF NOT EXISTS owner_visitor_id text NULL;

CREATE INDEX IF NOT EXISTS platform_file_objects_visitor_scene_idx
  ON public.platform_file_objects(owner_visitor_id, scene, created_at DESC)
  WHERE owner_visitor_id IS NOT NULL
    AND deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS tenants_unified_social_credit_code_unique_idx
  ON public.tenants(upper(btrim(unified_social_credit_code)))
  WHERE unified_social_credit_code IS NOT NULL
    AND btrim(unified_social_credit_code) <> '';

-- Operator remediation: inspect duplicate tenant/adcode rows and resolve them
-- via a follow-up migration before retrying; no business rows are auto-deleted.
DO $$
DECLARE
  v_duplicate record;
BEGIN
  SELECT
    service_areas.tenant_id,
    btrim(service_areas.adcode) AS normalized_adcode,
    count(*) AS duplicate_count
  INTO v_duplicate
  FROM public.tenant_service_areas AS service_areas
  WHERE service_areas.adcode IS NOT NULL
    AND btrim(service_areas.adcode) <> ''
  GROUP BY
    service_areas.tenant_id,
    btrim(service_areas.adcode)
  HAVING count(*) > 1
  ORDER BY service_areas.tenant_id, btrim(service_areas.adcode)
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'TENANT_SERVICE_AREA_ADCODE_DUPLICATE',
      DETAIL = format(
        'tenant_id=%s, adcode=%s, row_count=%s',
        v_duplicate.tenant_id,
        v_duplicate.normalized_adcode,
        v_duplicate.duplicate_count
      ),
      HINT = 'Inspect duplicate tenant_service_areas rows, resolve them via a follow-up migration, then retry.';
  END IF;
END;
$$;

UPDATE public.tenant_service_areas
SET adcode = btrim(adcode)
WHERE adcode IS NOT NULL
  AND btrim(adcode) <> ''
  AND adcode IS DISTINCT FROM btrim(adcode);

-- NOT VALID preserves legacy whitespace-only blank values while enforcing the
-- trim invariant on all new or updated rows.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tenant_service_areas_adcode_trimmed_check'
      AND conrelid = 'public.tenant_service_areas'::regclass
  ) THEN
    ALTER TABLE public.tenant_service_areas
    ADD CONSTRAINT tenant_service_areas_adcode_trimmed_check
    CHECK (adcode IS NULL OR adcode = btrim(adcode))
    NOT VALID;
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS tenant_service_areas_tenant_adcode_unique_idx
  ON public.tenant_service_areas(tenant_id, adcode)
  WHERE adcode IS NOT NULL
    AND btrim(adcode) <> '';

CREATE TABLE IF NOT EXISTS public.tenant_onboarding_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_no text NOT NULL UNIQUE,
  visitor_id text NOT NULL,
  visitor_context_id uuid NULL
    REFERENCES public.user_location_contexts(id) ON DELETE SET NULL,
  company_name text NOT NULL,
  unified_social_credit_code text NOT NULL,
  business_license_file_id uuid NOT NULL
    REFERENCES public.platform_file_objects(id) ON DELETE RESTRICT,
  admin_name text NOT NULL,
  admin_phone text NOT NULL,
  address_province text NULL,
  address_city text NOT NULL,
  address_district text NULL,
  address_region_code text NOT NULL,
  address text NOT NULL,
  address_latitude double precision NULL,
  address_longitude double precision NULL,
  service_region_codes text[] NOT NULL,
  source_channel text NOT NULL,
  invite_code_id uuid NULL
    REFERENCES public.platform_partner_invite_codes(id) ON DELETE SET NULL,
  candidate_partner_id uuid NULL
    REFERENCES public.platform_partners(id) ON DELETE SET NULL,
  candidate_match_reason text NULL,
  candidate_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  final_partner_id uuid NULL
    REFERENCES public.platform_partners(id) ON DELETE SET NULL,
  attribution_source_type text NULL,
  status text NOT NULL DEFAULT 'submitted',
  partner_assist_status text NOT NULL DEFAULT 'not_applicable',
  partner_assist_requested_at timestamptz NULL,
  partner_assist_due_at timestamptz NULL,
  version integer NOT NULL DEFAULT 1,
  converted_tenant_id uuid NULL
    REFERENCES public.tenants(id) ON DELETE RESTRICT,
  reviewed_by_employee_id uuid NULL
    REFERENCES public.employees(id) ON DELETE SET NULL,
  reviewed_at timestamptz NULL,
  review_remark text NULL,
  privacy_policy_version text NOT NULL,
  onboarding_terms_version text NOT NULL,
  consented_at timestamptz NOT NULL,
  idempotency_key text NOT NULL,
  withdrawn_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_onboarding_applications_status_check CHECK (
    status IN (
      'submitted',
      'reviewing',
      'supplement_required',
      'approved',
      'rejected',
      'withdrawn'
    )
  ),
  CONSTRAINT tenant_onboarding_applications_partner_assist_status_check CHECK (
    partner_assist_status IN (
      'not_applicable',
      'pending',
      'verified',
      'supplement_suggested',
      'not_recommended',
      'expired'
    )
  ),
  CONSTRAINT tenant_onboarding_applications_source_channel_check CHECK (
    source_channel IN ('local_services', 'partner_invite')
  ),
  CONSTRAINT tenant_onboarding_applications_service_regions_check CHECK (
    cardinality(service_region_codes) BETWEEN 1 AND 20
  ),
  CONSTRAINT tenant_onboarding_applications_visitor_idempotency_unique
    UNIQUE(visitor_id, idempotency_key)
);

CREATE UNIQUE INDEX IF NOT EXISTS tenant_onboarding_applications_open_subject_unique_idx
  ON public.tenant_onboarding_applications(
    upper(btrim(unified_social_credit_code))
  )
  WHERE status IN ('submitted', 'reviewing', 'supplement_required');

CREATE UNIQUE INDEX IF NOT EXISTS tenant_onboarding_applications_converted_tenant_unique_idx
  ON public.tenant_onboarding_applications(converted_tenant_id)
  WHERE converted_tenant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS tenant_onboarding_applications_platform_queue_idx
  ON public.tenant_onboarding_applications(status, created_at DESC);

CREATE INDEX IF NOT EXISTS tenant_onboarding_applications_partner_queue_idx
  ON public.tenant_onboarding_applications(
    candidate_partner_id,
    partner_assist_status,
    partner_assist_due_at,
    created_at DESC
  )
  WHERE candidate_partner_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS tenant_onboarding_applications_pending_assist_due_idx
  ON public.tenant_onboarding_applications(
    partner_assist_due_at,
    id
  )
  WHERE partner_assist_status = 'pending'
    AND partner_assist_due_at IS NOT NULL
    AND status IN ('submitted', 'reviewing', 'supplement_required');

CREATE TABLE IF NOT EXISTS public.tenant_onboarding_application_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL
    REFERENCES public.tenant_onboarding_applications(id) ON DELETE RESTRICT,
  review_stage text NOT NULL,
  decision text NOT NULL,
  actor_type text NOT NULL,
  actor_visitor_id text NULL,
  actor_employee_id uuid NULL
    REFERENCES public.employees(id) ON DELETE SET NULL,
  actor_partner_member_id uuid NULL
    REFERENCES public.platform_partner_members(id) ON DELETE SET NULL,
  before_status text NULL,
  after_status text NULL,
  before_partner_assist_status text NULL,
  after_partner_assist_status text NULL,
  required_fields text[] NOT NULL DEFAULT '{}'::text[],
  remark text NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_onboarding_reviews_stage_check CHECK (
    review_stage IN ('applicant', 'partner_assist', 'platform_review', 'system')
  ),
  CONSTRAINT tenant_onboarding_reviews_actor_check CHECK (
    actor_type IN ('visitor', 'partner_member', 'platform_employee', 'system')
  )
);

CREATE INDEX IF NOT EXISTS tenant_onboarding_reviews_application_created_idx
  ON public.tenant_onboarding_application_reviews(application_id, created_at ASC);

CREATE TABLE IF NOT EXISTS public.tenant_service_provider_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL UNIQUE
    REFERENCES public.tenants(id) ON DELETE CASCADE,
  public_name text NULL,
  introduction text NULL,
  public_phone text NULL,
  address_province text NULL,
  address_city text NULL,
  address_district text NULL,
  address_region_code text NULL,
  address text NULL,
  address_latitude double precision NULL,
  address_longitude double precision NULL,
  status text NOT NULL DEFAULT 'draft',
  version integer NOT NULL DEFAULT 1,
  submitted_at timestamptz NULL,
  reviewed_by_employee_id uuid NULL
    REFERENCES public.employees(id) ON DELETE SET NULL,
  reviewed_at timestamptz NULL,
  review_remark text NULL,
  published_at timestamptz NULL,
  suspended_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_service_provider_profiles_status_check CHECK (
    status IN ('draft', 'pending_review', 'published', 'suspended')
  ),
  CONSTRAINT tenant_service_provider_profiles_latitude_check CHECK (
    address_latitude IS NULL OR address_latitude BETWEEN -90 AND 90
  ),
  CONSTRAINT tenant_service_provider_profiles_longitude_check CHECK (
    address_longitude IS NULL OR address_longitude BETWEEN -180 AND 180
  )
);

CREATE INDEX IF NOT EXISTS tenant_service_provider_profiles_status_updated_idx
  ON public.tenant_service_provider_profiles(status, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.tenant_onboarding_notification_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL
    REFERENCES public.tenant_onboarding_applications(id) ON DELETE CASCADE,
  application_version integer NOT NULL,
  event_type text NOT NULL,
  channel text NOT NULL DEFAULT 'sms',
  status text NOT NULL DEFAULT 'pending',
  attempt_count integer NOT NULL DEFAULT 0,
  last_error text NULL,
  sent_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_onboarding_notifications_event_check CHECK (
    event_type IN ('submitted', 'supplement_required', 'approved', 'rejected')
  ),
  CONSTRAINT tenant_onboarding_notifications_channel_check CHECK (
    channel = 'sms'
  ),
  CONSTRAINT tenant_onboarding_notifications_status_check CHECK (
    status IN ('pending', 'sent', 'failed')
  ),
  CONSTRAINT tenant_onboarding_notifications_attempt_count_check CHECK (
    attempt_count >= 0
  ),
  CONSTRAINT tenant_onboarding_notifications_delivery_unique UNIQUE(
    application_id,
    application_version,
    event_type,
    channel
  )
);

CREATE INDEX IF NOT EXISTS tenant_onboarding_notifications_application_created_idx
  ON public.tenant_onboarding_notification_deliveries(
    application_id,
    created_at DESC
  );

CREATE INDEX IF NOT EXISTS tenant_onboarding_notifications_status_updated_idx
  ON public.tenant_onboarding_notification_deliveries(status, updated_at DESC);

COMMENT ON TABLE public.tenant_onboarding_notification_deliveries IS
  'Notification delivery ledger. Stores no raw phone, token, or message body; retries resolve the current recipient from the application.';

CREATE OR REPLACE FUNCTION public.prevent_tenant_onboarding_review_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE = '55000',
    MESSAGE = 'TENANT_ONBOARDING_REVIEW_APPEND_ONLY';
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS tr_tenant_onboarding_reviews_append_only
  ON public.tenant_onboarding_application_reviews;
CREATE TRIGGER tr_tenant_onboarding_reviews_append_only
  BEFORE UPDATE OR DELETE ON public.tenant_onboarding_application_reviews
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_tenant_onboarding_review_mutation();

DROP TRIGGER IF EXISTS tr_tenant_onboarding_applications_updated_at
  ON public.tenant_onboarding_applications;
CREATE TRIGGER tr_tenant_onboarding_applications_updated_at
  BEFORE UPDATE ON public.tenant_onboarding_applications
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS tr_tenant_service_provider_profiles_updated_at
  ON public.tenant_service_provider_profiles;
CREATE TRIGGER tr_tenant_service_provider_profiles_updated_at
  BEFORE UPDATE ON public.tenant_service_provider_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS tr_tenant_onboarding_notifications_updated_at
  ON public.tenant_onboarding_notification_deliveries;
CREATE TRIGGER tr_tenant_onboarding_notifications_updated_at
  BEFORE UPDATE ON public.tenant_onboarding_notification_deliveries
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.tenant_onboarding_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_onboarding_application_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_service_provider_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_onboarding_notification_deliveries ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.tenant_onboarding_applications
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.tenant_onboarding_application_reviews
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.tenant_service_provider_profiles
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.tenant_onboarding_notification_deliveries
  FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.tenant_onboarding_applications TO service_role;
GRANT SELECT, INSERT
  ON TABLE public.tenant_onboarding_application_reviews TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.tenant_service_provider_profiles TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.tenant_onboarding_notification_deliveries TO service_role;

CREATE OR REPLACE FUNCTION public.expire_tenant_onboarding_partner_assists(
  p_cutoff timestamptz,
  p_partner_id uuid DEFAULT NULL
)
RETURNS TABLE(application_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  RETURN QUERY
  WITH expired_applications AS (
    UPDATE public.tenant_onboarding_applications AS applications
    SET
      partner_assist_status = 'expired',
      version = applications.version + 1,
      updated_at = now()
    WHERE applications.partner_assist_status = 'pending'
      AND applications.partner_assist_due_at IS NOT NULL
      AND applications.partner_assist_due_at <= p_cutoff
      AND applications.status IN (
        'submitted',
        'reviewing',
        'supplement_required'
      )
      AND (
        p_partner_id IS NULL
        OR applications.candidate_partner_id = p_partner_id
      )
    RETURNING applications.id, applications.status
  ),
  inserted_reviews AS (
    INSERT INTO public.tenant_onboarding_application_reviews (
      application_id,
      review_stage,
      decision,
      actor_type,
      before_status,
      after_status,
      before_partner_assist_status,
      after_partner_assist_status,
      metadata
    )
    SELECT
      expired_applications.id,
      'partner_assist',
      'expired',
      'system',
      expired_applications.status,
      expired_applications.status,
      'pending',
      'expired',
      jsonb_build_object('cutoff', p_cutoff)
    FROM expired_applications
    RETURNING tenant_onboarding_application_reviews.application_id
  )
  SELECT inserted_reviews.application_id
  FROM inserted_reviews;
END;
$$;

REVOKE ALL ON FUNCTION public.expire_tenant_onboarding_partner_assists(
  timestamptz,
  uuid
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.expire_tenant_onboarding_partner_assists(
  timestamptz,
  uuid
) FROM anon;
REVOKE ALL ON FUNCTION public.expire_tenant_onboarding_partner_assists(
  timestamptz,
  uuid
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.expire_tenant_onboarding_partner_assists(
  timestamptz,
  uuid
) TO service_role;

ALTER TABLE public.tenant_partner_bindings
DROP CONSTRAINT IF EXISTS tenant_partner_bindings_source_type_check;

ALTER TABLE public.tenant_partner_bindings
ADD CONSTRAINT tenant_partner_bindings_source_type_check CHECK (
  source_type IN (
    'invite_code',
    'manual',
    'lead_source',
    'region_auto_assignment',
    'platform_manual',
    'transfer_approved'
  )
);

CREATE INDEX IF NOT EXISTS platform_partners_region_codes_gin_idx
  ON public.platform_partners USING gin(region_codes);

INSERT INTO public.permissions (
  code,
  name,
  module,
  resource,
  action,
  description,
  status
)
VALUES
  (
    'platform.tenant_onboarding.review',
    '审核装企入驻',
    'platform_tenant_onboarding',
    'tenant_onboarding',
    'review',
    '审核装企入驻申请及补充材料',
    'active'
  ),
  (
    'platform.service_provider.publish',
    '审核服务商发布',
    'platform_tenant_onboarding',
    'service_provider',
    'publish',
    '审核并发布装企服务商资料',
    'active'
  ),
  (
    'service_provider.profile.read',
    '查看服务商资料',
    'service_provider',
    'profile',
    'read',
    '查看租户服务商资料及审核状态',
    'active'
  ),
  (
    'service_provider.profile.manage',
    '管理服务商资料',
    'service_provider',
    'profile',
    'manage',
    '编辑并提交租户服务商资料',
    'active'
  )
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  module = EXCLUDED.module,
  resource = EXCLUDED.resource,
  action = EXCLUDED.action,
  description = EXCLUDED.description,
  status = EXCLUDED.status;

INSERT INTO public.role_permissions (role_id, permission_id, access_scope)
SELECT roles.id, permissions.id, 'all'
FROM public.roles
JOIN public.permissions
  ON permissions.code IN (
    'platform.tenant_onboarding.review',
    'platform.service_provider.publish'
  )
WHERE roles.code = 'platform_admin'
  AND roles.tenant_id IS NULL
ON CONFLICT (role_id, permission_id) DO UPDATE SET
  access_scope = EXCLUDED.access_scope;

INSERT INTO public.role_permissions (role_id, permission_id, access_scope)
SELECT roles.id, permissions.id, 'all'
FROM public.roles
JOIN public.permissions
  ON permissions.code IN (
    'service_provider.profile.read',
    'service_provider.profile.manage'
  )
WHERE roles.code = 'system_admin'
  AND roles.tenant_id IS NOT NULL
ON CONFLICT (role_id, permission_id) DO UPDATE SET
  access_scope = EXCLUDED.access_scope;

COMMIT;
