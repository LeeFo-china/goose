-- Forward rollback procedure:
-- 1. Disable the public budget and tenant pricing entry points while retaining
--    compatible read responses for already-issued estimate numbers.
-- 2. Revoke service_role writes in a reviewed forward migration and wait for
--    in-flight AI claims to finish before removing triggers or constraints.
-- 3. Preserve every pricing version, item, and estimate snapshot for audit.
--    Only after export and dependency checks may a later forward migration
--    remove indexes, triggers, functions, and tables in dependency order.
-- This migration never seeds prices, invokes its trigger functions, or changes
-- existing business data.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE TABLE public.douyin_budget_pricing_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL
    REFERENCES public.tenants(id) ON DELETE RESTRICT,
  version_no bigint NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  effective_from timestamptz NOT NULL,
  effective_to timestamptz NULL,
  currency text NOT NULL DEFAULT 'CNY',
  disclaimer text NOT NULL,
  created_by_employee_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT douyin_budget_pricing_versions_creator_tenant_fkey
    FOREIGN KEY (created_by_employee_id, tenant_id)
    REFERENCES public.employees(id, tenant_id)
    ON DELETE RESTRICT,
  CONSTRAINT douyin_budget_pricing_versions_version_no_check
    CHECK (version_no BETWEEN 1 AND 2147483647),
  CONSTRAINT douyin_budget_pricing_versions_status_check
    CHECK (status IN ('draft', 'active', 'archived')),
  CONSTRAINT douyin_budget_pricing_versions_effective_range_check
    CHECK (effective_to IS NULL OR effective_to > effective_from),
  CONSTRAINT douyin_budget_pricing_versions_currency_check
    CHECK (currency = 'CNY'),
  CONSTRAINT douyin_budget_pricing_versions_disclaimer_check
    CHECK (
      disclaimer = btrim(disclaimer)
      AND char_length(disclaimer) BETWEEN 1 AND 500
    ),
  CONSTRAINT douyin_budget_pricing_versions_tenant_version_key
    UNIQUE (tenant_id, version_no),
  CONSTRAINT douyin_budget_pricing_versions_identity_owner_key
    UNIQUE (id, tenant_id)
);

CREATE TABLE public.douyin_budget_pricing_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pricing_version_id uuid NOT NULL
    REFERENCES public.douyin_budget_pricing_versions(id) ON DELETE CASCADE,
  category_code text NOT NULL,
  item_code text NOT NULL,
  label text NOT NULL,
  unit text NOT NULL,
  minimum_amount bigint NOT NULL,
  maximum_amount bigint NOT NULL,
  condition_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  sort_order integer NOT NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT douyin_budget_pricing_items_category_code_check CHECK (
    category_code IN (
      'base',
      'water_electricity',
      'materials',
      'custom',
      'other'
    )
  ),
  CONSTRAINT douyin_budget_pricing_items_item_code_check CHECK (
    item_code IN (
      'base.economy.rough',
      'base.economy.old_house',
      'base.comfortable.rough',
      'base.comfortable.old_house',
      'base.quality.rough',
      'base.quality.old_house',
      'demolition',
      'water_electricity_upgrade',
      'custom_cabinet'
    )
  ),
  CONSTRAINT douyin_budget_pricing_items_label_check
    CHECK (
      label = btrim(label)
      AND char_length(label) BETWEEN 1 AND 40
    ),
  CONSTRAINT douyin_budget_pricing_items_unit_check
    CHECK (unit IN ('sqm', 'fixed')),
  CONSTRAINT douyin_budget_pricing_items_amount_check
    CHECK (
      minimum_amount >= 0
      AND maximum_amount >= 0
      AND maximum_amount >= minimum_amount
    ),
  CONSTRAINT douyin_budget_pricing_items_condition_object_check
    CHECK (jsonb_typeof(condition_payload) = 'object'),
  CONSTRAINT douyin_budget_pricing_items_sort_order_check
    CHECK (sort_order BETWEEN 0 AND 99),
  CONSTRAINT douyin_budget_pricing_items_status_check
    CHECK (status IN ('active', 'inactive')),
  CONSTRAINT douyin_budget_pricing_items_version_item_key
    UNIQUE (pricing_version_id, item_code),
  CONSTRAINT douyin_budget_pricing_items_version_sort_key
    UNIQUE (pricing_version_id, sort_order)
);

CREATE TABLE public.douyin_budget_estimates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL
    REFERENCES public.tenants(id) ON DELETE RESTRICT,
  douyin_miniapp_installation_id uuid NOT NULL
    REFERENCES public.douyin_miniapp_installations(id) ON DELETE RESTRICT,
  subject_hash text NOT NULL,
  request_ip_hash text NOT NULL,
  pricing_version_id uuid NOT NULL,
  estimate_no text NOT NULL UNIQUE,
  request_payload jsonb NOT NULL,
  result_payload jsonb NOT NULL,
  ai_status text NOT NULL DEFAULT 'pending',
  ai_analysis jsonb NULL,
  ai_provider text NULL,
  ai_model text NULL,
  ai_claimed_at timestamptz NULL,
  ai_attempt_count integer NOT NULL DEFAULT 0,
  ai_last_error_code text NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT douyin_budget_estimates_pricing_owner_fkey
    FOREIGN KEY (pricing_version_id, tenant_id)
    REFERENCES public.douyin_budget_pricing_versions(id, tenant_id)
    ON DELETE RESTRICT,
  CONSTRAINT douyin_budget_estimates_number_check
    CHECK (estimate_no ~ '^DYYS-[0-9]{8}-[0-9]{6}$'),
  CONSTRAINT douyin_budget_estimates_subject_hash_check
    CHECK (subject_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT douyin_budget_estimates_request_ip_hash_check
    CHECK (request_ip_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT douyin_budget_estimates_request_object_check
    CHECK (jsonb_typeof(request_payload) = 'object'),
  CONSTRAINT douyin_budget_estimates_result_object_check
    CHECK (jsonb_typeof(result_payload) = 'object'),
  CONSTRAINT douyin_budget_estimates_ai_status_check
    CHECK (ai_status IN ('pending', 'succeeded', 'failed', 'skipped')),
  CONSTRAINT douyin_budget_estimates_ai_analysis_object_check
    CHECK (ai_analysis IS NULL OR jsonb_typeof(ai_analysis) = 'object'),
  CONSTRAINT douyin_budget_estimates_ai_provider_check
    CHECK (
      ai_provider IS NULL
      OR (
        ai_provider = btrim(ai_provider)
        AND char_length(ai_provider) BETWEEN 1 AND 100
      )
    ),
  CONSTRAINT douyin_budget_estimates_ai_model_check
    CHECK (
      ai_model IS NULL
      OR (
        ai_model = btrim(ai_model)
        AND char_length(ai_model) BETWEEN 1 AND 100
      )
    ),
  CONSTRAINT douyin_budget_estimates_ai_attempt_count_check
    CHECK (ai_attempt_count BETWEEN 0 AND 3),
  CONSTRAINT douyin_budget_estimates_ai_error_code_check CHECK (
    ai_last_error_code IS NULL
    OR ai_last_error_code ~ '^DOUYIN_BUDGET_[A-Z0-9_]{1,80}$'
  ),
  CONSTRAINT douyin_budget_estimates_ai_state_check CHECK (
    (
      ai_status = 'pending'
      AND ai_analysis IS NULL
      AND ai_provider IS NULL
      AND ai_model IS NULL
      AND ai_last_error_code IS NULL
      AND (
        (
          ai_attempt_count = 0
          AND ai_claimed_at IS NULL
        )
        OR (
          ai_attempt_count BETWEEN 1 AND 3
          AND ai_claimed_at IS NOT NULL
        )
      )
    )
    OR (
      ai_status = 'succeeded'
      AND ai_analysis IS NOT NULL
      AND ai_provider IS NOT NULL
      AND ai_model IS NOT NULL
      AND ai_claimed_at IS NULL
      AND ai_attempt_count BETWEEN 1 AND 3
      AND ai_last_error_code IS NULL
    )
    OR (
      ai_status = 'failed'
      AND ai_analysis IS NULL
      AND ai_provider IS NULL
      AND ai_model IS NULL
      AND ai_claimed_at IS NULL
      AND ai_attempt_count BETWEEN 1 AND 3
      AND ai_last_error_code IS NOT NULL
    )
    OR (
      ai_status = 'skipped'
      AND ai_analysis IS NULL
      AND ai_provider IS NULL
      AND ai_model IS NULL
      AND ai_claimed_at IS NULL
      AND ai_attempt_count = 0
      AND ai_last_error_code IS NULL
    )
  ),
  CONSTRAINT douyin_budget_estimates_expiry_check
    CHECK (expires_at > created_at)
);

CREATE UNIQUE INDEX douyin_budget_one_active_version
ON public.douyin_budget_pricing_versions(tenant_id)
WHERE status = 'active';

CREATE INDEX douyin_budget_pricing_versions_tenant_list_idx
ON public.douyin_budget_pricing_versions(
  tenant_id,
  created_at DESC,
  id DESC
);

CREATE INDEX douyin_budget_pricing_versions_tenant_effective_idx
ON public.douyin_budget_pricing_versions(
  tenant_id,
  status,
  effective_from DESC,
  effective_to,
  id
);

CREATE INDEX douyin_budget_pricing_items_version_list_idx
ON public.douyin_budget_pricing_items(
  pricing_version_id,
  status,
  sort_order,
  id
);

CREATE UNIQUE INDEX douyin_budget_estimates_identity_owner_key
ON public.douyin_budget_estimates(id, tenant_id);

CREATE INDEX douyin_budget_estimates_tenant_created_idx
ON public.douyin_budget_estimates(tenant_id, created_at DESC, id DESC);

CREATE INDEX douyin_budget_estimates_tenant_subject_created_idx
ON public.douyin_budget_estimates(
  tenant_id,
  subject_hash,
  created_at DESC
);

CREATE INDEX douyin_budget_estimates_tenant_ip_created_idx
ON public.douyin_budget_estimates(
  tenant_id,
  request_ip_hash,
  created_at DESC
);

CREATE FUNCTION public.protect_douyin_budget_pricing_version()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'draft' THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'DOUYIN_BUDGET_PRICING_VERSION_IMMUTABLE';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.status = 'archived' THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'DOUYIN_BUDGET_PRICING_VERSION_IMMUTABLE';
  END IF;

  IF OLD.status = 'active' AND (
    NEW.status <> 'archived'
    OR NEW.id IS DISTINCT FROM OLD.id
    OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
    OR NEW.version_no IS DISTINCT FROM OLD.version_no
    OR NEW.effective_from IS DISTINCT FROM OLD.effective_from
    OR NEW.effective_to IS DISTINCT FROM OLD.effective_to
    OR NEW.currency IS DISTINCT FROM OLD.currency
    OR NEW.disclaimer IS DISTINCT FROM OLD.disclaimer
    OR NEW.created_by_employee_id IS DISTINCT FROM OLD.created_by_employee_id
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'DOUYIN_BUDGET_PRICING_VERSION_IMMUTABLE';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.protect_douyin_budget_pricing_version()
FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER douyin_budget_pricing_versions_protect
BEFORE UPDATE OR DELETE ON public.douyin_budget_pricing_versions
FOR EACH ROW
EXECUTE FUNCTION public.protect_douyin_budget_pricing_version();

CREATE FUNCTION public.protect_douyin_budget_pricing_item()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_pricing_version_id uuid := COALESCE(
    NEW.pricing_version_id,
    OLD.pricing_version_id
  );
  v_pricing_status text;
BEGIN
  IF TG_OP = 'UPDATE'
    AND NEW.pricing_version_id IS DISTINCT FROM OLD.pricing_version_id
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'DOUYIN_BUDGET_PRICING_ITEM_VERSION_IMMUTABLE';
  END IF;

  SELECT pricing_version.status
  INTO v_pricing_status
  FROM public.douyin_budget_pricing_versions AS pricing_version
  WHERE pricing_version.id = v_pricing_version_id
  FOR SHARE;

  IF NOT FOUND OR v_pricing_status <> 'draft' THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'DOUYIN_BUDGET_PRICING_ITEM_IMMUTABLE';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.protect_douyin_budget_pricing_item()
FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER douyin_budget_pricing_items_protect
BEFORE INSERT OR UPDATE OR DELETE ON public.douyin_budget_pricing_items
FOR EACH ROW
EXECUTE FUNCTION public.protect_douyin_budget_pricing_item();

CREATE FUNCTION public.validate_douyin_budget_estimate_ownership()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $function$
BEGIN
  PERFORM installation.id
  FROM public.douyin_miniapp_installations AS installation
  WHERE installation.id = NEW.douyin_miniapp_installation_id
    AND installation.tenant_id = NEW.tenant_id
    AND installation.installation_kind = 'merchant'
    AND installation.authorization_status = 'active'
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'DOUYIN_BUDGET_ESTIMATE_INSTALLATION_INVALID';
  END IF;

  PERFORM pricing_version.id
  FROM public.douyin_budget_pricing_versions AS pricing_version
  WHERE pricing_version.id = NEW.pricing_version_id
    AND pricing_version.tenant_id = NEW.tenant_id
    AND pricing_version.status = 'active'
    AND pricing_version.effective_from <= NEW.created_at
    AND (
      pricing_version.effective_to IS NULL
      OR pricing_version.effective_to > NEW.created_at
    )
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'DOUYIN_BUDGET_ESTIMATE_PRICING_INVALID';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.validate_douyin_budget_estimate_ownership()
FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER douyin_budget_estimates_validate_ownership
BEFORE INSERT ON public.douyin_budget_estimates
FOR EACH ROW
EXECUTE FUNCTION public.validate_douyin_budget_estimate_ownership();

CREATE FUNCTION public.protect_douyin_budget_estimate()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'DOUYIN_BUDGET_ESTIMATE_IMMUTABLE';
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
    OR NEW.douyin_miniapp_installation_id IS DISTINCT FROM OLD.douyin_miniapp_installation_id
    OR NEW.subject_hash IS DISTINCT FROM OLD.subject_hash
    OR NEW.request_ip_hash IS DISTINCT FROM OLD.request_ip_hash
    OR NEW.pricing_version_id IS DISTINCT FROM OLD.pricing_version_id
    OR NEW.estimate_no IS DISTINCT FROM OLD.estimate_no
    OR NEW.request_payload IS DISTINCT FROM OLD.request_payload
    OR NEW.result_payload IS DISTINCT FROM OLD.result_payload
    OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'DOUYIN_BUDGET_ESTIMATE_IMMUTABLE';
  END IF;

  IF OLD.ai_status = 'pending' AND OLD.ai_claimed_at IS NULL THEN
    IF NEW.ai_status <> 'pending'
      OR NEW.ai_claimed_at IS NULL
      OR NEW.ai_attempt_count <> OLD.ai_attempt_count + 1
      OR NEW.ai_analysis IS NOT NULL
      OR NEW.ai_provider IS NOT NULL
      OR NEW.ai_model IS NOT NULL
      OR NEW.ai_last_error_code IS NOT NULL
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'DOUYIN_BUDGET_ESTIMATE_AI_TRANSITION_INVALID';
    END IF;
  ELSIF OLD.ai_status = 'pending' AND OLD.ai_claimed_at IS NOT NULL THEN
    IF NEW.ai_status = 'pending' THEN
      IF OLD.ai_claimed_at > clock_timestamp() - interval '60 seconds'
        OR NEW.ai_claimed_at IS NULL
        OR NEW.ai_claimed_at <= OLD.ai_claimed_at
        OR NEW.ai_attempt_count <> OLD.ai_attempt_count + 1
        OR NEW.ai_analysis IS NOT NULL
        OR NEW.ai_provider IS NOT NULL
        OR NEW.ai_model IS NOT NULL
        OR NEW.ai_last_error_code IS NOT NULL
      THEN
        RAISE EXCEPTION USING
          ERRCODE = 'P0001',
          MESSAGE = 'DOUYIN_BUDGET_ESTIMATE_AI_TRANSITION_INVALID';
      END IF;
    ELSIF NEW.ai_status IN ('succeeded', 'failed') THEN
      IF NEW.ai_claimed_at IS NOT NULL
        OR NEW.ai_attempt_count <> OLD.ai_attempt_count
      THEN
        RAISE EXCEPTION USING
          ERRCODE = 'P0001',
          MESSAGE = 'DOUYIN_BUDGET_ESTIMATE_AI_TRANSITION_INVALID';
      END IF;
    ELSE
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'DOUYIN_BUDGET_ESTIMATE_AI_TRANSITION_INVALID';
    END IF;
  ELSIF OLD.ai_status = 'failed' THEN
    IF NEW.ai_status <> 'pending'
      OR OLD.ai_attempt_count >= 3
      OR NEW.ai_claimed_at IS NULL
      OR NEW.ai_attempt_count <> OLD.ai_attempt_count + 1
      OR NEW.ai_analysis IS NOT NULL
      OR NEW.ai_provider IS NOT NULL
      OR NEW.ai_model IS NOT NULL
      OR NEW.ai_last_error_code IS NOT NULL
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'DOUYIN_BUDGET_ESTIMATE_AI_TRANSITION_INVALID';
    END IF;
  ELSE
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'DOUYIN_BUDGET_ESTIMATE_AI_TRANSITION_INVALID';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.protect_douyin_budget_estimate()
FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER douyin_budget_estimates_protect
BEFORE UPDATE OR DELETE ON public.douyin_budget_estimates
FOR EACH ROW
EXECUTE FUNCTION public.protect_douyin_budget_estimate();

CREATE TRIGGER tr_douyin_budget_pricing_versions_updated_at
BEFORE UPDATE ON public.douyin_budget_pricing_versions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER tr_douyin_budget_pricing_items_updated_at
BEFORE UPDATE ON public.douyin_budget_pricing_items
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER tr_douyin_budget_estimates_updated_at
BEFORE UPDATE ON public.douyin_budget_estimates
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.douyin_budget_pricing_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.douyin_budget_pricing_versions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.douyin_budget_pricing_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.douyin_budget_pricing_items FORCE ROW LEVEL SECURITY;
ALTER TABLE public.douyin_budget_estimates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.douyin_budget_estimates FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.douyin_budget_pricing_versions
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.douyin_budget_pricing_items
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.douyin_budget_estimates
FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE public.douyin_budget_pricing_versions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE public.douyin_budget_pricing_items TO service_role;
GRANT SELECT, INSERT, UPDATE
ON TABLE public.douyin_budget_estimates TO service_role;

COMMIT;
