-- Establish one immutable attachment identity before the contract-access
-- migration freezes service order writers. This predecessor remains separate
-- so attachment DDL never acquires a late lock after order/work-order locks.
--
-- Forward-only remediation: if the preflight fails before rollout, revise this
-- not-yet-released migration or add an earlier versioned predecessor. Manual
-- dev/prod DML repair is prohibited.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '2min';

-- Follow the global referenced-table order first. ROW SHARE is compatible with
-- ordinary referenced-row writers and prevents this transaction from later
-- reversing their tenants -> employees -> attachment acquisition order.
LOCK TABLE
  public.tenants,
  public.employees
IN ROW SHARE MODE;

-- CREATE UNIQUE INDEX needs SHARE. Taking it explicitly before the scan blocks
-- attachment writers throughout preflight and index creation without touching
-- service order/work-order tables. Task 7 must measure this bounded window.
LOCK TABLE public.tenant_service_fulfillment_attachments
IN SHARE MODE;

-- Historical invariant preflight.
DO $$
DECLARE
  v_invalid_count bigint;
BEGIN
  SELECT count(*)
  INTO v_invalid_count
  FROM (
    SELECT work_order_id, fulfillment_record_id, file_id
    FROM public.tenant_service_fulfillment_attachments
    GROUP BY work_order_id, fulfillment_record_id, file_id
    HAVING count(*) > 1
  ) AS duplicate_attachment;

  IF v_invalid_count > 0 THEN
    RAISE EXCEPTION
      'PLATFORM_SERVICE_ACCESS_PREFLIGHT_ATTACHMENT_HISTORY_INVALID';
  END IF;
END;
$$;

CREATE UNIQUE INDEX tenant_service_fulfillment_attachments_scope_file_key
  ON public.tenant_service_fulfillment_attachments (
    work_order_id,
    fulfillment_record_id,
    file_id
  ) NULLS NOT DISTINCT;

COMMIT;
