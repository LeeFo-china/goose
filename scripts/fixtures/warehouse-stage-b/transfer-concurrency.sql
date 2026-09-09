-- Real independent transactions on the disposable database, never serial mocks.
CREATE EXTENSION IF NOT EXISTS dblink WITH SCHEMA extensions;
CREATE TABLE public.stage_d_transfer_race(name text PRIMARY KEY,order_id uuid NOT NULL);
CREATE FUNCTION public.stage_d_transfer_prepare(p_reverse boolean,p_quantity text) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE f public.stage_d_transfer_fixture%ROWTYPE; v_id uuid:=gen_random_uuid();
BEGIN
  SELECT * INTO STRICT f FROM public.stage_d_transfer_fixture;
  PERFORM public.stage_d_transfer_command(v_id,'save_draft',0,jsonb_build_object(
    'source_warehouse_id',CASE WHEN p_reverse THEN f.destination_warehouse_id ELSE f.source_warehouse_id END,
    'destination_warehouse_id',CASE WHEN p_reverse THEN f.source_warehouse_id ELSE f.destination_warehouse_id END,'reason','Concurrent transfer',
    'items',jsonb_build_array(jsonb_build_object('supplier_sku_id',f.sku_id,'quantity',p_quantity))),'race-save-'||v_id);
  PERFORM public.stage_d_transfer_command(v_id,'submit',1,'{}','race-submit-'||v_id);
  RETURN v_id;
END;
$$;
CREATE FUNCTION public.stage_d_race_complete(p_id uuid,p_material boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE f public.stage_c_material_fixture%ROWTYPE;
BEGIN
  IF NOT p_material THEN RETURN public.stage_d_transfer_command(p_id,'complete',2,'{}','race-complete-'||p_id); END IF;
  SELECT * INTO STRICT f FROM public.stage_c_material_fixture;
  PERFORM set_config('request.jwt.claim.role','service_role',true);
  RETURN public.command_warehouse_material_order(p_id,f.tenant_id,'issue','complete',2,'{}',f.actor_user_id,f.actor_employee_id,'race-material-'||p_id);
EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('error',SQLERRM);
END;
$$;
CREATE FUNCTION public.stage_d_run_race(p_a uuid,p_b uuid,p_a_material boolean DEFAULT false,p_b_material boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE a jsonb; b jsonb; deadline timestamptz;
BEGIN
  PERFORM extensions.dblink_connect('transfer-a','host=/tmp dbname=postgres user=postgres application_name=transfer-a');
  PERFORM extensions.dblink_connect('transfer-b','host=/tmp dbname=postgres user=postgres application_name=transfer-b');
  PERFORM extensions.dblink_exec('transfer-a','SET statement_timeout=''8s''');
  PERFORM extensions.dblink_exec('transfer-b','SET statement_timeout=''8s''');
  PERFORM extensions.dblink_exec('transfer-a','BEGIN');
  SELECT result INTO a FROM extensions.dblink('transfer-a',format('SELECT public.stage_d_race_complete(%L,%L)',p_a,p_a_material)) AS t(result jsonb);
  PERFORM extensions.dblink_send_query('transfer-b',format('SELECT public.stage_d_race_complete(%L,%L)',p_b,p_b_material));
  deadline:=clock_timestamp()+interval '4 seconds';
  LOOP
    PERFORM pg_stat_clear_snapshot();
    EXIT WHEN EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='transfer-b' AND wait_event_type='Lock');
    IF clock_timestamp()>deadline THEN RAISE EXCEPTION 'Concurrent B never waited on transaction lock'; END IF;
    PERFORM pg_sleep(0.01);
  END LOOP;
  PERFORM extensions.dblink_exec('transfer-a','COMMIT');
  SELECT result INTO b FROM extensions.dblink_get_result('transfer-b') AS t(result jsonb);
  PERFORM * FROM extensions.dblink_get_result('transfer-b') AS t(result jsonb);
  PERFORM extensions.dblink_disconnect('transfer-a');
  PERFORM extensions.dblink_disconnect('transfer-b');
  RETURN jsonb_build_object('a',a,'b',b);
END;
$$;
INSERT INTO public.stage_d_transfer_race VALUES('over-a',public.stage_d_transfer_prepare(false,'0.3')),('over-b',public.stage_d_transfer_prepare(false,'0.3'));
DO $$
DECLARE r jsonb; loser uuid;
BEGIN
  SELECT order_id INTO STRICT loser FROM public.stage_d_transfer_race WHERE name='over-b';
  r:=public.stage_d_run_race((SELECT order_id FROM public.stage_d_transfer_race WHERE name='over-a'),loser);
  IF r->'a'->>'status' IS DISTINCT FROM 'completed' OR r->'b'->>'error' IS DISTINCT FROM 'WAREHOUSE_TRANSFER_INSUFFICIENT_STOCK'
    OR (SELECT status FROM public.warehouse_transfer_orders WHERE id=loser)<>'submitted'
    OR EXISTS(SELECT 1 FROM public.warehouse_transfer_command_events WHERE order_id=loser AND command='complete')
    OR EXISTS(SELECT 1 FROM public.warehouse_transfer_order_items WHERE transfer_order_id=loser AND amount IS NOT NULL)
    OR EXISTS(SELECT 1 FROM public.inventory_transactions t JOIN public.warehouse_transfer_order_items i ON i.id=t.source_id WHERE i.transfer_order_id=loser) THEN
    RAISE EXCEPTION 'Concurrent oversubscription leaked facts or wrong outcome: %',r;
  END IF;
END;
$$;
-- A returns 0.1 to the empty original source while B concurrently sends it out.
INSERT INTO public.stage_d_transfer_race VALUES('reverse',public.stage_d_transfer_prepare(true,'0.1')),('forward',public.stage_d_transfer_prepare(false,'0.1'));
DO $$
DECLARE r jsonb;
BEGIN
  r:=public.stage_d_run_race((SELECT order_id FROM public.stage_d_transfer_race WHERE name='reverse'),
    (SELECT order_id FROM public.stage_d_transfer_race WHERE name='forward'));
  IF r->'a'->>'status' IS DISTINCT FROM 'completed' OR r->'b'->>'status' IS DISTINCT FROM 'completed' THEN
    RAISE EXCEPTION 'Opposite directions failed/deadlocked: %',r;
  END IF;
END;
$$;
INSERT INTO public.stage_d_transfer_race VALUES('same-key',public.stage_d_transfer_prepare(true,'0.3'));
DO $$
DECLARE r jsonb; v_id uuid;
BEGIN
  SELECT order_id INTO STRICT v_id FROM public.stage_d_transfer_race WHERE name='same-key';
  r:=public.stage_d_run_race(v_id,v_id);
  IF r->'a'->>'status' IS DISTINCT FROM 'completed' OR r->'a' IS DISTINCT FROM r->'b'
    OR (SELECT count(*) FROM public.warehouse_transfer_command_events WHERE order_id=v_id AND command='complete')<>1
    OR (SELECT count(*) FROM public.inventory_transactions t JOIN public.warehouse_transfer_order_items i ON i.id=t.source_id WHERE i.transfer_order_id=v_id)<>2 THEN
    RAISE EXCEPTION 'Concurrent same-key replay duplicated/changed facts: %',r;
  END IF;
END;
$$;
-- Prepare two material contenders through the actual C save/submit commands.
DO $$
DECLARE f public.stage_c_material_fixture%ROWTYPE; v_id uuid; n integer;
BEGIN
  SELECT * INTO STRICT f FROM public.stage_c_material_fixture;
  PERFORM set_config('request.jwt.claim.role','service_role',true);
  FOR n IN 1..2 LOOP
    v_id:=gen_random_uuid();
    PERFORM public.command_warehouse_material_order(v_id,f.tenant_id,'issue','save_draft',0,jsonb_build_object(
      'warehouse_id',f.warehouse_id,'project_id',f.project_id,'items',jsonb_build_array(jsonb_build_object('supplier_sku_id',f.sku_id,'quantity','0.2'))),
      f.actor_user_id,f.actor_employee_id,'cross-save-'||v_id);
    PERFORM public.command_warehouse_material_order(v_id,f.tenant_id,'issue','submit',1,'{}',f.actor_user_id,f.actor_employee_id,'cross-submit-'||v_id);
    INSERT INTO public.stage_d_transfer_race VALUES('material-'||n,v_id);
  END LOOP;
END;
$$;
INSERT INTO public.stage_d_transfer_race VALUES('cross-transfer-1',public.stage_d_transfer_prepare(false,'0.2'));
DO $$
DECLARE r jsonb; v_id uuid; f public.stage_d_transfer_fixture%ROWTYPE;
BEGIN
  SELECT * INTO STRICT f FROM public.stage_d_transfer_fixture;
  SELECT order_id INTO STRICT v_id FROM public.stage_d_transfer_race WHERE name='material-1';
  r:=public.stage_d_run_race((SELECT order_id FROM public.stage_d_transfer_race WHERE name='cross-transfer-1'),v_id,false,true);
  IF r->'a'->>'status' IS DISTINCT FROM 'completed' OR r->'b'->>'error' IS DISTINCT FROM 'WAREHOUSE_MATERIAL_INSUFFICIENT_STOCK'
    OR EXISTS(SELECT 1 FROM public.warehouse_material_command_events WHERE order_id=v_id AND command='complete')
    OR EXISTS(SELECT 1 FROM public.project_cost_events WHERE warehouse_issue_item_id IN (SELECT id FROM public.warehouse_issue_order_items WHERE issue_order_id=v_id)) THEN
    RAISE EXCEPTION 'Transfer vs material issue failed: %',r;
  END IF;
  v_id:=public.stage_d_transfer_prepare(true,'0.2');
  PERFORM public.stage_d_transfer_command(v_id,'complete',2,'{}','race-complete-'||v_id);
  IF public.stage_d_transfer_financial_snapshot(f.tenant_id) IS DISTINCT FROM f.financial_before THEN
    RAISE EXCEPTION 'Transfer races changed financial facts';
  END IF;
END;
$$;
INSERT INTO public.stage_d_transfer_race VALUES('cross-transfer-2',public.stage_d_transfer_prepare(false,'0.2'));
DO $$
DECLARE r jsonb; v_issue uuid; v_transfer uuid; v_return uuid:=gen_random_uuid(); f public.stage_c_material_fixture%ROWTYPE;
BEGIN
  SELECT * INTO STRICT f FROM public.stage_c_material_fixture;
  SELECT order_id INTO STRICT v_issue FROM public.stage_d_transfer_race WHERE name='material-2';
  SELECT order_id INTO STRICT v_transfer FROM public.stage_d_transfer_race WHERE name='cross-transfer-2';
  r:=public.stage_d_run_race(v_issue,v_transfer,true,false);
  IF r->'a'->>'status' IS DISTINCT FROM 'completed' OR r->'b'->>'error' IS DISTINCT FROM 'WAREHOUSE_TRANSFER_INSUFFICIENT_STOCK'
    OR EXISTS(SELECT 1 FROM public.warehouse_transfer_command_events WHERE order_id=v_transfer AND command='complete')
    OR EXISTS(SELECT 1 FROM public.inventory_transactions t JOIN public.warehouse_transfer_order_items i ON i.id=t.source_id WHERE i.transfer_order_id=v_transfer) THEN
    RAISE EXCEPTION 'Material issue vs transfer failed: %',r;
  END IF;
  -- Only this winning MATERIAL operation legitimately creates project costs;
  -- return it through the real C command and assert the two new facts net to 0.
  PERFORM set_config('request.jwt.claim.role','service_role',true);
  PERFORM public.command_warehouse_material_order(v_return,f.tenant_id,'return','save_draft',0,jsonb_build_object('original_issue_order_id',v_issue,
    'items',jsonb_build_array(jsonb_build_object('original_issue_item_id',(SELECT id FROM public.warehouse_issue_order_items WHERE issue_order_id=v_issue),'quantity','0.2'))),
    f.actor_user_id,f.actor_employee_id,'cross-return-save');
  PERFORM public.command_warehouse_material_order(v_return,f.tenant_id,'return','complete',1,'{}',f.actor_user_id,f.actor_employee_id,'cross-return-complete');
  IF (SELECT quantity_on_hand<>0.3 OR inventory_value<>0.02 FROM public.inventory_balances
      WHERE tenant_id=f.tenant_id AND warehouse_id=f.warehouse_id AND supplier_sku_id=f.sku_id)
    OR (SELECT sum(CASE WHEN event_direction='increase' THEN amount ELSE -amount END) FROM public.project_cost_events WHERE tenant_id=f.tenant_id)<>0
    OR (SELECT count(*) FROM public.project_cost_events WHERE tenant_id=f.tenant_id)<>6
    OR EXISTS(SELECT 1 FROM public.supplier_payable_events WHERE tenant_id=f.tenant_id)
    OR EXISTS(SELECT 1 FROM public.supplier_payments WHERE tenant_id=f.tenant_id) THEN
    RAISE EXCEPTION 'Cross-command restore or financial boundary failed';
  END IF;
  IF EXISTS(SELECT 1 FROM public.inventory_balances b JOIN(SELECT warehouse_id,supplier_sku_id,sum(quantity_delta) q,sum(value_delta) v
    FROM public.inventory_transactions WHERE tenant_id=f.tenant_id GROUP BY warehouse_id,supplier_sku_id) x USING(warehouse_id,supplier_sku_id)
    WHERE b.tenant_id=f.tenant_id AND (b.quantity_on_hand<>x.q OR b.inventory_value<>x.v)) THEN
    RAISE EXCEPTION 'Concurrent ledger/balance mismatch';
  END IF;
END;
$$;
SELECT 'EVIDENCE transfer concurrency: 5 independent connection races observed Lock waits; oversubscription single winner; bidirectional no deadlock; same-key exact replay; transfer/material compete in both directions; restored 0.3 / 0.02';
