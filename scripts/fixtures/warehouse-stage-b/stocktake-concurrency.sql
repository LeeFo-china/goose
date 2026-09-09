-- Independent backend transactions. B must wait on A before A may commit.
CREATE EXTENSION IF NOT EXISTS dblink WITH SCHEMA extensions;
CREATE FUNCTION public.stage_d2_schedule(p_a text,p_b text,p_early_commit boolean DEFAULT false,
  p_wait_for_timeout boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE a jsonb; b jsonb; a_pid integer; b_pid integer; deadline timestamptz;
  lock_evidence jsonb;
BEGIN
  PERFORM extensions.dblink_connect('stocktake-a','host=/tmp dbname=postgres user=postgres application_name=stocktake-a');
  PERFORM extensions.dblink_connect('stocktake-b','host=/tmp dbname=postgres user=postgres application_name=stocktake-b');
  PERFORM extensions.dblink_exec('stocktake-a','SET statement_timeout=''8s''');
  PERFORM extensions.dblink_exec('stocktake-b',CASE WHEN p_wait_for_timeout THEN 'SET statement_timeout=''500ms'''
    ELSE 'SET statement_timeout=''8s''' END);
  SELECT pid INTO a_pid FROM extensions.dblink('stocktake-a','SELECT pg_backend_pid()') AS t(pid integer);
  SELECT pid INTO b_pid FROM extensions.dblink('stocktake-b','SELECT pg_backend_pid()') AS t(pid integer);
  IF a_pid=b_pid OR pg_backend_pid() IN (a_pid,b_pid) THEN RAISE EXCEPTION 'Connections are not independent'; END IF;
  PERFORM extensions.dblink_exec('stocktake-a','BEGIN');
  PERFORM extensions.dblink_exec('stocktake-b','BEGIN');
  SELECT result INTO STRICT a FROM extensions.dblink('stocktake-a',p_a) AS t(result jsonb);
  IF p_early_commit THEN PERFORM extensions.dblink_exec('stocktake-a','COMMIT'); END IF;
  IF extensions.dblink_send_query('stocktake-b',p_b)<>1 THEN RAISE EXCEPTION 'Could not dispatch B'; END IF;
  deadline:=clock_timestamp()+interval '4 seconds';
  LOOP
    PERFORM pg_stat_clear_snapshot();
    SELECT jsonb_build_object('a_pid',a_pid,'b_pid',b_pid,'wait_event_type',wait_event_type,
      'wait_event',wait_event,'blocking_pids',pg_blocking_pids(b_pid)) INTO lock_evidence
      FROM pg_stat_activity WHERE pid=b_pid AND state='active' AND wait_event_type='Lock'
        AND a_pid=ANY(pg_blocking_pids(b_pid));
    EXIT WHEN lock_evidence IS NOT NULL;
    IF extensions.dblink_is_busy('stocktake-b')=0 OR clock_timestamp()>deadline THEN
      RAISE EXCEPTION USING ERRCODE='P9002',MESSAGE='STOCKTAKE_EXPECTED_LOCK_WAIT';
    END IF;
    -- Poll actual lock state with a deadline; delay alone never qualifies as concurrency.
    PERFORM pg_sleep(0.01);
  END LOOP;
  IF p_wait_for_timeout THEN
    -- After observing B blocked by A, retain A's uncommitted business write.
    -- The real B statement_timeout must escape dblink_get_result as 57014.
    SELECT result INTO b FROM extensions.dblink_get_result('stocktake-b') AS t(result jsonb);
    RAISE EXCEPTION 'Timeout control unexpectedly returned a result: %',b;
  END IF;
  PERFORM extensions.dblink_exec('stocktake-a','COMMIT');
  SELECT result INTO STRICT b FROM extensions.dblink_get_result('stocktake-b') AS t(result jsonb);
  PERFORM * FROM extensions.dblink_get_result('stocktake-b') AS t(result jsonb);
  PERFORM extensions.dblink_exec('stocktake-b','COMMIT');
  PERFORM extensions.dblink_disconnect('stocktake-a');
  PERFORM extensions.dblink_disconnect('stocktake-b');
  RETURN jsonb_build_object('a',a,'b',b,'lock',lock_evidence);
EXCEPTION WHEN query_canceled OR OTHERS THEN
  -- Disconnect rolls back every still-open remote transaction, including B on
  -- the negative path. Re-raise the original error; never convert it to success.
  IF 'stocktake-a'=ANY(COALESCE(extensions.dblink_get_connections(),ARRAY[]::text[])) THEN
    PERFORM extensions.dblink_disconnect('stocktake-a');
  END IF;
  IF 'stocktake-b'=ANY(COALESCE(extensions.dblink_get_connections(),ARRAY[]::text[])) THEN
    PERFORM extensions.dblink_cancel_query('stocktake-b');
    PERFORM extensions.dblink_disconnect('stocktake-b');
  END IF;
  RAISE;
END;
$$;

CREATE FUNCTION public.stage_d2_race_call(p_kind text,p_id uuid) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE f public.stage_d2_fixture%ROWTYPE;
BEGIN
  SELECT * INTO STRICT f FROM public.stage_d2_fixture;
  IF p_kind='stocktake' THEN RETURN public.stage_d2_command(p_id,'complete',4); END IF;
  PERFORM set_config('request.jwt.claim.role','service_role',true);
  RETURN public.command_warehouse_transfer_order(p_id,f.tenant_id,'complete',2,'{}',f.actor_user_id,f.actor_employee_id,p_id||':complete');
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM='WAREHOUSE_STOCKTAKE_SNAPSHOT_CONFLICT' THEN RETURN jsonb_build_object('error',SQLERRM); END IF;
  RAISE;
END;
$$;
CREATE FUNCTION public.stage_d2_transfer_prepare(p_source uuid,p_destination uuid) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE f public.stage_d2_fixture%ROWTYPE; v_id uuid:=gen_random_uuid();
BEGIN
  SELECT * INTO STRICT f FROM public.stage_d2_fixture;
  PERFORM set_config('request.jwt.claim.role','service_role',true);
  PERFORM public.command_warehouse_transfer_order(v_id,f.tenant_id,'save_draft',0,
    jsonb_build_object('source_warehouse_id',p_source,'destination_warehouse_id',p_destination,'reason','Stocktake contention',
      'items',jsonb_build_array(jsonb_build_object('supplier_sku_id',f.second_sku_id,'quantity','1'))),
    f.actor_user_id,f.actor_employee_id,v_id||':save');
  PERFORM public.command_warehouse_transfer_order(v_id,f.tenant_id,'submit',1,'{}',f.actor_user_id,f.actor_employee_id,v_id||':submit');
  RETURN v_id;
END;
$$;
CREATE TABLE public.stage_d2_race_case(name text PRIMARY KEY,a_id uuid,b_id uuid,a_kind text,b_kind text,b_expected text,
  before_facts integer,before_balance jsonb);
CREATE FUNCTION public.stage_d2_race_prepare(p_name text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE f public.stage_d2_fixture%ROWTYPE; a uuid; b uuid; ak text:='stocktake'; bk text:='stocktake'; expected text:='completed';
  q text; w uuid;
BEGIN
  SELECT * INTO STRICT f FROM public.stage_d2_fixture;
  SELECT (quantity_on_hand+1)::text INTO q FROM public.inventory_balances WHERE warehouse_id=f.warehouse_id AND supplier_sku_id=f.second_sku_id;
  IF p_name='absent-created' THEN
    w:=gen_random_uuid(); INSERT INTO public.warehouses(id,tenant_id,name) VALUES(w,f.tenant_id,'Absent stocktake race');
    b:=gen_random_uuid();
    PERFORM public.stage_d2_command(b,'save_draft',0,public.stage_d2_draft(ARRAY[f.second_sku_id])||jsonb_build_object('warehouse_id',w));
    PERFORM public.stage_d2_command(b,'start',1);
    PERFORM public.stage_d2_command(b,'record_counts',2,public.stage_d2_count(f.second_sku_id,'0',NULL));
    PERFORM public.stage_d2_command(b,'submit',3);
    a:=public.stage_d2_transfer_prepare(f.warehouse_id,w); ak:='transfer'; expected:='WAREHOUSE_STOCKTAKE_SNAPSHOT_CONFLICT';
  ELSIF p_name='transfer-first' THEN
    a:=public.stage_d2_transfer_prepare(f.warehouse_id,f.destination_id); ak:='transfer';
    b:=public.stage_d2_prepare(f.second_sku_id,q); expected:='WAREHOUSE_STOCKTAKE_SNAPSHOT_CONFLICT';
  ELSE
    a:=public.stage_d2_prepare(f.second_sku_id,q);
    IF p_name='stocktake-first' THEN b:=public.stage_d2_transfer_prepare(f.warehouse_id,f.destination_id); bk:='transfer';
    ELSIF p_name IN ('same-key','serial-negative','timeout-negative') THEN b:=a;
    ELSE b:=public.stage_d2_prepare(f.second_sku_id,q); expected:='WAREHOUSE_STOCKTAKE_SNAPSHOT_CONFLICT'; END IF;
  END IF;
  INSERT INTO public.stage_d2_race_case SELECT p_name,a,b,ak,bk,expected,
    (SELECT count(*) FROM public.inventory_transactions),
    (SELECT jsonb_agg(to_jsonb(x) ORDER BY x.id) FROM public.inventory_balances x WHERE tenant_id=f.tenant_id);
END;
$$;
CREATE FUNCTION public.stage_d2_race_run(p_name text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE c public.stage_d2_race_case%ROWTYPE; f public.stage_d2_fixture%ROWTYPE; r jsonb; a_sql text; b_sql text;
  rejected boolean:=false; wanted integer;
BEGIN
  SELECT * INTO STRICT c FROM public.stage_d2_race_case WHERE name=p_name;
  SELECT * INTO STRICT f FROM public.stage_d2_fixture;
  a_sql:=format('SELECT public.stage_d2_race_call(%L,%L)',c.a_kind,c.a_id);
  b_sql:=format('SELECT public.stage_d2_race_call(%L,%L)',c.b_kind,c.b_id);
  IF p_name IN ('serial-negative','timeout-negative') THEN
    BEGIN
      r:=public.stage_d2_schedule(a_sql,b_sql,p_name='serial-negative',p_name='timeout-negative');
    EXCEPTION WHEN SQLSTATE 'P9002' OR query_canceled THEN
      IF (p_name='serial-negative' AND SQLERRM='STOCKTAKE_EXPECTED_LOCK_WAIT')
        OR (p_name='timeout-negative' AND SQLSTATE='57014') THEN rejected:=true; ELSE RAISE; END IF;
    END;
    IF NOT rejected OR extensions.dblink_get_connections() IS NOT NULL THEN RAISE EXCEPTION 'Race negative control did not fail/clean'; END IF;
    IF p_name='timeout-negative' AND ((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.id) FROM public.inventory_balances x WHERE tenant_id=f.tenant_id)
        IS DISTINCT FROM c.before_balance OR (SELECT count(*) FROM public.inventory_transactions)<>c.before_facts
        OR (SELECT status FROM public.warehouse_stocktake_orders WHERE id=c.a_id)<>'submitted') THEN
      RAISE EXCEPTION 'Timeout leaked A uncommitted stocktake';
    END IF;
    RETURN 'EVIDENCE stocktake race control '||p_name||': exact expected error, all dblink connections closed';
  END IF;
  r:=public.stage_d2_schedule(a_sql,b_sql);
  IF r->'a'->>'status' IS DISTINCT FROM 'completed'
    OR coalesce(r->'b'->>'status',r->'b'->>'error') IS DISTINCT FROM c.b_expected THEN RAISE EXCEPTION 'Race outcome %: %',p_name,r; END IF;
  wanted:=CASE p_name WHEN 'stocktake-first' THEN 3 WHEN 'transfer-first' THEN 2 WHEN 'absent-created' THEN 2 ELSE 1 END;
  IF (SELECT count(*) FROM public.inventory_transactions)<>c.before_facts+wanted THEN RAISE EXCEPTION 'Race exact ledger count: %',p_name; END IF;
  IF p_name='same-key' AND (r->'a' IS DISTINCT FROM r->'b' OR (SELECT count(*) FROM public.warehouse_stocktake_command_events WHERE order_id=c.a_id AND command='complete')<>1) THEN
    RAISE EXCEPTION 'Concurrent same key did not return once frozen result';
  END IF;
  IF c.b_expected='WAREHOUSE_STOCKTAKE_SNAPSHOT_CONFLICT' AND ((SELECT status FROM public.warehouse_stocktake_orders WHERE id=c.b_id)<>'submitted'
    OR EXISTS(SELECT 1 FROM public.warehouse_stocktake_command_events WHERE order_id=c.b_id AND command='complete')
    OR EXISTS(SELECT 1 FROM public.warehouse_stocktake_order_items WHERE stocktake_order_id=c.b_id AND amount IS NOT NULL)) THEN
    RAISE EXCEPTION 'Losing stocktake leaked state/receipt/value';
  END IF;
  IF public.stage_d_transfer_financial_snapshot(f.tenant_id) IS DISTINCT FROM f.financial_before
    OR extensions.dblink_get_connections() IS NOT NULL THEN RAISE EXCEPTION 'Race financial/connection invariants'; END IF;
  RETURN 'EVIDENCE stocktake race '||p_name||': '||(r->'lock')::text||'; result '||c.b_expected||'; exact fact count/receipt/state/financial checks';
END;
$$;

SELECT public.stage_d2_race_prepare('serial-negative');
SELECT public.stage_d2_race_run('serial-negative');
SELECT public.stage_d2_race_prepare('timeout-negative');
SELECT public.stage_d2_race_run('timeout-negative');
SELECT public.stage_d2_race_prepare('two-outdated');
SELECT public.stage_d2_race_run('two-outdated');
SELECT public.stage_d2_race_prepare('same-key');
SELECT public.stage_d2_race_run('same-key');
SELECT public.stage_d2_race_prepare('transfer-first');
SELECT public.stage_d2_race_run('transfer-first');
SELECT public.stage_d2_race_prepare('stocktake-first');
SELECT public.stage_d2_race_run('stocktake-first');
SELECT public.stage_d2_race_prepare('absent-created');
SELECT public.stage_d2_race_run('absent-created');

-- Deliberately serial: real outbound and reverse transfer restore quantity and
-- value, but change the optimistic version, so the old stocktake must fail.
DO $$
DECLARE f public.stage_d2_fixture%ROWTYPE; s uuid; t uuid; r uuid; before_q numeric; before_v numeric; before_version integer;
BEGIN
  SELECT * INTO STRICT f FROM public.stage_d2_fixture;
  SELECT quantity_on_hand,inventory_value,version INTO before_q,before_v,before_version FROM public.inventory_balances
    WHERE warehouse_id=f.warehouse_id AND supplier_sku_id=f.second_sku_id;
  s:=public.stage_d2_prepare(f.second_sku_id,before_q::text);
  t:=public.stage_d2_transfer_prepare(f.warehouse_id,f.destination_id); PERFORM public.stage_d2_race_call('transfer',t);
  r:=public.stage_d2_transfer_prepare(f.destination_id,f.warehouse_id); PERFORM public.stage_d2_race_call('transfer',r);
  IF NOT EXISTS(SELECT 1 FROM public.inventory_balances WHERE warehouse_id=f.warehouse_id AND supplier_sku_id=f.second_sku_id
    AND quantity_on_hand=before_q AND inventory_value=before_v AND version=before_version+2) THEN RAISE EXCEPTION 'Serial restore fixture invalid'; END IF;
  PERFORM public.stage_d_transfer_expect_error(public.stage_d2_sql(s,'complete',4),'WAREHOUSE_STOCKTAKE_SNAPSHOT_CONFLICT');
  IF public.stage_d_transfer_financial_snapshot(f.tenant_id) IS DISTINCT FROM f.financial_before THEN RAISE EXCEPTION 'Serial restore finances'; END IF;
END;
$$;
SELECT 'EVIDENCE stocktake serial restored-quantity case: actual forward/reverse transfer restores quantity/value; snapshot version changed +2; completion rejected';
DO $$
DECLARE f public.stage_d2_fixture%ROWTYPE;
BEGIN
  SELECT * INTO STRICT f FROM public.stage_d2_fixture;
  IF EXISTS(SELECT 1 FROM
    (SELECT warehouse_id,supplier_sku_id,quantity_on_hand,inventory_value,average_unit_cost FROM public.inventory_balances WHERE tenant_id=f.tenant_id) b
    FULL JOIN (SELECT warehouse_id,supplier_sku_id,sum(quantity_delta) q,sum(value_delta) v FROM public.inventory_transactions
      WHERE tenant_id=f.tenant_id GROUP BY warehouse_id,supplier_sku_id) l USING(warehouse_id,supplier_sku_id)
    WHERE b.quantity_on_hand IS DISTINCT FROM l.q OR b.inventory_value IS DISTINCT FROM l.v
      OR b.average_unit_cost IS DISTINCT FROM CASE WHEN l.q=0 THEN 0 ELSE round(l.v/l.q,4) END) THEN
    RAISE EXCEPTION 'Final full ledger/balance/average reconciliation failed';
  END IF;
  IF extensions.dblink_get_connections() IS NOT NULL OR public.stage_d_transfer_financial_snapshot(f.tenant_id) IS DISTINCT FROM f.financial_before THEN
    RAISE EXCEPTION 'Final race connection/financial invariant';
  END IF;
END;
$$;
SELECT 'EVIDENCE stocktake final: FULL JOIN all tenant ledger/balance/average reconciled, all connections closed, full financial snapshot unchanged';
