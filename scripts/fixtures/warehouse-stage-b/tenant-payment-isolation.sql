-- Disposable offline runner only. Requires receipt-cross-order-concurrency.sql
-- and receipt-weighted-cost.sql. Real AP -> request -> review -> partial payment
-- controls precede cross-tenant ID negatives; all new facts are rolled back.
BEGIN;
CREATE TEMP TABLE stage_b_tenant_payment_cases (
  tenant_id uuid PRIMARY KEY, warehouse_id uuid, tenant_supplier_id uuid, payable_id uuid,
  actor_user_id uuid, actor_employee_id uuid, reviewer_user_id uuid, reviewer_employee_id uuid,
  request_id uuid, allocation_id uuid, payment_id uuid, payment_key uuid, paid_at timestamptz, payment_result jsonb
);

CREATE FUNCTION pg_temp.stage_b_financial_facts(tenant_ids uuid[], ignored_keys text[]) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE relation_name text; facts jsonb; result jsonb := '{}'::jsonb;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY[
    'supplier_payable_events','supplier_payment_requests','supplier_payment_request_allocations',
    'supplier_payments','supplier_payment_allocations','finance_ledger_entries',
    'inventory_balances','inventory_transactions','project_cost_events','project_cost_commitments'
  ] LOOP
    EXECUTE format('SELECT COALESCE(jsonb_agg(to_jsonb(fact) ORDER BY fact.id), ''[]''::jsonb)
      FROM public.%I fact WHERE fact.tenant_id = ANY($1)',relation_name) INTO facts USING tenant_ids;
    result := result || jsonb_build_object(relation_name,facts);
  END LOOP;
  SELECT COALESCE(jsonb_agg(to_jsonb(event) ORDER BY event.id), '[]'::jsonb) INTO facts
    FROM public.supplier_command_events event WHERE event.tenant_id = ANY(tenant_ids)
      AND NOT (event.idempotency_key = ANY(ignored_keys));
  RETURN result || jsonb_build_object('supplier_command_events',facts);
END;
$$;

DO $seed$
DECLARE seed record; result jsonb; request_id uuid; allocation_id uuid; payable_id uuid; relationship_id uuid;
  reviewer_user uuid; reviewer_employee uuid; control_payment_id uuid; paid_at timestamptz := now();
  shared_save_key uuid := gen_random_uuid(); shared_payment_key uuid := gen_random_uuid();
BEGIN
  FOR seed IN
    SELECT * FROM public.stage_b_cross_order_fixture WHERE ordinal = 1
    UNION ALL SELECT * FROM public.stage_b_weighted_cost_fixture WHERE ordinal = 1
  LOOP
    SELECT id,user_id INTO STRICT reviewer_employee,reviewer_user FROM public.employees
      WHERE tenant_id = seed.tenant_id AND id <> seed.actor_employee_id;
    SELECT payable.id,payable.tenant_supplier_id INTO STRICT payable_id,relationship_id
      FROM public.supplier_payable_events payable WHERE payable.tenant_id = seed.tenant_id
        AND payable.supplier_purchase_order_id = seed.order_id AND payable.amount >= 5
        AND NOT payable.invoice_required_before_payment ORDER BY payable.id LIMIT 1;
    request_id := gen_random_uuid();
    result := public.save_supplier_payment_request_draft(request_id,seed.tenant_id,NULL,relationship_id,0,
      'Tenant payment control',NULL,jsonb_build_array(jsonb_build_object('payable_event_id',payable_id,'requested_amount','5.00')),
      seed.actor_user_id,seed.actor_employee_id,shared_save_key,'warehouse',seed.warehouse_id);
    IF result->>'status' IS DISTINCT FROM 'saved' THEN RAISE EXCEPTION 'Control payment draft failed: %',result; END IF;
    result := public.submit_supplier_payment_request(request_id,seed.tenant_id,1,seed.actor_user_id,seed.actor_employee_id,gen_random_uuid());
    IF result->>'status' IS DISTINCT FROM 'submitted' THEN RAISE EXCEPTION 'Control payment submit failed: %',result; END IF;
    result := public.review_supplier_payment_request(request_id,seed.tenant_id,2,'approve',NULL,reviewer_user,reviewer_employee,gen_random_uuid());
    IF result->>'status' IS DISTINCT FROM 'approved' THEN RAISE EXCEPTION 'Control payment review failed: %',result; END IF;
    SELECT allocation.id INTO STRICT allocation_id FROM public.supplier_payment_request_allocations allocation
      WHERE allocation.payment_request_id = request_id AND allocation.tenant_id = seed.tenant_id;
    control_payment_id := gen_random_uuid();
    result := public.confirm_supplier_payment(control_payment_id,request_id,seed.tenant_id,3,'bank_transfer','TENANT-CONTROL',paid_at,
      '["https://smoke.invalid/proof"]',NULL,jsonb_build_array(jsonb_build_object(
        'payment_request_allocation_id',allocation_id,'payable_event_id',payable_id,'amount','1.00')),
      seed.actor_user_id,seed.actor_employee_id,shared_payment_key);
    IF result->>'status' IS DISTINCT FROM 'partially_paid' OR result->>'idempotent' IS DISTINCT FROM 'false'
      OR NOT EXISTS(SELECT 1 FROM public.supplier_payment_requests request WHERE request.id = request_id
        AND request.tenant_id = seed.tenant_id AND request.version = 4 AND request.paid_amount = 1 AND request.requested_amount = 5)
      OR (SELECT count(*) FROM public.finance_ledger_entries ledger WHERE ledger.tenant_id = seed.tenant_id
        AND ledger.source_type = 'supplier_payment' AND ledger.source_id = control_payment_id AND ledger.amount = 1) <> 1 THEN
      RAISE EXCEPTION 'Positive partial-payment/ledger control failed: %',result;
    END IF;
    INSERT INTO stage_b_tenant_payment_cases VALUES(seed.tenant_id,seed.warehouse_id,relationship_id,payable_id,
      seed.actor_user_id,seed.actor_employee_id,reviewer_user,reviewer_employee,
      request_id,allocation_id,control_payment_id,shared_payment_key,paid_at,result);
  END LOOP;
  IF (SELECT count(*) FROM stage_b_tenant_payment_cases) <> 2 THEN
    RAISE EXCEPTION 'Financial isolation requires two distinct valid tenants';
  END IF;
END;
$seed$;

DO $isolation$
DECLARE local_case stage_b_tenant_payment_cases%ROWTYPE; foreign_case stage_b_tenant_payment_cases%ROWTYPE;
  tenant_ids uuid[]; ignored_keys text[] := ARRAY[]::text[]; before_facts jsonb;
  command_key uuid; request_id uuid; payment_id uuid; allocations jsonb; result jsonb; expected jsonb;
  attempt integer; collision boolean; constraint_name text; event_count bigint;
BEGIN
  SELECT array_agg(tenant_id ORDER BY tenant_id) INTO tenant_ids FROM stage_b_tenant_payment_cases;
  FOR local_case IN SELECT * FROM stage_b_tenant_payment_cases ORDER BY tenant_id LOOP
    SELECT * INTO STRICT foreign_case FROM stage_b_tenant_payment_cases WHERE tenant_id <> local_case.tenant_id;
    FOR attempt IN 1..11 LOOP
      before_facts := pg_temp.stage_b_financial_facts(tenant_ids,ARRAY[]::text[]);
      command_key := gen_random_uuid(); ignored_keys := ARRAY[command_key::text];
      collision := false;
      IF attempt <= 3 THEN
        request_id := CASE WHEN attempt = 3 THEN foreign_case.request_id ELSE gen_random_uuid() END;
        allocations := jsonb_build_array(jsonb_build_object('payable_event_id',
          CASE WHEN attempt = 3 THEN local_case.payable_id ELSE foreign_case.payable_id END,'requested_amount','1.00'));
        IF attempt = 2 THEN allocations := allocations || jsonb_build_array(jsonb_build_object(
          'payable_event_id',local_case.payable_id,'requested_amount','1.00')); END IF;
        result := public.save_supplier_payment_request_draft(request_id,local_case.tenant_id,NULL,local_case.tenant_supplier_id,0,
          'Tenant negative draft',NULL,allocations,local_case.actor_user_id,local_case.actor_employee_id,
          command_key,'warehouse',local_case.warehouse_id);
        expected := '{"status":"scope_mismatch","error_code":"SUPPLIER_PAYMENT_SCOPE_MISMATCH"}';
      ELSIF attempt = 4 THEN
        result := public.submit_supplier_payment_request(foreign_case.request_id,local_case.tenant_id,4,
          local_case.actor_user_id,local_case.actor_employee_id,command_key);
        expected := '{"status":"not_found","error_code":"SUPPLIER_PAYMENT_NOT_FOUND"}';
      ELSIF attempt = 5 THEN
        result := public.review_supplier_payment_request(foreign_case.request_id,local_case.tenant_id,4,'approve',NULL,
          local_case.reviewer_user_id,local_case.reviewer_employee_id,command_key);
        expected := '{"status":"not_found","error_code":"SUPPLIER_PAYMENT_NOT_FOUND"}';
      ELSE
        request_id := CASE WHEN attempt = 6 THEN foreign_case.request_id ELSE local_case.request_id END;
        payment_id := CASE WHEN attempt = 11 THEN foreign_case.payment_id ELSE gen_random_uuid() END;
        allocations := jsonb_build_array(jsonb_build_object(
          'payment_request_allocation_id',CASE WHEN attempt IN (6,7,9) THEN foreign_case.allocation_id ELSE local_case.allocation_id END,
          'payable_event_id',CASE WHEN attempt IN (6,8,9) THEN foreign_case.payable_id ELSE local_case.payable_id END,'amount','1.00'));
        IF attempt = 10 THEN allocations := allocations || jsonb_build_array(jsonb_build_object(
          'payment_request_allocation_id',foreign_case.allocation_id,'payable_event_id',foreign_case.payable_id,'amount','1.00')); END IF;
        BEGIN
          result := public.confirm_supplier_payment(payment_id,request_id,local_case.tenant_id,4,
            'bank_transfer','TENANT-NEGATIVE',local_case.paid_at,'["https://smoke.invalid/proof"]',NULL,allocations,
            local_case.actor_user_id,local_case.actor_employee_id,command_key);
        EXCEPTION WHEN unique_violation THEN
          GET STACKED DIAGNOSTICS constraint_name = CONSTRAINT_NAME;
          IF attempt <> 11 OR constraint_name IS DISTINCT FROM 'supplier_payments_pkey' THEN RAISE; END IF;
          collision := true;
        END;
        expected := CASE WHEN attempt = 6 THEN '{"status":"not_found","error_code":"SUPPLIER_PAYMENT_NOT_FOUND"}'::jsonb
          ELSE '{"status":"allocation_invalid","error_code":"SUPPLIER_PAYMENT_ALLOCATION_INVALID"}'::jsonb END;
      END IF;
      IF attempt = 11 THEN
        IF NOT collision THEN RAISE EXCEPTION 'Foreign payment UUID did not hit the exact primary-key rejection: %',result; END IF;
      ELSIF result IS DISTINCT FROM expected THEN
        RAISE EXCEPTION 'Financial cross-tenant attempt % wrong rejection: %',attempt,result;
      END IF;
      IF pg_temp.stage_b_financial_facts(tenant_ids,ignored_keys) IS DISTINCT FROM before_facts THEN
        RAISE EXCEPTION 'Financial attempt % changed either tenant facts or existing command history',attempt;
      END IF;
      -- Business rejections intentionally freeze one failure event in the caller
      -- tenant. A primary-key exception rolls back and records no command result.
      SELECT count(*) INTO event_count FROM public.supplier_command_events event
        WHERE event.idempotency_key = command_key::text;
      IF event_count <> (CASE WHEN collision THEN 0 ELSE 1 END)
        OR (NOT collision AND NOT EXISTS(SELECT 1 FROM public.supplier_command_events event
          WHERE event.idempotency_key = command_key::text AND event.tenant_id = local_case.tenant_id
            AND event.actor_user_id = CASE WHEN attempt = 5 THEN local_case.reviewer_user_id ELSE local_case.actor_user_id END
            AND event.to_state = expected)) THEN
        RAISE EXCEPTION 'Financial attempt % leaked or changed rejection event ownership/result',attempt;
      END IF;
    END LOOP;
    ignored_keys := ARRAY[]::text[];
    before_facts := pg_temp.stage_b_financial_facts(tenant_ids,ignored_keys);
    result := public.confirm_supplier_payment(local_case.payment_id,local_case.request_id,local_case.tenant_id,3,
      'bank_transfer','TENANT-CONTROL',local_case.paid_at,'["https://smoke.invalid/proof"]',NULL,
      jsonb_build_array(jsonb_build_object('payment_request_allocation_id',local_case.allocation_id,
        'payable_event_id',local_case.payable_id,'amount','1.00')),
      local_case.actor_user_id,local_case.actor_employee_id,local_case.payment_key);
    IF result->>'idempotent' IS DISTINCT FROM 'true'
      OR result - 'idempotent' IS DISTINCT FROM local_case.payment_result - 'idempotent'
      OR pg_temp.stage_b_financial_facts(tenant_ids,ignored_keys) IS DISTINCT FROM before_facts THEN
      RAISE EXCEPTION 'Financial original-key replay leaked another result or double-paid: %',result;
    END IF;
  END LOOP;
END;
$isolation$;
ROLLBACK;
