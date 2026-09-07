-- Warehouse liabilities remain payable after replenishment is disabled.
-- Preserve financial facts, old project fingerprints and command locking.
-- Rollback uses a reviewed forward correction; never delete payment history.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='5min';

CREATE FUNCTION pg_temp.stage_b_payment_command_replace(p_source text,p_old text,p_new text,p_count integer DEFAULT 1)
RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  IF p_old='' OR (length(p_source)-length(replace(p_source,p_old,'')))/length(p_old)<>p_count THEN
    RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='WAREHOUSE_PAYMENT_COMMAND_PATCH_SOURCE_MISMATCH',DETAIL=left(p_old,150);
  END IF;
  RETURN replace(p_source,p_old,p_new);
END;
$$;

DO $draft$
DECLARE v_definition text; v_marker text;
BEGIN
  v_definition := pg_get_functiondef('public.supplier_payment_request_to_jsonb(public.supplier_payment_requests)'::regprocedure);
  v_definition := pg_temp.stage_b_payment_command_replace(v_definition,
    '''project_id'', p_request.project_id,',
    '''project_id'', p_request.project_id,
    ''destination_type'', p_request.destination_type, ''warehouse_id'', p_request.warehouse_id,');
  EXECUTE v_definition;
  v_definition := pg_get_functiondef('public.save_supplier_payment_request_draft(uuid,uuid,uuid,uuid,integer,text,text,jsonb,uuid,uuid,uuid)'::regprocedure);
  v_definition := pg_temp.stage_b_payment_command_replace(v_definition,'p_idempotency_key uuid)',
    'p_idempotency_key uuid, p_destination_type text DEFAULT ''project''::text, p_warehouse_id uuid DEFAULT NULL::uuid)');
  v_marker := E'  PERFORM pg_catalog.pg_advisory_xact_lock(\n    pg_catalog.hashtextextended(\n      ''supplier-command:''';
  v_definition := pg_temp.stage_b_payment_command_replace(v_definition,v_marker,
    $patch$  -- Keep every legacy project success/error fingerprint unchanged. Invalid
  -- explicit destination combinations must not match an old valid fingerprint.
  IF p_destination_type IS DISTINCT FROM 'project' OR p_warehouse_id IS NOT NULL THEN
    v_request := v_request || jsonb_build_object('destination_type',p_destination_type,'warehouse_id',p_warehouse_id);
  END IF;
$patch$ || v_marker);
  v_definition := pg_temp.stage_b_payment_command_replace(v_definition,'  IF p_project_id IS NULL',
    $patch$  IF p_destination_type IS NULL OR p_destination_type NOT IN ('project','warehouse')
    OR (p_destination_type='project' AND (p_project_id IS NULL OR p_warehouse_id IS NOT NULL))
    OR (p_destination_type='warehouse' AND (p_project_id IS NOT NULL OR p_warehouse_id IS NULL))$patch$);
  v_definition := pg_temp.stage_b_payment_command_replace(v_definition,'    AND payable.project_id = p_project_id',
    $patch$    AND payable.destination_type=p_destination_type
    AND payable.project_id IS NOT DISTINCT FROM p_project_id
    AND payable.warehouse_id IS NOT DISTINCT FROM p_warehouse_id$patch$);
  v_definition := pg_temp.stage_b_payment_command_replace(v_definition,E'      project_id,\n      tenant_supplier_id,',
    E'      project_id, destination_type, warehouse_id,\n      tenant_supplier_id,');
  v_definition := pg_temp.stage_b_payment_command_replace(v_definition,E'      p_project_id,\n      p_tenant_supplier_id,',
    E'      p_project_id, p_destination_type, p_warehouse_id,\n      p_tenant_supplier_id,');
  v_definition := pg_temp.stage_b_payment_command_replace(v_definition,'    SET project_id = p_project_id,',
    '    SET project_id = p_project_id, destination_type=p_destination_type, warehouse_id=p_warehouse_id,');
  DROP FUNCTION public.save_supplier_payment_request_draft(uuid,uuid,uuid,uuid,integer,text,text,jsonb,uuid,uuid,uuid);
  EXECUTE v_definition;
END;
$draft$;
REVOKE ALL ON FUNCTION public.save_supplier_payment_request_draft(uuid,uuid,uuid,uuid,integer,text,text,jsonb,uuid,uuid,uuid,text,uuid)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.save_supplier_payment_request_draft(uuid,uuid,uuid,uuid,integer,text,text,jsonb,uuid,uuid,uuid,text,uuid) TO service_role;

DO $payment$
DECLARE v_definition text;
BEGIN
  v_definition := pg_get_functiondef('public.supplier_payment_to_jsonb(public.supplier_payments)'::regprocedure);
  v_definition := pg_temp.stage_b_payment_command_replace(v_definition,
    '''project_id'', p_payment.project_id,',
    '''project_id'', p_payment.project_id,
    ''destination_type'', p_payment.destination_type, ''warehouse_id'', p_payment.warehouse_id,');
  EXECUTE v_definition;
  v_definition := pg_get_functiondef('public.confirm_supplier_payment(uuid,uuid,uuid,integer,text,text,timestamptz,jsonb,text,jsonb,uuid,uuid,uuid)'::regprocedure);
  v_definition := pg_temp.stage_b_payment_command_replace(v_definition,E'    project_id,\n    tenant_supplier_id,',
    E'    project_id, destination_type, warehouse_id,\n    tenant_supplier_id,');
  v_definition := pg_temp.stage_b_payment_command_replace(v_definition,E'    v_payment_request.project_id,\n    v_payment_request.tenant_supplier_id,',
    E'    v_payment_request.project_id, v_payment_request.destination_type, v_payment_request.warehouse_id,\n    v_payment_request.tenant_supplier_id,');
  v_definition := pg_temp.stage_b_payment_command_replace(v_definition,E'      ''supplier_name'', v_supplier_name\n    )',
    $patch$      'supplier_name', v_supplier_name
    ) || CASE WHEN v_payment_request.destination_type='warehouse' THEN jsonb_build_object(
      'destination_type','warehouse','warehouse_id',v_payment_request.warehouse_id) ELSE '{}'::jsonb END$patch$);
  EXECUTE v_definition;
END;
$payment$;

DO $scope$
DECLARE v_command text; v_definition text; v_signature text; v_marker text; v_guard text;
BEGIN
  FOREACH v_command IN ARRAY ARRAY['submit_supplier_payment_request','confirm_supplier_payment'] LOOP
    v_signature := CASE v_command WHEN 'submit_supplier_payment_request' THEN '(uuid,uuid,integer,uuid,uuid,uuid)'
      ELSE '(uuid,uuid,uuid,integer,text,text,timestamptz,jsonb,text,jsonb,uuid,uuid,uuid)' END;
    v_definition := pg_get_functiondef(('public.'||v_command||v_signature)::regprocedure);
    v_marker := CASE v_command WHEN 'submit_supplier_payment_request' THEN '  WITH current_allocations AS MATERIALIZED ('
      ELSE E'  IF EXISTS (\n    SELECT 1\n    FROM public.supplier_payable_events AS payable\n    JOIN (' END;
    -- Run only after request -> payable -> active/current allocation locks.
    -- Draft history and nullable legacy composite FKs are not proof of scope.
    v_guard := $patch$  IF EXISTS (
    SELECT 1 FROM public.supplier_payment_request_allocations AS scope_allocation
    LEFT JOIN public.supplier_payable_events AS scope_payable
      ON scope_payable.id=scope_allocation.payable_event_id AND scope_payable.tenant_id=scope_allocation.tenant_id
    WHERE scope_allocation.payment_request_id=p_payment_request_id AND scope_allocation.tenant_id=p_tenant_id
$patch$ || CASE v_command WHEN 'confirm_supplier_payment' THEN $patch$      AND scope_allocation.id IN (
        SELECT (item.value->>'payment_request_allocation_id')::uuid FROM jsonb_array_elements(p_allocations) AS item(value))
$patch$ ELSE '' END || $patch$      AND (scope_payable.id IS NULL
        OR scope_payable.tenant_id IS DISTINCT FROM v_payment_request.tenant_id
        OR scope_payable.destination_type IS DISTINCT FROM v_payment_request.destination_type
        OR scope_payable.project_id IS DISTINCT FROM v_payment_request.project_id
        OR scope_payable.warehouse_id IS DISTINCT FROM v_payment_request.warehouse_id
        OR scope_payable.tenant_supplier_id IS DISTINCT FROM v_payment_request.tenant_supplier_id
        OR scope_payable.supplier_id IS DISTINCT FROM v_payment_request.supplier_id
        OR scope_payable.currency IS DISTINCT FROM v_payment_request.currency)
  ) THEN
    v_result := jsonb_build_object('status','scope_mismatch','error_code','SUPPLIER_PAYMENT_SCOPE_MISMATCH');
    RETURN public.record_supplier_payment_command_result(
      p_tenant_id, $patch$ || CASE v_command WHEN 'submit_supplier_payment_request' THEN
        '''supplier_payment_request'', p_payment_request_id,' ELSE '''supplier_payment'', p_payment_id,' END || format($patch$
      %L, v_request, v_result, p_actor_user_id, p_actor_employee_id, p_idempotency_key, v_payment_request.version);
  END IF;

$patch$,v_command);
    v_definition := pg_temp.stage_b_payment_command_replace(v_definition,v_marker,v_guard||v_marker);
    -- Match the read RPC's accounting domain. Invalid historical edges must
    -- neither inflate paid totals nor reserve another destination's AP.
    v_marker := 'FROM public.supplier_payment_allocations AS payment_allocation';
    v_definition := pg_temp.stage_b_payment_command_replace(v_definition,v_marker,v_marker||$patch$
    JOIN public.supplier_payable_events AS paid_payable
      ON paid_payable.id=payment_allocation.payable_event_id AND paid_payable.tenant_id=payment_allocation.tenant_id
    JOIN public.supplier_payment_request_allocations AS paid_request_allocation
      ON paid_request_allocation.id=payment_allocation.payment_request_allocation_id
      AND paid_request_allocation.tenant_id=payment_allocation.tenant_id
      AND paid_request_allocation.payment_request_id=payment_allocation.payment_request_id
      AND paid_request_allocation.payable_event_id=payment_allocation.payable_event_id
    JOIN public.supplier_payment_requests AS paid_request
      ON paid_request.id=payment_allocation.payment_request_id AND paid_request.tenant_id=payment_allocation.tenant_id
      AND paid_request.destination_type=paid_payable.destination_type
      AND paid_request.project_id IS NOT DISTINCT FROM paid_payable.project_id
      AND paid_request.warehouse_id IS NOT DISTINCT FROM paid_payable.warehouse_id
      AND paid_request.tenant_supplier_id=paid_payable.tenant_supplier_id
      AND paid_request.supplier_id=paid_payable.supplier_id AND paid_request.currency=paid_payable.currency
    JOIN public.supplier_payments AS paid_payment
      ON paid_payment.id=payment_allocation.supplier_payment_id AND paid_payment.tenant_id=payment_allocation.tenant_id
      AND paid_payment.payment_request_id=paid_request.id
      AND paid_payment.destination_type=paid_payable.destination_type
      AND paid_payment.project_id IS NOT DISTINCT FROM paid_payable.project_id
      AND paid_payment.warehouse_id IS NOT DISTINCT FROM paid_payable.warehouse_id
      AND paid_payment.tenant_supplier_id=paid_payable.tenant_supplier_id
      AND paid_payment.supplier_id=paid_payable.supplier_id AND paid_payment.currency=paid_payable.currency$patch$);
    IF v_command='submit_supplier_payment_request' THEN
      v_marker := '    WHERE active_allocation.tenant_id = p_tenant_id';
      v_definition := pg_temp.stage_b_payment_command_replace(v_definition,v_marker,
        $patch$    JOIN public.supplier_payable_events AS reserved_payable
      ON reserved_payable.id=active_allocation.payable_event_id AND reserved_payable.tenant_id=active_allocation.tenant_id
      AND active_request.destination_type=reserved_payable.destination_type
      AND active_request.project_id IS NOT DISTINCT FROM reserved_payable.project_id
      AND active_request.warehouse_id IS NOT DISTINCT FROM reserved_payable.warehouse_id
      AND active_request.tenant_supplier_id=reserved_payable.tenant_supplier_id
      AND active_request.supplier_id=reserved_payable.supplier_id AND active_request.currency=reserved_payable.currency
$patch$||v_marker);
    END IF;
    IF v_command='confirm_supplier_payment' THEN
      v_definition := pg_temp.stage_b_payment_command_replace(v_definition,
        '      OR payable.project_id <> v_payment_request.project_id',
        $patch$      OR payable.project_id IS DISTINCT FROM v_payment_request.project_id
      OR payable.destination_type IS DISTINCT FROM v_payment_request.destination_type
      OR payable.warehouse_id IS DISTINCT FROM v_payment_request.warehouse_id$patch$);
    END IF;
    EXECUTE v_definition;
  END LOOP;
END;
$scope$;

-- The old project composite FK is retained. MATCH SIMPLE skips it when the
-- warehouse payment's project_id is null, so add the nonnull warehouse key.
-- Validate existing facts; inconsistent history aborts rather than being rewritten.
ALTER TABLE public.supplier_payment_requests
  ADD CONSTRAINT supplier_payment_requests_warehouse_scope_key
  UNIQUE(id,tenant_id,warehouse_id,tenant_supplier_id,supplier_id,currency);
ALTER TABLE public.supplier_payments
  ADD CONSTRAINT supplier_payments_request_warehouse_scope_fk
  FOREIGN KEY(payment_request_id,tenant_id,warehouse_id,tenant_supplier_id,supplier_id,currency)
  REFERENCES public.supplier_payment_requests(id,tenant_id,warehouse_id,tenant_supplier_id,supplier_id,currency)
  ON DELETE RESTRICT;

NOTIFY pgrst,'reload schema';
COMMIT;
