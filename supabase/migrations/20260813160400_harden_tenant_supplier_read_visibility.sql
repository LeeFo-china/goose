-- Rollback: forward-only. Re-deploy the prior function bodies only after
-- disabling ownership reads and private supplier writes. Do not weaken the
-- tenant ownership predicates while tenant-private supplier rows exist.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

CREATE OR REPLACE FUNCTION public.list_tenant_suppliers_for_tenant(
  p_tenant_id uuid,
  p_keyword text DEFAULT NULL,
  p_relationship_status text DEFAULT NULL,
  p_eligible boolean DEFAULT NULL,
  p_checked_at timestamptz DEFAULT now(),
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 20
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_page integer := GREATEST(COALESCE(p_page, 1), 1);
  v_page_size integer :=
    LEAST(GREATEST(COALESCE(p_page_size, 20), 1), 100);
  v_total bigint;
  v_items jsonb;
BEGIN
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'TENANT_SUPPLIER_NOT_FOUND';
  END IF;
  IF p_checked_at IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'SUPPLIER_ORDER_NOT_ELIGIBLE';
  END IF;

  WITH eligibility AS MATERIALIZED (
    SELECT eligibility_result.*
    FROM public.get_tenant_supplier_order_eligibility_set(
      p_tenant_id,
      p_checked_at,
      NULL
    ) AS eligibility_result
  ),
  eligible_relationships AS MATERIALIZED (
    SELECT
      relationship.id,
      relationship.updated_at,
      to_jsonb(relationship)
        || jsonb_build_object(
          'supplier',
          jsonb_build_object(
            'id', supplier.id,
            'code', supplier.code,
            'name', supplier.name,
            'legal_name', supplier.legal_name,
            'supplier_type', supplier.supplier_type,
            'ownership_scope', supplier.ownership_scope,
            'owner_tenant_id', supplier.owner_tenant_id,
            'onboarding_status', supplier.onboarding_status,
            'operational_status', supplier.operational_status,
            'version', supplier.version
          ),
          'contract_health', eligibility.contract_health,
          'eligibility',
          jsonb_build_object(
            'eligible', eligibility.eligible,
            'blocking_reasons', to_jsonb(eligibility.blocking_reasons),
            'checked_at', eligibility.checked_at,
            'tenant_id', eligibility.tenant_id,
            'tenant_supplier_id', eligibility.tenant_supplier_id,
            'supplier_id', eligibility.supplier_id,
            'supplier_version', eligibility.supplier_version,
            'tenant_supplier_version',
              eligibility.tenant_supplier_version
          )
        ) AS item
    FROM public.tenant_suppliers AS relationship
    JOIN public.suppliers AS supplier
      ON supplier.id = relationship.supplier_id
    JOIN eligibility
      ON eligibility.tenant_supplier_id = relationship.id
    WHERE relationship.tenant_id = p_tenant_id
      AND (
        supplier.ownership_scope = 'platform'
        OR (
          supplier.ownership_scope = 'tenant'
          AND supplier.owner_tenant_id = p_tenant_id
        )
      )
      AND (
        p_relationship_status IS NULL
        OR relationship.relationship_status = p_relationship_status
      )
      AND (
        p_keyword IS NULL OR btrim(p_keyword) = ''
        OR relationship.internal_supplier_code ILIKE '%' || btrim(p_keyword) || '%'
        OR supplier.code ILIKE '%' || btrim(p_keyword) || '%'
        OR supplier.name ILIKE '%' || btrim(p_keyword) || '%'
        OR supplier.legal_name ILIKE '%' || btrim(p_keyword) || '%'
      )
      AND (
        p_eligible IS NULL
        OR eligibility.eligible = p_eligible
      )
  ),
  summary AS (
    SELECT count(*) AS total
    FROM eligible_relationships
  ),
  paged AS (
    SELECT item, updated_at, id
    FROM eligible_relationships
    ORDER BY updated_at DESC, id DESC
    LIMIT v_page_size
    OFFSET (v_page - 1) * v_page_size
  )
  SELECT
    summary.total,
    COALESCE(
      jsonb_agg(paged.item ORDER BY paged.updated_at DESC, paged.id DESC)
        FILTER (WHERE paged.item IS NOT NULL),
      '[]'::jsonb
    )
  INTO v_total, v_items
  FROM summary
  LEFT JOIN paged ON true
  GROUP BY summary.total;

  RETURN jsonb_build_object(
    'items', v_items,
    'total', v_total,
    'page', v_page,
    'page_size', v_page_size
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.list_available_suppliers_for_tenant(
  p_tenant_id uuid,
  p_keyword text DEFAULT NULL,
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 20
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_page integer := GREATEST(COALESCE(p_page, 1), 1);
  v_page_size integer :=
    LEAST(GREATEST(COALESCE(p_page_size, 20), 1), 100);
  v_total bigint;
  v_items jsonb;
BEGIN
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'TENANT_SUPPLIER_NOT_FOUND';
  END IF;

  WITH eligible_suppliers AS MATERIALIZED (
    SELECT
      supplier.id,
      supplier.code,
      supplier.name,
      supplier.legal_name,
      supplier.supplier_type,
      supplier.ownership_scope,
      supplier.owner_tenant_id,
      supplier.onboarding_status,
      supplier.operational_status,
      supplier.version
    FROM public.suppliers AS supplier
    WHERE supplier.ownership_scope = 'platform'
      AND supplier.owner_tenant_id IS NULL
      AND supplier.onboarding_status = 'approved'
      AND supplier.operational_status = 'active'
      AND (
        p_keyword IS NULL OR btrim(p_keyword) = ''
        OR supplier.code ILIKE '%' || btrim(p_keyword) || '%'
        OR supplier.name ILIKE '%' || btrim(p_keyword) || '%'
        OR supplier.legal_name ILIKE '%' || btrim(p_keyword) || '%'
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.tenant_suppliers AS blocked_relationship
        WHERE blocked_relationship.tenant_id = p_tenant_id
          AND blocked_relationship.supplier_id = supplier.id
          AND blocked_relationship.relationship_status IN ('blacklisted', 'terminated')
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.tenant_suppliers AS existing_relationship
        WHERE existing_relationship.tenant_id = p_tenant_id
          AND existing_relationship.supplier_id = supplier.id
      )
  ),
  summary AS (
    SELECT count(*) AS total
    FROM eligible_suppliers
  ),
  paged AS (
    SELECT *
    FROM eligible_suppliers
    ORDER BY name ASC, id ASC
    LIMIT v_page_size
    OFFSET (v_page - 1) * v_page_size
  )
  SELECT
    summary.total,
    COALESCE(
      jsonb_agg(to_jsonb(paged) ORDER BY paged.name ASC, paged.id ASC)
        FILTER (WHERE paged.id IS NOT NULL),
      '[]'::jsonb
    )
  INTO v_total, v_items
  FROM summary
  LEFT JOIN paged ON true
  GROUP BY summary.total;

  RETURN jsonb_build_object(
    'items', v_items,
    'total', v_total,
    'page', v_page,
    'page_size', v_page_size
  );
END;
$$;

REVOKE ALL ON FUNCTION public.list_tenant_suppliers_for_tenant(
  uuid, text, text, boolean, timestamptz, integer, integer
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_tenant_suppliers_for_tenant(
  uuid, text, text, boolean, timestamptz, integer, integer
) TO service_role;

REVOKE ALL ON FUNCTION public.list_available_suppliers_for_tenant(
  uuid, text, integer, integer
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_available_suppliers_for_tenant(
  uuid, text, integer, integer
) TO service_role;

COMMIT;
