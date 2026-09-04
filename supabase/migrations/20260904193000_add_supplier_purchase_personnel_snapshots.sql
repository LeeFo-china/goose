-- Rollback:
-- 1. Drop public.list_supplier_purchase_orders(uuid, uuid[], integer, integer,
--    text, text, uuid, uuid, text) and redeploy the previous definition.
-- 2. Drop supplier_purchase_*_personnel_snapshots_tg triggers, then drop
--    public.sync_supplier_purchase_personnel_snapshots() and
--    public.build_supplier_purchase_employee_snapshot(uuid, uuid).
-- 3. Drop the added *_snapshot columns after clients stop reading them.

BEGIN;

ALTER TABLE public.supplier_purchase_batches
  ADD COLUMN IF NOT EXISTS creator_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS applicant_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS last_reviewer_snapshot jsonb;

ALTER TABLE public.supplier_purchase_orders
  ADD COLUMN IF NOT EXISTS creator_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS applicant_snapshot jsonb;

CREATE OR REPLACE FUNCTION public.build_supplier_purchase_employee_snapshot(
  p_tenant_id uuid,
  p_employee_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_snapshot jsonb;
BEGIN
  IF p_employee_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_build_object(
    'employee_id', employee.id,
    'name', COALESCE(NULLIF(btrim(employee.name), ''), '未知员工'),
    'phone_masked',
      CASE
        WHEN employee.phone ~ '^1[3-9][0-9]{9}$'
          THEN overlay(employee.phone placing '****' from 4 for 4)
        ELSE NULL
      END,
    'role_name', NULL
  )
  INTO v_snapshot
  FROM public.employees AS employee
  WHERE employee.id = p_employee_id
    AND (
      employee.tenant_id = p_tenant_id
      OR employee.tenant_id IS NULL
    )
  LIMIT 1;

  RETURN v_snapshot;
END;
$$;

UPDATE public.supplier_purchase_batches AS batch
SET
  creator_snapshot = COALESCE(
    batch.creator_snapshot,
    public.build_supplier_purchase_employee_snapshot(
      batch.tenant_id,
      batch.created_by_employee_id
    )
  ),
  applicant_snapshot = CASE
    WHEN batch.submitted_by_employee_id IS NULL THEN NULL
    ELSE COALESCE(
      batch.applicant_snapshot,
      public.build_supplier_purchase_employee_snapshot(
        batch.tenant_id,
        batch.submitted_by_employee_id
      )
    )
  END,
  last_reviewer_snapshot = CASE
    WHEN batch.reviewed_by_employee_id IS NULL THEN NULL
    ELSE COALESCE(
      batch.last_reviewer_snapshot,
      public.build_supplier_purchase_employee_snapshot(
        batch.tenant_id,
        batch.reviewed_by_employee_id
      )
    )
  END;

ALTER TABLE public.supplier_purchase_orders
  DISABLE TRIGGER supplier_purchase_orders_prevent_submitted_mutation;

UPDATE public.supplier_purchase_orders AS purchase_order
SET
  creator_snapshot = COALESCE(
    purchase_order.creator_snapshot,
    public.build_supplier_purchase_employee_snapshot(
      purchase_order.tenant_id,
      purchase_order.created_by_employee_id
    )
  ),
  applicant_snapshot = CASE
    WHEN purchase_order.submitted_by_employee_id IS NULL THEN NULL
    ELSE COALESCE(
      purchase_order.applicant_snapshot,
      public.build_supplier_purchase_employee_snapshot(
        purchase_order.tenant_id,
        purchase_order.submitted_by_employee_id
      )
    )
  END;

ALTER TABLE public.supplier_purchase_orders
  ENABLE TRIGGER supplier_purchase_orders_prevent_submitted_mutation;

CREATE OR REPLACE FUNCTION public.sync_supplier_purchase_personnel_snapshots()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_TABLE_NAME = 'supplier_purchase_batches' THEN
    IF TG_OP = 'INSERT'
      OR (
        TG_OP = 'UPDATE'
        AND NEW.created_by_employee_id IS DISTINCT FROM OLD.created_by_employee_id
      )
      OR NEW.creator_snapshot IS NULL
    THEN
      NEW.creator_snapshot :=
        public.build_supplier_purchase_employee_snapshot(
          NEW.tenant_id,
          NEW.created_by_employee_id
        );
    END IF;

    IF NEW.submitted_by_employee_id IS NULL THEN
      NEW.applicant_snapshot := NULL;
    ELSIF TG_OP = 'INSERT'
      OR (
        TG_OP = 'UPDATE'
        AND NEW.submitted_by_employee_id IS DISTINCT FROM OLD.submitted_by_employee_id
      )
      OR NEW.applicant_snapshot IS NULL
    THEN
      NEW.applicant_snapshot :=
        public.build_supplier_purchase_employee_snapshot(
          NEW.tenant_id,
          NEW.submitted_by_employee_id
        );
    END IF;

    IF NEW.reviewed_by_employee_id IS NULL THEN
      NEW.last_reviewer_snapshot := NULL;
    ELSIF TG_OP = 'INSERT'
      OR (
        TG_OP = 'UPDATE'
        AND NEW.reviewed_by_employee_id IS DISTINCT FROM OLD.reviewed_by_employee_id
      )
      OR NEW.last_reviewer_snapshot IS NULL
    THEN
      NEW.last_reviewer_snapshot :=
        public.build_supplier_purchase_employee_snapshot(
          NEW.tenant_id,
          NEW.reviewed_by_employee_id
        );
    END IF;

    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'supplier_purchase_orders' THEN
    IF TG_OP = 'INSERT'
      OR (
        TG_OP = 'UPDATE'
        AND NEW.created_by_employee_id IS DISTINCT FROM OLD.created_by_employee_id
      )
      OR NEW.creator_snapshot IS NULL
    THEN
      NEW.creator_snapshot :=
        public.build_supplier_purchase_employee_snapshot(
          NEW.tenant_id,
          NEW.created_by_employee_id
        );
    END IF;

    IF NEW.submitted_by_employee_id IS NULL THEN
      NEW.applicant_snapshot := NULL;
    ELSIF TG_OP = 'INSERT'
      OR (
        TG_OP = 'UPDATE'
        AND NEW.submitted_by_employee_id IS DISTINCT FROM OLD.submitted_by_employee_id
      )
      OR NEW.applicant_snapshot IS NULL
    THEN
      NEW.applicant_snapshot :=
        public.build_supplier_purchase_employee_snapshot(
          NEW.tenant_id,
          NEW.submitted_by_employee_id
        );
    END IF;

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS supplier_purchase_batches_personnel_snapshots_tg
  ON public.supplier_purchase_batches;
CREATE TRIGGER supplier_purchase_batches_personnel_snapshots_tg
  BEFORE INSERT OR UPDATE OF
    created_by_employee_id,
    submitted_by_employee_id,
    reviewed_by_employee_id,
    creator_snapshot,
    applicant_snapshot,
    last_reviewer_snapshot
  ON public.supplier_purchase_batches
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_supplier_purchase_personnel_snapshots();

DROP TRIGGER IF EXISTS supplier_purchase_orders_personnel_snapshots_tg
  ON public.supplier_purchase_orders;
CREATE TRIGGER supplier_purchase_orders_personnel_snapshots_tg
  BEFORE INSERT OR UPDATE OF
    created_by_employee_id,
    submitted_by_employee_id,
    creator_snapshot,
    applicant_snapshot
  ON public.supplier_purchase_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_supplier_purchase_personnel_snapshots();

CREATE OR REPLACE FUNCTION public.list_supplier_purchase_orders(
  p_tenant_id uuid,
  p_visible_project_ids uuid[] DEFAULT NULL,
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 20,
  p_status text DEFAULT NULL,
  p_fulfillment_status text DEFAULT NULL,
  p_project_id uuid DEFAULT NULL,
  p_tenant_supplier_id uuid DEFAULT NULL,
  p_keyword text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_page integer := GREATEST(1, COALESCE(p_page, 1));
  v_page_size integer := LEAST(100, GREATEST(1, COALESCE(p_page_size, 20)));
  v_offset integer;
  v_total bigint := 0;
  v_items jsonb := '[]'::jsonb;
  v_keyword text := NULLIF(btrim(COALESCE(p_keyword, '')), '');
BEGIN
  IF p_status IS NOT NULL
    AND p_status NOT IN ('draft', 'submitted', 'cancelled')
  THEN
    RAISE EXCEPTION 'SUPPLIER_PURCHASE_ORDER_STATUS_INVALID';
  END IF;

  IF p_fulfillment_status IS NOT NULL
    AND p_fulfillment_status NOT IN (
      'unconfirmed',
      'confirmed',
      'partially_shipped',
      'shipped',
      'partially_received',
      'received',
      'received_with_variance',
      'cancelled',
      'awaiting_receipt'
    )
  THEN
    RAISE EXCEPTION 'SUPPLIER_PURCHASE_ORDER_FULFILLMENT_STATUS_INVALID';
  END IF;

  IF p_visible_project_ids IS NOT NULL
    AND COALESCE(array_length(p_visible_project_ids, 1), 0) = 0
  THEN
    RETURN jsonb_build_object(
      'items', '[]'::jsonb,
      'total', 0,
      'page', v_page,
      'page_size', v_page_size
    );
  END IF;

  IF p_project_id IS NOT NULL
    AND p_visible_project_ids IS NOT NULL
    AND NOT (p_project_id = ANY(p_visible_project_ids))
  THEN
    RETURN jsonb_build_object(
      'items', '[]'::jsonb,
      'total', 0,
      'page', v_page,
      'page_size', v_page_size
    );
  END IF;

  v_offset := (v_page - 1) * v_page_size;

  WITH filtered AS (
    SELECT
      purchase_order.id,
      purchase_order.tenant_id,
      purchase_order.project_id,
      purchase_order.tenant_supplier_id,
      purchase_order.supplier_id,
      purchase_order.order_no,
      purchase_order.status,
      purchase_order.currency,
      purchase_order.expected_delivery_date,
      purchase_order.remark,
      purchase_order.priced_at,
      purchase_order.subtotal_amount,
      purchase_order.tax_amount,
      purchase_order.total_amount,
      purchase_order.purchase_requisition_id,
      purchase_order.purchase_batch_id,
      purchase_order.version,
      purchase_order.created_by_employee_id,
      purchase_order.creator_snapshot,
      purchase_order.updated_by_employee_id,
      purchase_order.submitted_by_employee_id,
      purchase_order.submitted_at,
      purchase_order.applicant_snapshot,
      purchase_order.cancelled_by_employee_id,
      purchase_order.cancelled_at,
      purchase_order.cancel_reason,
      purchase_order.created_at,
      purchase_order.updated_at,
      CASE
        WHEN purchase_order.status = 'cancelled' THEN 'cancelled'
        WHEN fulfillment.status IS NULL THEN 'unconfirmed'
        ELSE fulfillment.status
      END AS fulfillment_status,
      project.name AS project_name,
      project.status AS project_status,
      supplier.code AS supplier_code,
      supplier.name AS supplier_name,
      supplier.legal_name AS supplier_legal_name,
      supplier.onboarding_status AS supplier_onboarding_status,
      supplier.operational_status AS supplier_operational_status,
      requisition.request_no AS requisition_request_no,
      requisition.status AS requisition_status,
      requisition.budget_status AS requisition_budget_status,
      batch.id AS batch_id,
      batch.status AS batch_status,
      batch.submitted_by_employee_id AS batch_submitted_by_employee_id,
      batch.submitted_at AS batch_submitted_at,
      batch.reviewed_by_employee_id AS batch_reviewed_by_employee_id,
      batch.reviewed_at AS batch_reviewed_at,
      batch.review_remark AS batch_review_remark,
      batch.applicant_snapshot AS batch_applicant_snapshot,
      batch.last_reviewer_snapshot AS batch_last_reviewer_snapshot
    FROM public.supplier_purchase_orders AS purchase_order
    JOIN public.projects AS project
      ON project.id = purchase_order.project_id
    JOIN public.suppliers AS supplier
      ON supplier.id = purchase_order.supplier_id
    LEFT JOIN public.supplier_purchase_order_fulfillments AS fulfillment
      ON fulfillment.supplier_purchase_order_id = purchase_order.id
      AND fulfillment.tenant_id = purchase_order.tenant_id
    LEFT JOIN public.supplier_purchase_requisitions AS requisition
      ON requisition.id = purchase_order.purchase_requisition_id
      AND requisition.tenant_id = purchase_order.tenant_id
    LEFT JOIN public.supplier_purchase_batches AS batch
      ON batch.id = purchase_order.purchase_batch_id
      AND batch.tenant_id = purchase_order.tenant_id
    WHERE purchase_order.tenant_id = p_tenant_id
      AND (
        p_visible_project_ids IS NULL
        OR purchase_order.project_id = ANY(p_visible_project_ids)
      )
      AND (p_project_id IS NULL OR purchase_order.project_id = p_project_id)
      AND (p_status IS NULL OR purchase_order.status = p_status)
      AND (
        p_tenant_supplier_id IS NULL
        OR purchase_order.tenant_supplier_id = p_tenant_supplier_id
      )
      AND (v_keyword IS NULL OR purchase_order.order_no ILIKE '%' || v_keyword || '%')
      AND (
        p_fulfillment_status IS NULL
        OR (
          p_fulfillment_status = 'unconfirmed'
          AND purchase_order.status = 'submitted'
          AND fulfillment.id IS NULL
        )
        OR (
          p_fulfillment_status = 'cancelled'
          AND (
            purchase_order.status = 'cancelled'
            OR fulfillment.status = 'cancelled'
          )
        )
        OR (
          p_fulfillment_status = 'awaiting_receipt'
          AND fulfillment.status IN ('partially_shipped', 'shipped')
        )
        OR (
          p_fulfillment_status NOT IN (
            'unconfirmed',
            'cancelled',
            'awaiting_receipt'
          )
          AND fulfillment.status = p_fulfillment_status
        )
      )
  ),
  counted AS (
    SELECT count(*) AS total FROM filtered
  ),
  paged AS (
    SELECT *
    FROM filtered
    ORDER BY updated_at DESC, id DESC
    OFFSET v_offset
    LIMIT v_page_size
  )
  SELECT counted.total,
    COALESCE(jsonb_agg(
      jsonb_build_object(
        'id', paged.id,
        'tenant_id', paged.tenant_id,
        'project_id', paged.project_id,
        'tenant_supplier_id', paged.tenant_supplier_id,
        'supplier_id', paged.supplier_id,
        'order_no', paged.order_no,
        'status', paged.status,
        'currency', paged.currency,
        'expected_delivery_date', paged.expected_delivery_date,
        'remark', paged.remark,
        'priced_at', paged.priced_at,
        'subtotal_amount', paged.subtotal_amount::text,
        'tax_amount', paged.tax_amount::text,
        'total_amount', paged.total_amount::text,
        'purchase_requisition_id', paged.purchase_requisition_id,
        'purchase_batch_id', paged.purchase_batch_id,
        'version', paged.version,
        'created_by_employee_id', paged.created_by_employee_id,
        'creator_snapshot', paged.creator_snapshot,
        'updated_by_employee_id', paged.updated_by_employee_id,
        'submitted_by_employee_id', paged.submitted_by_employee_id,
        'submitted_at', paged.submitted_at,
        'applicant_snapshot', paged.applicant_snapshot,
        'cancelled_by_employee_id', paged.cancelled_by_employee_id,
        'cancelled_at', paged.cancelled_at,
        'cancel_reason', paged.cancel_reason,
        'created_at', paged.created_at,
        'updated_at', paged.updated_at,
        'fulfillment_status', paged.fulfillment_status,
        'project', jsonb_build_object(
          'id', paged.project_id,
          'name', paged.project_name,
          'status', paged.project_status
        ),
        'supplier', jsonb_build_object(
          'id', paged.supplier_id,
          'code', paged.supplier_code,
          'name', paged.supplier_name,
          'legal_name', paged.supplier_legal_name,
          'onboarding_status', paged.supplier_onboarding_status,
          'operational_status', paged.supplier_operational_status
        ),
        'purchase_requisition',
          CASE
            WHEN paged.purchase_requisition_id IS NULL THEN NULL
            ELSE jsonb_build_object(
              'id', paged.purchase_requisition_id,
              'request_no', paged.requisition_request_no,
              'status', paged.requisition_status,
              'budget_status', paged.requisition_budget_status
            )
          END,
        'purchase_batch',
          CASE
            WHEN paged.batch_id IS NULL THEN NULL
            ELSE jsonb_build_object(
              'id', paged.batch_id,
              'status', paged.batch_status,
              'submitted_by_employee_id', paged.batch_submitted_by_employee_id,
              'submitted_at', paged.batch_submitted_at,
              'reviewed_by_employee_id', paged.batch_reviewed_by_employee_id,
              'reviewed_at', paged.batch_reviewed_at,
              'review_remark', paged.batch_review_remark,
              'applicant_snapshot', paged.batch_applicant_snapshot,
              'last_reviewer_snapshot', paged.batch_last_reviewer_snapshot
            )
          END
      )
      ORDER BY paged.updated_at DESC, paged.id DESC
    ) FILTER (WHERE paged.id IS NOT NULL), '[]'::jsonb)
  INTO v_total, v_items
  FROM counted
  LEFT JOIN paged ON TRUE
  GROUP BY counted.total;

  RETURN jsonb_build_object(
    'items', v_items,
    'total', v_total,
    'page', v_page,
    'page_size', v_page_size
  );
END;
$$;

REVOKE ALL ON FUNCTION public.build_supplier_purchase_employee_snapshot(
  uuid,
  uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.build_supplier_purchase_employee_snapshot(
  uuid,
  uuid
) TO service_role;

REVOKE ALL ON FUNCTION public.sync_supplier_purchase_personnel_snapshots()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_supplier_purchase_personnel_snapshots()
  TO service_role;

REVOKE ALL ON FUNCTION public.list_supplier_purchase_orders(
  uuid,
  uuid[],
  integer,
  integer,
  text,
  text,
  uuid,
  uuid,
  text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_supplier_purchase_orders(
  uuid,
  uuid[],
  integer,
  integer,
  text,
  text,
  uuid,
  uuid,
  text
) TO service_role;

COMMIT;
