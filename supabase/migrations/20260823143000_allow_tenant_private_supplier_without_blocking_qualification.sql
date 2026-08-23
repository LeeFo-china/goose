-- Tenant-owned private suppliers should stay lightweight for tenant procurement.
-- Rollback: restore the previous get_tenant_supplier_order_eligibility_set
-- function body from 20260723143000_create_supplier_foundation_commands.sql.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_tenant_supplier_order_eligibility_set(
  p_tenant_id uuid,
  p_checked_at timestamptz,
  p_tenant_supplier_id uuid DEFAULT NULL
)
RETURNS TABLE (
  tenant_id uuid,
  tenant_supplier_id uuid,
  supplier_id uuid,
  supplier_version integer,
  tenant_supplier_version integer,
  checked_at timestamptz,
  eligible boolean,
  blocking_reasons text[],
  contract_health text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  WITH relationships AS MATERIALIZED (
    SELECT
      relationship.tenant_id,
      relationship.id AS tenant_supplier_id,
      relationship.supplier_id,
      relationship.relationship_status,
      relationship.version AS tenant_supplier_version,
      supplier.version AS supplier_version,
      supplier.supplier_type,
      supplier.ownership_scope,
      supplier.owner_tenant_id,
      supplier.onboarding_status,
      supplier.operational_status
    FROM public.tenant_suppliers AS relationship
    JOIN public.suppliers AS supplier
      ON supplier.id = relationship.supplier_id
    WHERE relationship.tenant_id = p_tenant_id
      AND (
        p_tenant_supplier_id IS NULL
        OR relationship.id = p_tenant_supplier_id
      )
  ),
  qualification_status AS MATERIALIZED (
    SELECT
      relationship.tenant_supplier_id,
      qualification_type.id AS qualification_type_id,
      COALESCE(
        bool_or(qualification.verification_status = 'verified'),
        false
      ) AS has_verified,
      COALESCE(bool_or(
        qualification.verification_status = 'verified'
        AND (qualification.valid_from IS NULL OR qualification.valid_from <= p_checked_at::date)
        AND (qualification.valid_until IS NULL OR qualification.valid_until >= p_checked_at::date)
      ), false) AS has_current_valid,
      COALESCE(bool_and(
        qualification.valid_until IS NOT NULL
        AND qualification.valid_until < p_checked_at::date
      ) FILTER (
        WHERE qualification.verification_status = 'verified'
      ), false) AS all_verified_expired
    FROM relationships AS relationship
    JOIN public.supplier_qualification_types AS qualification_type
      ON qualification_type.status = 'active'
      AND qualification_type.blocks_new_orders
      AND (
        relationship.ownership_scope <> 'tenant'
        OR relationship.owner_tenant_id IS DISTINCT FROM relationship.tenant_id
      )
      AND (
        cardinality(qualification_type.applicable_supplier_types) = 0
        OR relationship.supplier_type =
          ANY (qualification_type.applicable_supplier_types)
      )
    LEFT JOIN public.supplier_qualifications AS qualification
      ON qualification.supplier_id = relationship.supplier_id
      AND qualification.qualification_type_id = qualification_type.id
    GROUP BY
      relationship.tenant_supplier_id,
      qualification_type.id
  ),
  qualification_rollup AS MATERIALIZED (
    SELECT
      qualification_status.tenant_supplier_id,
      bool_or(
        NOT qualification_status.has_current_valid
        AND NOT (
          qualification_status.has_verified
          AND qualification_status.all_verified_expired
        )
      ) AS has_missing,
      bool_or(
        NOT qualification_status.has_current_valid
        AND qualification_status.has_verified
        AND qualification_status.all_verified_expired
      ) AS has_expired
    FROM qualification_status
    GROUP BY qualification_status.tenant_supplier_id
  ),
  contract_status AS MATERIALIZED (
    SELECT
      relationship.tenant_supplier_id,
      COALESCE(bool_or(
        contract.lifecycle_status = 'active'
        AND contract.valid_from <= p_checked_at::date
        AND contract.valid_until >= p_checked_at::date
      ), false) AS has_active_contract,
      COALESCE(bool_or(
        contract.lifecycle_status = 'active'
        AND contract.valid_from <= p_checked_at::date
        AND contract.valid_until > p_checked_at::date + 30
      ), false) AS has_valid_contract,
      COALESCE(bool_or(
        contract.lifecycle_status = 'active'
        AND contract.valid_from <= p_checked_at::date
        AND contract.valid_until >= p_checked_at::date
        AND contract.valid_until <= p_checked_at::date + 30
      ), false) AS has_expiring_contract,
      COALESCE(bool_or(
        contract.lifecycle_status = 'active'
        AND contract.valid_until < p_checked_at::date
      ), false) AS has_expired_contract
    FROM relationships AS relationship
    LEFT JOIN public.supplier_contracts AS contract
      ON contract.tenant_id = relationship.tenant_id
      AND contract.tenant_supplier_id = relationship.tenant_supplier_id
    GROUP BY relationship.tenant_supplier_id
  ),
  evaluated AS MATERIALIZED (
    SELECT
      relationship.tenant_id,
      relationship.tenant_supplier_id,
      relationship.supplier_id,
      relationship.supplier_version,
      relationship.tenant_supplier_version,
      p_checked_at AS checked_at,
      CASE
        WHEN COALESCE(contract_status.has_valid_contract, false)
          THEN 'valid'
        WHEN COALESCE(contract_status.has_expiring_contract, false)
          THEN 'expiring'
        WHEN COALESCE(contract_status.has_expired_contract, false)
          THEN 'expired'
        ELSE 'missing'
      END AS contract_health,
      ARRAY_REMOVE(ARRAY[
        CASE
          WHEN NOT COALESCE(setting.module_enabled, false)
            THEN 'module_disabled'
        END,
        CASE
          WHEN relationship.onboarding_status <> 'approved'
            THEN 'supplier_not_approved'
        END,
        CASE
          WHEN relationship.operational_status = 'suspended'
            THEN 'supplier_suspended'
        END,
        CASE
          WHEN relationship.operational_status = 'blacklisted'
            THEN 'supplier_blacklisted'
        END,
        CASE
          WHEN relationship.relationship_status <> 'active'
            THEN 'relationship_not_active'
        END,
        CASE
          WHEN COALESCE(qualification_rollup.has_missing, false)
            THEN 'required_qualification_missing'
        END,
        CASE
          WHEN COALESCE(qualification_rollup.has_expired, false)
            THEN 'required_qualification_expired'
        END,
        CASE
          WHEN COALESCE(
            setting.require_active_contract_for_new_order,
            false
          )
          AND NOT COALESCE(contract_status.has_active_contract, false)
            THEN 'active_contract_required'
        END
      ], NULL)::text[] AS blocking_reasons
    FROM relationships AS relationship
    LEFT JOIN public.tenant_supplier_settings AS setting
      ON setting.tenant_id = relationship.tenant_id
    LEFT JOIN qualification_rollup
      ON qualification_rollup.tenant_supplier_id =
        relationship.tenant_supplier_id
    LEFT JOIN contract_status
      ON contract_status.tenant_supplier_id =
        relationship.tenant_supplier_id
  )
  SELECT
    evaluated.tenant_id,
    evaluated.tenant_supplier_id,
    evaluated.supplier_id,
    evaluated.supplier_version,
    evaluated.tenant_supplier_version,
    evaluated.checked_at,
    cardinality(evaluated.blocking_reasons) = 0 AS eligible,
    evaluated.blocking_reasons,
    evaluated.contract_health
  FROM evaluated;
$$;

REVOKE ALL ON FUNCTION public.get_tenant_supplier_order_eligibility_set(uuid, timestamptz, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
