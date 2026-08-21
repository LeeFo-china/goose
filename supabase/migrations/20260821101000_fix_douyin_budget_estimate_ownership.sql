-- Forward rollback procedure:
-- 1. Disable installation rebinding, budget estimate creation, and pricing
--    version deletion before changing either ownership relationship.
-- 2. In a reviewed forward migration, recreate and validate the former
--    single-column installation foreign key before removing the composite key.
-- 3. Keep the installation identity-owner unique constraint while any later
--    object references it. Restore the former version guard only after callers
--    explicitly delete draft items before deleting their version.
-- Existing pricing and estimate history must never be deleted during rollback.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $block$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.douyin_budget_estimates AS estimate
    LEFT JOIN public.douyin_miniapp_installations AS installation
      ON installation.id = estimate.douyin_miniapp_installation_id
      AND installation.tenant_id = estimate.tenant_id
    WHERE installation.id IS NULL
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'DOUYIN_BUDGET_ESTIMATE_INSTALLATION_OWNERSHIP_INVALID';
  END IF;
END;
$block$;

ALTER TABLE public.douyin_miniapp_installations
ADD CONSTRAINT douyin_miniapp_installations_id_tenant_key
UNIQUE (id, tenant_id);

ALTER TABLE public.douyin_budget_estimates
ADD CONSTRAINT douyin_budget_estimates_installation_owner_fkey
FOREIGN KEY (douyin_miniapp_installation_id, tenant_id)
REFERENCES public.douyin_miniapp_installations(id, tenant_id)
ON DELETE RESTRICT
NOT VALID;

ALTER TABLE public.douyin_budget_estimates
VALIDATE CONSTRAINT douyin_budget_estimates_installation_owner_fkey;

ALTER TABLE public.douyin_budget_estimates
DROP CONSTRAINT douyin_budget_estimates_douyin_miniapp_installation_id_fkey;

CREATE OR REPLACE FUNCTION public.protect_douyin_budget_pricing_version()
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

    -- Delete while the draft parent row is still visible. The child guard can
    -- therefore prove the parent is draft and allow these cascading deletes.
    DELETE FROM public.douyin_budget_pricing_items
    WHERE pricing_version_id = OLD.id;
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

COMMIT;
