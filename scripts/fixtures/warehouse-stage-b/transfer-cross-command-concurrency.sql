-- Independent backend transactions. B must wait on A before A may commit.
CREATE FUNCTION public.stage_d_cross_schedule(p_a text,p_b text,p_early_commit boolean DEFAULT false,
  p_wait_for_timeout boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE a jsonb; b jsonb; a_pid integer; b_pid integer; deadline timestamptz;
  lock_evidence jsonb;
BEGIN
  PERFORM extensions.dblink_connect('cross-a','host=/tmp dbname=postgres user=postgres application_name=cross-a');
  PERFORM extensions.dblink_connect('cross-b','host=/tmp dbname=postgres user=postgres application_name=cross-b');
  PERFORM extensions.dblink_exec('cross-a','SET statement_timeout=''8s''');
  PERFORM extensions.dblink_exec('cross-b',CASE WHEN p_wait_for_timeout THEN 'SET statement_timeout=''500ms'''
    ELSE 'SET statement_timeout=''8s''' END);
  SELECT pid INTO a_pid FROM extensions.dblink('cross-a','SELECT pg_backend_pid()') AS t(pid integer);
  SELECT pid INTO b_pid FROM extensions.dblink('cross-b','SELECT pg_backend_pid()') AS t(pid integer);
  IF a_pid=b_pid OR pg_backend_pid() IN (a_pid,b_pid) THEN RAISE EXCEPTION 'Connections are not independent'; END IF;
  PERFORM extensions.dblink_exec('cross-a','BEGIN');
  PERFORM extensions.dblink_exec('cross-b','BEGIN');
  SELECT result INTO STRICT a FROM extensions.dblink('cross-a',p_a) AS t(result jsonb);
  IF p_early_commit THEN PERFORM extensions.dblink_exec('cross-a','COMMIT'); END IF;
  IF extensions.dblink_send_query('cross-b',p_b)<>1 THEN RAISE EXCEPTION 'Could not dispatch B'; END IF;
  deadline:=clock_timestamp()+interval '4 seconds';
  LOOP
    PERFORM pg_stat_clear_snapshot();
    SELECT jsonb_build_object('a_pid',a_pid,'b_pid',b_pid,'wait_event_type',wait_event_type,
      'wait_event',wait_event,'blocking_pids',pg_blocking_pids(b_pid)) INTO lock_evidence
      FROM pg_stat_activity WHERE pid=b_pid AND state='active' AND wait_event_type='Lock'
        AND a_pid=ANY(pg_blocking_pids(b_pid));
    EXIT WHEN lock_evidence IS NOT NULL;
    IF extensions.dblink_is_busy('cross-b')=0 OR clock_timestamp()>deadline THEN
      RAISE EXCEPTION USING ERRCODE='P9002',MESSAGE='CROSS_COMMAND_EXPECTED_LOCK_WAIT';
    END IF;
    -- Poll actual lock state with a deadline; delay alone never qualifies as concurrency.
    PERFORM pg_sleep(0.01);
  END LOOP;
  IF p_wait_for_timeout THEN
    -- After observing B blocked by A, retain A's uncommitted business write.
    -- The real B statement_timeout must escape dblink_get_result as 57014.
    SELECT result INTO b FROM extensions.dblink_get_result('cross-b') AS t(result jsonb);
    RAISE EXCEPTION 'Timeout control unexpectedly returned a result: %',b;
  END IF;
  PERFORM extensions.dblink_exec('cross-a','COMMIT');
  SELECT result INTO STRICT b FROM extensions.dblink_get_result('cross-b') AS t(result jsonb);
  PERFORM * FROM extensions.dblink_get_result('cross-b') AS t(result jsonb);
  PERFORM extensions.dblink_exec('cross-b','COMMIT');
  PERFORM extensions.dblink_disconnect('cross-a');
  PERFORM extensions.dblink_disconnect('cross-b');
  RETURN jsonb_build_object('a',a,'b',b,'lock',lock_evidence);
EXCEPTION WHEN query_canceled OR OTHERS THEN
  -- Disconnect rolls back every still-open remote transaction, including B on
  -- the negative path. Re-raise the original error; never convert it to success.
  IF 'cross-a'=ANY(COALESCE(extensions.dblink_get_connections(),ARRAY[]::text[])) THEN
    PERFORM extensions.dblink_disconnect('cross-a');
  END IF;
  IF 'cross-b'=ANY(COALESCE(extensions.dblink_get_connections(),ARRAY[]::text[])) THEN
    PERFORM extensions.dblink_cancel_query('cross-b');
    PERFORM extensions.dblink_disconnect('cross-b');
  END IF;
  RAISE;
END;
$$;

-- RED control uses actual transfer commands with A committed before B starts.
-- Its reverse transfer B remains uncommitted and must roll back on rejection.
CREATE TABLE public.stage_d_cross_negative(a uuid,b uuid);
INSERT INTO public.stage_d_cross_negative VALUES(public.stage_d_transfer_prepare(false,'0.1'),public.stage_d_transfer_prepare(true,'0.1'));
DO $$
DECLARE n public.stage_d_cross_negative%ROWTYPE; rejected boolean:=false; r jsonb;
BEGIN
  SELECT * INTO STRICT n FROM public.stage_d_cross_negative;
  BEGIN
    PERFORM public.stage_d_cross_schedule(format('SELECT public.stage_d_race_complete(%L)',n.a),
      format('SELECT public.stage_d_race_complete(%L)',n.b),true);
  EXCEPTION WHEN SQLSTATE 'P9002' THEN
    IF SQLERRM<>'CROSS_COMMAND_EXPECTED_LOCK_WAIT' THEN RAISE; END IF;
    rejected:=true;
  END;
  IF NOT rejected OR extensions.dblink_get_connections() IS NOT NULL
    OR (SELECT status FROM public.warehouse_transfer_orders WHERE id=n.a) IS DISTINCT FROM 'completed'
    OR (SELECT status FROM public.warehouse_transfer_orders WHERE id=n.b) IS DISTINCT FROM 'submitted'
    OR EXISTS(SELECT 1 FROM public.warehouse_transfer_command_events WHERE order_id=n.b AND command='complete')
    OR EXISTS(SELECT 1 FROM public.inventory_transactions tx JOIN public.warehouse_transfer_order_items i
      ON i.id=tx.source_id WHERE i.transfer_order_id=n.b) THEN
    RAISE EXCEPTION 'Negative control failed to reject serial execution or clean up B';
  END IF;
  r:=public.stage_d_race_complete(n.b);
  IF r->>'status' IS DISTINCT FROM 'completed' THEN RAISE EXCEPTION 'Negative control reverse restore: %',r; END IF;
END;
$$;
SELECT 'EVIDENCE cross-command negative control: A committed early; exact P9002 CROSS_COMMAND_EXPECTED_LOCK_WAIT; B rolled back; both connections closed; real reverse restored stock';

CREATE TABLE public.stage_d_cross_timeout(a uuid,b uuid);
INSERT INTO public.stage_d_cross_timeout VALUES(public.stage_d_transfer_prepare(false,'0.1'),public.stage_d_transfer_prepare(true,'0.1'));
DO $$
DECLARE n public.stage_d_cross_timeout%ROWTYPE; f public.stage_c_material_fixture%ROWTYPE;
  rejected boolean:=false; started_at timestamptz:=clock_timestamp(); financial_before jsonb; balances_before jsonb;
BEGIN
  SELECT * INTO STRICT n FROM public.stage_d_cross_timeout;
  SELECT * INTO STRICT f FROM public.stage_c_material_fixture;
  financial_before:=public.stage_d_transfer_financial_snapshot(f.tenant_id);
  SELECT jsonb_agg(to_jsonb(b) ORDER BY id) INTO balances_before FROM public.inventory_balances b WHERE tenant_id=f.tenant_id;
  BEGIN
    PERFORM public.stage_d_cross_schedule(format('SELECT public.stage_d_race_complete(%L)',n.a),
      format('SELECT public.stage_d_race_complete(%L)',n.b),false,true);
  EXCEPTION WHEN SQLSTATE '57014' THEN
    IF SQLERRM<>'canceling statement due to statement timeout' THEN RAISE; END IF;
    rejected:=true;
  END;
  IF NOT rejected THEN RAISE EXCEPTION 'Timeout control did not preserve original 57014'; END IF;
  IF extensions.dblink_get_connections() IS NOT NULL THEN
    RAISE EXCEPTION 'Timeout control leaked dblink connections after 57014';
  END IF;
  IF clock_timestamp()-started_at>=interval '8 seconds'
    OR (SELECT count(*) FROM public.warehouse_transfer_orders WHERE id IN (n.a,n.b) AND status='submitted' AND version=2)<>2
    OR EXISTS(SELECT 1 FROM public.warehouse_transfer_command_events WHERE order_id IN (n.a,n.b) AND command='complete')
    OR EXISTS(SELECT 1 FROM public.warehouse_transfer_order_items WHERE transfer_order_id IN (n.a,n.b) AND amount IS NOT NULL)
    OR EXISTS(SELECT 1 FROM public.inventory_transactions tx JOIN public.warehouse_transfer_order_items i
      ON i.id=tx.source_id WHERE i.transfer_order_id IN (n.a,n.b))
    OR public.stage_d_transfer_financial_snapshot(f.tenant_id) IS DISTINCT FROM financial_before
    OR (SELECT jsonb_agg(to_jsonb(b) ORDER BY id) FROM public.inventory_balances b WHERE tenant_id=f.tenant_id) IS DISTINCT FROM balances_before THEN
    RAISE EXCEPTION 'Timeout control exceeded deadline or failed to roll back uncommitted business writes';
  END IF;
END;
$$;
SELECT 'EVIDENCE cross-command timeout: observed B Lock before actual 500ms statement_timeout; original 57014 preserved; both connections closed; A and B business writes rolled back within 8s';

CREATE FUNCTION public.stage_d_cross_assert_inventory(p_tenant uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM
    (SELECT warehouse_id,supplier_sku_id,quantity_on_hand,inventory_value,average_unit_cost
      FROM public.inventory_balances WHERE tenant_id=p_tenant) b
    FULL JOIN (SELECT warehouse_id,supplier_sku_id,sum(quantity_delta) q,sum(value_delta) v
      FROM public.inventory_transactions WHERE tenant_id=p_tenant GROUP BY warehouse_id,supplier_sku_id) l
      USING(warehouse_id,supplier_sku_id)
    WHERE b.quantity_on_hand IS DISTINCT FROM l.q OR b.inventory_value IS DISTINCT FROM l.v
      OR b.average_unit_cost IS DISTINCT FROM CASE WHEN l.q=0 THEN 0 ELSE round(l.v/l.q,4) END) THEN
    RAISE EXCEPTION 'Cross-command full ledger/balance/average reconciliation failed';
  END IF;
END;
$$;

CREATE FUNCTION public.stage_d_cross_run(p_name text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  c public.stage_d_cross_case%ROWTYPE; f public.stage_c_material_fixture%ROWTYPE;
  transfer_sql text; other_sql text; r jsonb; transfer_result jsonb; other_result jsonb;
  after_business jsonb; normalized_financial jsonb; source_item uuid; v_amount numeric; lock_evidence jsonb;
  reverse_id uuid; reverse_result jsonb;
BEGIN
  SELECT * INTO STRICT c FROM public.stage_d_cross_case WHERE name=p_name;
  SELECT * INTO STRICT f FROM public.stage_c_material_fixture;
  transfer_sql:=format('SELECT public.stage_d_race_complete(%L)',c.transfer_id);
  other_sql:=format('SELECT public.stage_d_cross_other(%L)',p_name);
  r:=public.stage_d_cross_schedule(CASE WHEN c.transfer_first THEN transfer_sql ELSE other_sql END,
    CASE WHEN c.transfer_first THEN other_sql ELSE transfer_sql END);
  lock_evidence:=r->'lock';
  transfer_result:=r->CASE WHEN c.transfer_first THEN 'a' ELSE 'b' END;
  other_result:=r->CASE WHEN c.transfer_first THEN 'b' ELSE 'a' END;
  IF transfer_result->>'status' IS DISTINCT FROM 'completed'
    OR other_result->>'status' IS DISTINCT FROM (CASE WHEN c.kind='return' THEN 'completed' ELSE 'receipt_created' END)
    OR (SELECT count(*) FROM public.warehouse_transfer_orders WHERE id=c.transfer_id AND status='completed' AND version=3)<>1
    OR (SELECT count(*) FROM public.warehouse_transfer_command_events WHERE order_id=c.transfer_id)<>3
    OR (SELECT count(*) FROM public.warehouse_transfer_command_events WHERE order_id=c.transfer_id
      AND command='complete' AND result=transfer_result)<>1
    OR (SELECT count(*) FROM public.warehouse_transfer_order_items WHERE transfer_order_id=c.transfer_id)<>1
    OR (SELECT count(*) FROM public.inventory_transactions WHERE tenant_id=f.tenant_id)<>c.inventory_before+3 THEN
    RAISE EXCEPTION 'Cross-command statuses, versions, receipts or fact count failed for %: %',p_name,r;
  END IF;
  IF EXISTS(SELECT 1 FROM public.warehouse_transfer_order_items i
    LEFT JOIN public.inventory_transactions tx ON tx.source_id=i.id AND tx.tenant_id=i.tenant_id
    WHERE i.transfer_order_id=c.transfer_id GROUP BY i.id
    HAVING count(tx.id)<>2 OR sum(tx.quantity_delta)<>0 OR sum(tx.value_delta)<>0
      OR count(*) FILTER(WHERE tx.source_type='warehouse_transfer_out_item' AND tx.transaction_type='transfer_out'
        AND tx.quantity_delta=-i.quantity AND tx.value_delta=-i.amount)<>1
      OR count(*) FILTER(WHERE tx.source_type='warehouse_transfer_in_item' AND tx.transaction_type='transfer_in'
        AND tx.quantity_delta=i.quantity AND tx.value_delta=i.amount)<>1) THEN
    RAISE EXCEPTION 'Transfer did not produce exactly one equal quantity/value pair: %',p_name;
  END IF;
  after_business:=public.stage_d_transfer_financial_snapshot(f.tenant_id);
  normalized_financial:=after_business;
  IF c.kind='return' THEN
    SELECT id,ri.amount INTO STRICT source_item,v_amount FROM public.warehouse_return_order_items ri WHERE return_order_id=c.other_id;
    IF (SELECT count(*) FROM public.warehouse_return_orders WHERE id=c.other_id AND status='completed' AND version=2)<>1
      OR (SELECT count(*) FROM public.warehouse_issue_orders WHERE id=c.issue_id AND status='completed' AND version=3)<>1
      OR (SELECT count(*) FROM public.warehouse_material_command_events WHERE order_id=c.issue_id)<>3
      OR (SELECT count(*) FROM public.warehouse_material_command_events WHERE order_id=c.issue_id
        AND command='complete' AND result->>'status'='completed')<>1
      OR (SELECT count(*) FROM public.warehouse_material_command_events WHERE order_id=c.other_id)<>2
      OR (SELECT count(*) FROM public.warehouse_material_command_events WHERE order_id=c.other_id AND command='complete' AND result=other_result)<>1
      OR (SELECT count(*) FROM public.inventory_transactions WHERE source_id=source_item
        AND source_type='warehouse_return_item' AND quantity_delta=0.1 AND value_delta=v_amount)<>1
      OR (SELECT count(*) FROM public.project_cost_events WHERE warehouse_return_item_id=source_item
        AND source_type='warehouse_return_item' AND event_direction='decrease' AND accepted_quantity=0.1 AND amount=v_amount)<>1
      OR (SELECT amount FROM public.warehouse_issue_order_items WHERE issue_order_id=c.issue_id) IS DISTINCT FROM v_amount
      OR (SELECT count(*) FROM public.inventory_transactions tx JOIN public.warehouse_issue_order_items i ON i.id=tx.source_id
        WHERE i.issue_order_id=c.issue_id AND tx.source_type='warehouse_issue_item'
          AND tx.quantity_delta=-0.1 AND tx.value_delta=-v_amount)<>1
      OR (SELECT count(*) FROM public.project_cost_events e JOIN public.warehouse_issue_order_items i ON i.id=e.warehouse_issue_item_id
        WHERE i.issue_order_id=c.issue_id AND e.event_direction='increase' AND e.amount=v_amount)<>1
      OR (SELECT sum(quantity) FROM public.warehouse_return_order_items WHERE original_issue_order_id=c.issue_id) IS DISTINCT FROM 0.1 THEN
      RAISE EXCEPTION 'Return source/version/unique reversal failed for %',p_name;
    END IF;
    -- Remove only the legitimate return reversal; everything else, including
    -- prior costs, payables, payments and cash, must be byte-for-byte unchanged.
    normalized_financial:=jsonb_set(normalized_financial,'{costs}',COALESCE(
      (SELECT jsonb_agg(to_jsonb(e) ORDER BY id) FROM public.project_cost_events e
        WHERE tenant_id=f.tenant_id AND warehouse_return_item_id IS DISTINCT FROM source_item),'null'::jsonb));
  ELSE
    SELECT id INTO STRICT source_item FROM public.supplier_purchase_order_receipt_items
      WHERE receipt_id=c.other_id;
    IF (SELECT count(*) FROM public.supplier_purchase_order_receipts WHERE id=c.other_id AND supplier_purchase_order_id=c.purchase_order_id)<>1
      OR (SELECT count(*) FROM public.supplier_purchase_order_fulfillments WHERE supplier_purchase_order_id=c.purchase_order_id
        AND version=c.fulfillment_version+1 AND status='received')<>1
      OR (SELECT count(*) FROM public.supplier_command_events WHERE resource_id=c.purchase_order_id
        AND command='create_supplier_purchase_order_receipt')<>1
      OR (SELECT count(*) FROM public.supplier_command_events WHERE resource_id=c.purchase_order_id
        AND command='create_supplier_purchase_order_receipt' AND idempotency_key=p_name||'-complete'
        AND result_version=c.fulfillment_version+1 AND to_state=other_result)<>1
      OR (SELECT count(*) FROM public.inventory_transactions WHERE source_id=source_item
        AND source_type='supplier_purchase_receipt_item' AND quantity_delta=0.3 AND value_delta=0.02)<>1
      OR (SELECT count(*) FROM public.supplier_payable_events WHERE supplier_purchase_order_receipt_id=c.other_id
        AND destination_type='warehouse' AND warehouse_id=f.warehouse_id AND project_id IS NULL AND accepted_quantity=0.3 AND amount=0.02)<>1 THEN
      RAISE EXCEPTION 'Receipt source/version/unique payable failed for %: %',p_name,other_result;
    END IF;
    normalized_financial:=jsonb_set(normalized_financial,'{payables}',COALESCE(
      (SELECT jsonb_agg(to_jsonb(e) ORDER BY id) FROM public.supplier_payable_events e
        WHERE tenant_id=f.tenant_id AND supplier_purchase_order_receipt_id IS DISTINCT FROM c.other_id),'null'::jsonb));
  END IF;
  IF normalized_financial IS DISTINCT FROM c.financial_before THEN
    RAISE EXCEPTION 'Transfer introduced extra financial facts or changed prior facts: %',p_name;
  END IF;
  -- Real command replays must retain versions and never duplicate any source.
  IF public.stage_d_race_complete(c.transfer_id) IS DISTINCT FROM transfer_result THEN
    RAISE EXCEPTION 'Transfer replay changed result: %',p_name;
  END IF;
  r:=public.stage_d_cross_other(p_name);
  IF (r-'idempotent') IS DISTINCT FROM (other_result-'idempotent')
    OR (SELECT count(*) FROM public.inventory_transactions WHERE tenant_id=f.tenant_id)<>c.inventory_before+3
    OR (SELECT version FROM public.warehouse_transfer_orders WHERE id=c.transfer_id) IS DISTINCT FROM 3
    OR (SELECT count(*) FROM public.warehouse_transfer_command_events WHERE order_id=c.transfer_id AND command='complete')<>1
    OR (c.kind='return' AND ((SELECT version FROM public.warehouse_return_orders WHERE id=c.other_id) IS DISTINCT FROM 2
      OR (SELECT count(*) FROM public.warehouse_material_command_events WHERE order_id=c.other_id AND command='complete')<>1))
    OR (c.kind='receipt' AND ((SELECT version FROM public.supplier_purchase_order_fulfillments
      WHERE supplier_purchase_order_id=c.purchase_order_id) IS DISTINCT FROM c.fulfillment_version+1
      OR (SELECT count(*) FROM public.supplier_command_events WHERE resource_id=c.purchase_order_id
        AND command='create_supplier_purchase_order_receipt')<>1))
    OR public.stage_d_transfer_financial_snapshot(f.tenant_id) IS DISTINCT FROM after_business THEN
    RAISE EXCEPTION 'Cross-command replay duplicated inventory/financial facts: %',p_name;
  END IF;
  PERFORM public.stage_d_cross_assert_inventory(f.tenant_id);
  -- Restore only warehouse distribution via normal commands; receipt stock is
  -- retained. No balance rows are overwritten to make reconciliation pass.
  reverse_id:=public.stage_d_transfer_prepare(true,'0.1');
  reverse_result:=public.stage_d_race_complete(reverse_id);
  IF reverse_result->>'status' IS DISTINCT FROM 'completed'
    OR public.stage_d_transfer_financial_snapshot(f.tenant_id) IS DISTINCT FROM after_business THEN
    RAISE EXCEPTION 'Reverse transfer restore changed financial facts: %',p_name;
  END IF;
  PERFORM public.stage_d_cross_assert_inventory(f.tenant_id);
  RETURN 'EVIDENCE cross-command '||p_name||': '||lock_evidence::text||'; '||
    jsonb_build_object('transfer',transfer_result->>'status','other',other_result->>'status')::text||
    '; versions/unique receipts/3 inventory facts/transfer pair net 0/full ledger/replay/financial attribution verified';
END;
$$;

SELECT public.stage_d_cross_prepare('return-first','return',false);
SELECT public.stage_d_cross_run('return-first');
SELECT public.stage_d_cross_prepare('transfer-before-return','return',true);
SELECT public.stage_d_cross_run('transfer-before-return');
SELECT public.stage_d_cross_prepare('receipt-first','receipt',false);
SELECT public.stage_d_cross_run('receipt-first');
SELECT public.stage_d_cross_prepare('transfer-before-receipt','receipt',true);
SELECT public.stage_d_cross_run('transfer-before-receipt');
DO $$
DECLARE f public.stage_c_material_fixture%ROWTYPE;
BEGIN
  SELECT * INTO STRICT f FROM public.stage_c_material_fixture;
  IF (SELECT count(*) FROM public.stage_d_cross_case)<>4
    OR extensions.dblink_get_connections() IS NOT NULL
    OR (SELECT quantity_on_hand FROM public.inventory_balances WHERE tenant_id=f.tenant_id
      AND warehouse_id=f.warehouse_id AND supplier_sku_id=f.sku_id) IS DISTINCT FROM 0.9
    OR (SELECT inventory_value FROM public.inventory_balances WHERE tenant_id=f.tenant_id
      AND warehouse_id=f.warehouse_id AND supplier_sku_id=f.sku_id) IS DISTINCT FROM 0.06
    OR (SELECT sum(quantity_delta) FROM public.inventory_transactions WHERE tenant_id=f.tenant_id AND supplier_sku_id=f.sku_id) IS DISTINCT FROM 0.9
    OR (SELECT sum(value_delta) FROM public.inventory_transactions WHERE tenant_id=f.tenant_id AND supplier_sku_id=f.sku_id) IS DISTINCT FROM 0.06
    OR (SELECT sum(CASE event_direction WHEN 'increase' THEN amount ELSE -amount END)
      FROM public.project_cost_events WHERE tenant_id=f.tenant_id) IS DISTINCT FROM 0
    OR (SELECT count(*) FROM public.supplier_payable_events WHERE tenant_id=f.tenant_id)<>2
    OR (SELECT sum(amount) FROM public.supplier_payable_events WHERE tenant_id=f.tenant_id) IS DISTINCT FROM 0.04 THEN
    RAISE EXCEPTION 'Cross-command final totals or connection cleanup failed';
  END IF;
  PERFORM public.stage_d_cross_assert_inventory(f.tenant_id);
END;
$$;
SELECT 'EVIDENCE cross-command final: 4 real Lock waits; source stock 0.9 / 0.06 includes 2 actual receipts; net project cost 0; 2 legitimate payables total 0.04; connections closed';
