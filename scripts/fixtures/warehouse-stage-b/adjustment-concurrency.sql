-- Independent backend transactions. B must wait on A before A may commit.
CREATE EXTENSION IF NOT EXISTS dblink WITH SCHEMA extensions;
CREATE FUNCTION public.stage_d22_schedule(p_a text,p_b text,p_early_commit boolean DEFAULT false,
  p_wait_for_timeout boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE a jsonb; b jsonb; a_pid integer; b_pid integer; deadline timestamptz;
  lock_evidence jsonb;
BEGIN
  PERFORM extensions.dblink_connect('adjustment-a','host=/tmp dbname=postgres user=postgres application_name=adjustment-a');
  PERFORM extensions.dblink_connect('adjustment-b','host=/tmp dbname=postgres user=postgres application_name=adjustment-b');
  PERFORM extensions.dblink_exec('adjustment-a','SET statement_timeout=''8s''');
  PERFORM extensions.dblink_exec('adjustment-b',CASE WHEN p_wait_for_timeout THEN 'SET statement_timeout=''500ms'''
    ELSE 'SET statement_timeout=''8s''' END);
  SELECT pid INTO a_pid FROM extensions.dblink('adjustment-a','SELECT pg_backend_pid()') AS t(pid integer);
  SELECT pid INTO b_pid FROM extensions.dblink('adjustment-b','SELECT pg_backend_pid()') AS t(pid integer);
  IF a_pid=b_pid OR pg_backend_pid() IN (a_pid,b_pid) THEN RAISE EXCEPTION 'Connections are not independent'; END IF;
  PERFORM extensions.dblink_exec('adjustment-a','BEGIN');
  PERFORM extensions.dblink_exec('adjustment-b','BEGIN');
  SELECT result INTO STRICT a FROM extensions.dblink('adjustment-a',p_a) AS t(result jsonb);
  IF p_early_commit THEN PERFORM extensions.dblink_exec('adjustment-a','COMMIT'); END IF;
  IF extensions.dblink_send_query('adjustment-b',p_b)<>1 THEN RAISE EXCEPTION 'Could not dispatch B'; END IF;
  deadline:=clock_timestamp()+interval '4 seconds';
  LOOP
    PERFORM pg_stat_clear_snapshot();
    SELECT jsonb_build_object('a_pid',a_pid,'b_pid',b_pid,'wait_event_type',wait_event_type,
      'wait_event',wait_event,'blocking_pids',pg_blocking_pids(b_pid)) INTO lock_evidence
      FROM pg_stat_activity WHERE pid=b_pid AND state='active' AND wait_event_type='Lock'
        AND a_pid=ANY(pg_blocking_pids(b_pid));
    EXIT WHEN lock_evidence IS NOT NULL;
    IF extensions.dblink_is_busy('adjustment-b')=0 OR clock_timestamp()>deadline THEN
      RAISE EXCEPTION USING ERRCODE='P9002',MESSAGE='ADJUSTMENT_EXPECTED_LOCK_WAIT';
    END IF;
    -- Poll actual lock state with a deadline; delay alone never qualifies as concurrency.
    PERFORM pg_sleep(0.01);
  END LOOP;
  IF p_wait_for_timeout THEN
    -- After observing B blocked by A, retain A's uncommitted business write.
    -- The real B statement_timeout must escape dblink_get_result as 57014.
    SELECT result INTO b FROM extensions.dblink_get_result('adjustment-b') AS t(result jsonb);
    RAISE EXCEPTION 'Timeout control unexpectedly returned a result: %',b;
  END IF;
  PERFORM extensions.dblink_exec('adjustment-a','COMMIT');
  SELECT result INTO STRICT b FROM extensions.dblink_get_result('adjustment-b') AS t(result jsonb);
  PERFORM * FROM extensions.dblink_get_result('adjustment-b') AS t(result jsonb);
  PERFORM extensions.dblink_exec('adjustment-b','COMMIT');
  PERFORM extensions.dblink_disconnect('adjustment-a');
  PERFORM extensions.dblink_disconnect('adjustment-b');
  RETURN jsonb_build_object('a',a,'b',b,'lock',lock_evidence);
EXCEPTION WHEN query_canceled OR OTHERS THEN
  -- Disconnect rolls back every still-open remote transaction, including B on
  -- the negative path. Re-raise the original error; never convert it to success.
  IF 'adjustment-a'=ANY(COALESCE(extensions.dblink_get_connections(),ARRAY[]::text[])) THEN
    PERFORM extensions.dblink_disconnect('adjustment-a');
  END IF;
  IF 'adjustment-b'=ANY(COALESCE(extensions.dblink_get_connections(),ARRAY[]::text[])) THEN
    PERFORM extensions.dblink_cancel_query('adjustment-b');
    PERFORM extensions.dblink_disconnect('adjustment-b');
  END IF;
  RAISE;
END;
$$;

CREATE FUNCTION public.stage_d22_transfer_prepare(p_source uuid,p_destination uuid) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE f public.stage_d22_fixture%ROWTYPE; v_id uuid:=gen_random_uuid();
BEGIN
  SELECT * INTO STRICT f FROM public.stage_d22_fixture;
  PERFORM set_config('request.jwt.claim.role','service_role',true);
  PERFORM public.command_warehouse_transfer_order(v_id,f.tenant_id,'save_draft',0,
    jsonb_build_object('source_warehouse_id',p_source,'destination_warehouse_id',p_destination,'reason','Adjustment contention',
      'items',jsonb_build_array(jsonb_build_object('supplier_sku_id',f.second_sku_id,'quantity','1'))),
    f.actor_user_id,f.actor_employee_id,v_id||':save');
  PERFORM public.command_warehouse_transfer_order(v_id,f.tenant_id,'submit',1,'{}',f.actor_user_id,f.actor_employee_id,v_id||':submit');
  RETURN v_id;
END;
$$;
CREATE FUNCTION public.stage_d22_stocktake_prepare() RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE f public.stage_d22_fixture%ROWTYPE; v_id uuid:=gen_random_uuid(); q text;
BEGIN
  SELECT * INTO STRICT f FROM public.stage_d22_fixture;
  SELECT (quantity_on_hand+1)::text INTO STRICT q FROM public.inventory_balances WHERE warehouse_id=f.warehouse_id AND supplier_sku_id=f.second_sku_id;
  PERFORM set_config('request.jwt.claim.role','service_role',true);
  PERFORM public.command_warehouse_stocktake_order(v_id,f.tenant_id,'save_draft',0,
    jsonb_build_object('warehouse_id',f.warehouse_id,'reason','Adjustment stocktake race',
      'items',jsonb_build_array(jsonb_build_object('supplier_sku_id',f.second_sku_id))),f.actor_user_id,f.actor_employee_id,v_id||':save');
  PERFORM public.command_warehouse_stocktake_order(v_id,f.tenant_id,'start',1,'{}',f.actor_user_id,f.actor_employee_id,v_id||':start');
  PERFORM public.command_warehouse_stocktake_order(v_id,f.tenant_id,'record_counts',2,
    jsonb_build_object('items',jsonb_build_array(jsonb_build_object('supplier_sku_id',f.second_sku_id,'counted_quantity',q,'difference_reason','Adjustment race'))),
    f.actor_user_id,f.actor_employee_id,v_id||':counts');
  PERFORM public.command_warehouse_stocktake_order(v_id,f.tenant_id,'submit',3,'{}',f.actor_user_id,f.actor_employee_id,v_id||':submit');
  RETURN v_id;
END;
$$;
CREATE FUNCTION public.stage_d22_race_call(p_kind text,p_id uuid) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE f public.stage_d22_fixture%ROWTYPE;
BEGIN
  SELECT * INTO STRICT f FROM public.stage_d22_fixture;
  IF p_kind='adjustment' THEN RETURN public.stage_d22_command(p_id,'complete',2); END IF;
  IF p_kind='submit' THEN RETURN public.stage_d22_command(p_id,'submit',1); END IF;
  PERFORM set_config('request.jwt.claim.role','service_role',true);
  IF p_kind='stocktake' THEN
    RETURN public.command_warehouse_stocktake_order(p_id,f.tenant_id,'complete',4,'{}',f.actor_user_id,f.actor_employee_id,p_id||':complete');
  END IF;
  RETURN public.command_warehouse_transfer_order(p_id,f.tenant_id,'complete',2,'{}',f.actor_user_id,f.actor_employee_id,p_id||':complete');
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM IN ('WAREHOUSE_ADJUSTMENT_SNAPSHOT_CONFLICT','WAREHOUSE_STOCKTAKE_SNAPSHOT_CONFLICT') THEN RETURN jsonb_build_object('error',SQLERRM); END IF;
  RAISE;
END;
$$;
CREATE TABLE public.stage_d22_race_case(name text PRIMARY KEY,a_id uuid,b_id uuid,a_kind text,b_kind text,b_expected text,
  before_facts integer,before_snapshot jsonb);
CREATE FUNCTION public.stage_d22_race_prepare(p_name text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE f public.stage_d22_fixture%ROWTYPE; a uuid; b uuid; ak text:='adjustment'; bk text:='adjustment'; expected text:='completed'; w uuid;
BEGIN
  SELECT * INTO STRICT f FROM public.stage_d22_fixture;
  IF p_name='absent-created' THEN
    w:=gen_random_uuid(); INSERT INTO public.warehouses(id,tenant_id,name) VALUES(w,f.tenant_id,'Adjustment absent balance race');
    b:=gen_random_uuid(); bk:='submit'; expected:='submitted';
    PERFORM public.stage_d22_command(b,'save_draft',0,public.stage_d22_draft(f.second_sku_id)||jsonb_build_object('warehouse_id',w));
    a:=public.stage_d22_transfer_prepare(f.warehouse_id,w); ak:='transfer';
  ELSIF p_name='transfer-first' THEN
    a:=public.stage_d22_transfer_prepare(f.warehouse_id,f.destination_id); ak:='transfer';
    b:=public.stage_d22_prepare(f.second_sku_id); expected:='WAREHOUSE_ADJUSTMENT_SNAPSHOT_CONFLICT';
  ELSIF p_name='stocktake-first' THEN
    a:=public.stage_d22_stocktake_prepare(); ak:='stocktake';
    b:=public.stage_d22_prepare(f.second_sku_id); expected:='WAREHOUSE_ADJUSTMENT_SNAPSHOT_CONFLICT';
  ELSE
    a:=public.stage_d22_prepare(f.second_sku_id);
    IF p_name='adjustment-before-transfer' THEN b:=public.stage_d22_transfer_prepare(f.warehouse_id,f.destination_id); bk:='transfer';
    ELSIF p_name='adjustment-before-stocktake' THEN b:=public.stage_d22_stocktake_prepare(); bk:='stocktake'; expected:='WAREHOUSE_STOCKTAKE_SNAPSHOT_CONFLICT';
    ELSIF p_name IN ('same-key','serial-negative','timeout-negative') THEN b:=a;
    ELSE b:=public.stage_d22_prepare(f.second_sku_id); expected:='WAREHOUSE_ADJUSTMENT_SNAPSHOT_CONFLICT'; END IF;
  END IF;
  INSERT INTO public.stage_d22_race_case VALUES(p_name,a,b,ak,bk,expected,(SELECT count(*) FROM public.inventory_transactions),public.stage_d22_snapshot());
END;
$$;
CREATE FUNCTION public.stage_d22_race_run(p_name text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE c public.stage_d22_race_case%ROWTYPE; f public.stage_d22_fixture%ROWTYPE; r jsonb; a_sql text; b_sql text; rejected boolean:=false; wanted integer;
BEGIN
  SELECT * INTO STRICT c FROM public.stage_d22_race_case WHERE name=p_name;
  SELECT * INTO STRICT f FROM public.stage_d22_fixture;
  a_sql:=format('SELECT public.stage_d22_race_call(%L,%L)',c.a_kind,c.a_id);
  b_sql:=format('SELECT public.stage_d22_race_call(%L,%L)',c.b_kind,c.b_id);
  IF p_name IN ('serial-negative','timeout-negative') THEN
    BEGIN
      r:=public.stage_d22_schedule(a_sql,b_sql,p_name='serial-negative',p_name='timeout-negative');
    EXCEPTION WHEN SQLSTATE 'P9002' OR query_canceled THEN
      IF (p_name='serial-negative' AND SQLERRM='ADJUSTMENT_EXPECTED_LOCK_WAIT')
        OR (p_name='timeout-negative' AND SQLSTATE='57014') THEN rejected:=true; ELSE RAISE; END IF;
    END;
    IF NOT rejected OR extensions.dblink_get_connections() IS NOT NULL THEN RAISE EXCEPTION 'Adjustment race negative control failed/unclean'; END IF;
    IF p_name='timeout-negative' AND public.stage_d22_snapshot() IS DISTINCT FROM c.before_snapshot THEN RAISE EXCEPTION 'Timeout leaked transaction'; END IF;
    RETURN 'EVIDENCE adjustment race control '||p_name||': expected failure and clean disconnect';
  END IF;
  r:=public.stage_d22_schedule(a_sql,b_sql);
  IF r->'a'->>'status' IS DISTINCT FROM 'completed'
    OR coalesce(r->'b'->>'status',r->'b'->>'error') IS DISTINCT FROM c.b_expected THEN RAISE EXCEPTION 'Adjustment race outcome %: %',p_name,r; END IF;
  wanted:=CASE p_name WHEN 'adjustment-before-transfer' THEN 3 WHEN 'transfer-first' THEN 2 WHEN 'absent-created' THEN 2 ELSE 1 END;
  IF (SELECT count(*) FROM public.inventory_transactions)<>c.before_facts+wanted THEN RAISE EXCEPTION 'Adjustment race fact count %',p_name; END IF;
  IF p_name='same-key' AND (r->'a' IS DISTINCT FROM r->'b' OR (SELECT count(*) FROM public.warehouse_adjustment_command_events WHERE order_id=c.a_id AND command='complete')<>1) THEN RAISE EXCEPTION 'Concurrent replay not exact/once'; END IF;
  IF c.b_expected='WAREHOUSE_ADJUSTMENT_SNAPSHOT_CONFLICT' AND ((SELECT status FROM public.warehouse_adjustment_orders WHERE id=c.b_id)<>'submitted'
    OR EXISTS(SELECT 1 FROM public.warehouse_adjustment_command_events WHERE order_id=c.b_id AND command='complete')
    OR EXISTS(SELECT 1 FROM public.warehouse_adjustment_order_items WHERE adjustment_order_id=c.b_id AND amount IS NOT NULL)) THEN RAISE EXCEPTION 'Losing adjustment leaked state'; END IF;
  IF p_name='absent-created' AND NOT EXISTS(SELECT 1 FROM public.warehouse_adjustment_order_items i JOIN public.inventory_balances b ON b.id=i.book_balance_id
    WHERE i.adjustment_order_id=c.b_id AND i.book_quantity=1 AND i.book_balance_version=b.version AND i.book_quantity=b.quantity_on_hand
      AND i.book_value=b.inventory_value AND i.amount IS NULL) THEN RAISE EXCEPTION 'Submit did not capture newly committed balance'; END IF;
  IF public.stage_d_transfer_financial_snapshot(f.tenant_id) IS DISTINCT FROM f.financial_before OR extensions.dblink_get_connections() IS NOT NULL THEN RAISE EXCEPTION 'Race financial/connection invariant'; END IF;
  RETURN 'EVIDENCE adjustment race '||p_name||': '||(r->'lock')::text||'; result '||c.b_expected||'; exact facts/receipt/state verified';
END;
$$;
SELECT public.stage_d22_race_prepare('serial-negative');
SELECT public.stage_d22_race_run('serial-negative');
SELECT public.stage_d22_race_prepare('timeout-negative');
SELECT public.stage_d22_race_run('timeout-negative');
SELECT public.stage_d22_race_prepare('two-outdated');
SELECT public.stage_d22_race_run('two-outdated');
SELECT public.stage_d22_race_prepare('same-key');
SELECT public.stage_d22_race_run('same-key');
SELECT public.stage_d22_race_prepare('transfer-first');
SELECT public.stage_d22_race_run('transfer-first');
SELECT public.stage_d22_race_prepare('adjustment-before-transfer');
SELECT public.stage_d22_race_run('adjustment-before-transfer');
SELECT public.stage_d22_race_prepare('stocktake-first');
SELECT public.stage_d22_race_run('stocktake-first');
SELECT public.stage_d22_race_prepare('adjustment-before-stocktake');
SELECT public.stage_d22_race_run('adjustment-before-stocktake');
SELECT public.stage_d22_race_prepare('absent-created');
SELECT public.stage_d22_race_run('absent-created');
DO $$
DECLARE f public.stage_d22_fixture%ROWTYPE; a uuid; t uuid; r uuid; before_q numeric; before_v numeric; before_version integer;
BEGIN
  SELECT * INTO STRICT f FROM public.stage_d22_fixture;
  SELECT quantity_on_hand,inventory_value,version INTO before_q,before_v,before_version FROM public.inventory_balances WHERE warehouse_id=f.warehouse_id AND supplier_sku_id=f.second_sku_id;
  a:=public.stage_d22_prepare(f.second_sku_id);
  t:=public.stage_d22_transfer_prepare(f.warehouse_id,f.destination_id); PERFORM public.stage_d22_race_call('transfer',t);
  r:=public.stage_d22_transfer_prepare(f.destination_id,f.warehouse_id); PERFORM public.stage_d22_race_call('transfer',r);
  IF NOT EXISTS(SELECT 1 FROM public.inventory_balances WHERE warehouse_id=f.warehouse_id AND supplier_sku_id=f.second_sku_id AND quantity_on_hand=before_q AND inventory_value=before_v AND version=before_version+2) THEN RAISE EXCEPTION 'Restored-value control invalid'; END IF;
  PERFORM public.stage_d_transfer_expect_error(public.stage_d22_sql(a,'complete',2),'WAREHOUSE_ADJUSTMENT_SNAPSHOT_CONFLICT');
  IF EXISTS(SELECT 1 FROM (SELECT * FROM public.inventory_balances WHERE tenant_id=f.tenant_id) b FULL JOIN
    (SELECT warehouse_id,supplier_sku_id,sum(quantity_delta) q,sum(value_delta) v FROM public.inventory_transactions WHERE tenant_id=f.tenant_id GROUP BY warehouse_id,supplier_sku_id) l USING(warehouse_id,supplier_sku_id)
    WHERE b.quantity_on_hand IS DISTINCT FROM l.q OR b.inventory_value IS DISTINCT FROM l.v
      OR b.average_unit_cost IS DISTINCT FROM CASE WHEN l.q=0 THEN 0 ELSE round(l.v/l.q,4) END) THEN RAISE EXCEPTION 'Final full tenant ledger mismatch'; END IF;
  IF extensions.dblink_get_connections() IS NOT NULL OR public.stage_d_transfer_financial_snapshot(f.tenant_id) IS DISTINCT FROM f.financial_before THEN RAISE EXCEPTION 'Final financial/connection mismatch'; END IF;
END;
$$;
SELECT 'EVIDENCE adjustment final: real reverse transfer restores value but changes version; snapshot rejected; full tenant ledger/average/financial reconciliation';
