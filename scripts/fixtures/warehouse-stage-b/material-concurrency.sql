-- Real independent PostgreSQL transactions; run after material-workflow.sql.
CREATE EXTENSION IF NOT EXISTS dblink WITH SCHEMA extensions;
CREATE TABLE public.stage_c_material_race(ordinal integer PRIMARY KEY,issue_id uuid,return_id uuid);
CREATE FUNCTION public.stage_c_material_race_complete(p_id uuid,p_type text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE f public.stage_c_material_fixture%ROWTYPE;
BEGIN
  SELECT * INTO STRICT f FROM public.stage_c_material_fixture;
  PERFORM set_config('request.jwt.claim.role','service_role',true);
  RETURN public.command_warehouse_material_order(p_id,f.tenant_id,p_type,'complete',CASE p_type WHEN 'issue' THEN 2 ELSE 1 END,
    '{}',f.actor_user_id,f.actor_employee_id,'race-complete-'||p_id);
EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('error',SQLERRM);
END;
$$;
BEGIN;
DO $setup$
DECLARE f public.stage_c_material_fixture%ROWTYPE; issue_id uuid; ordinal integer; payload jsonb;
BEGIN
  SELECT * INTO STRICT f FROM public.stage_c_material_fixture;
  PERFORM set_config('request.jwt.claim.role','service_role',true);
  payload:=jsonb_build_object('warehouse_id',f.warehouse_id,'project_id',f.project_id,
    'items',jsonb_build_array(jsonb_build_object('supplier_sku_id',f.sku_id,'quantity','0.3')));
  FOR ordinal IN 1..2 LOOP
    issue_id:=gen_random_uuid();
    PERFORM public.command_warehouse_material_order(issue_id,f.tenant_id,'issue','save_draft',0,payload,f.actor_user_id,f.actor_employee_id,'race-save-'||ordinal);
    PERFORM public.command_warehouse_material_order(issue_id,f.tenant_id,'issue','submit',1,'{}',f.actor_user_id,f.actor_employee_id,'race-submit-'||ordinal);
    INSERT INTO public.stage_c_material_race VALUES(ordinal,issue_id,gen_random_uuid());
  END LOOP;
END;
$setup$;
COMMIT;
DO $race$
DECLARE a public.stage_c_material_race%ROWTYPE; b public.stage_c_material_race%ROWTYPE;
  result_a jsonb; result_b jsonb; deadline timestamptz;
BEGIN
  SELECT * INTO STRICT a FROM public.stage_c_material_race WHERE ordinal=1;
  SELECT * INTO STRICT b FROM public.stage_c_material_race WHERE ordinal=2;
  PERFORM extensions.dblink_connect('material-a','host=/tmp dbname=postgres user=postgres application_name=material-a');
  PERFORM extensions.dblink_connect('material-b','host=/tmp dbname=postgres user=postgres application_name=material-b');
  PERFORM extensions.dblink_exec('material-a','SET statement_timeout=''8s''');
  PERFORM extensions.dblink_exec('material-b','SET statement_timeout=''8s''');
  PERFORM extensions.dblink_exec('material-a','BEGIN');
  SELECT payload INTO result_a FROM extensions.dblink('material-a',format('SELECT public.stage_c_material_race_complete(%L,''issue'')',a.issue_id)) AS result(payload jsonb);
  PERFORM extensions.dblink_send_query('material-b',format('SELECT public.stage_c_material_race_complete(%L,''issue'')',b.issue_id));
  deadline:=clock_timestamp()+interval '4 seconds';
  LOOP
    PERFORM pg_stat_clear_snapshot();
    EXIT WHEN EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='material-b' AND wait_event_type='Lock');
    IF clock_timestamp()>deadline THEN RAISE EXCEPTION 'Second issue did not wait for transaction lock'; END IF;
    PERFORM pg_sleep(0.01);
  END LOOP;
  PERFORM extensions.dblink_exec('material-a','COMMIT');
  SELECT payload INTO result_b FROM extensions.dblink_get_result('material-b') AS result(payload jsonb);
  PERFORM * FROM extensions.dblink_get_result('material-b') AS result(payload jsonb);
  IF result_a->>'status' IS DISTINCT FROM 'completed' OR result_b->>'error' IS DISTINCT FROM 'WAREHOUSE_MATERIAL_INSUFFICIENT_STOCK' THEN
    RAISE EXCEPTION 'Concurrent overissue failed: % / %',result_a,result_b;
  END IF;
END;
$race$;
BEGIN;
DO $setup_returns$
DECLARE f public.stage_c_material_fixture%ROWTYPE; issue_id uuid; item_id uuid; row_record record; payload jsonb;
BEGIN
  SELECT * INTO STRICT f FROM public.stage_c_material_fixture;
  PERFORM set_config('request.jwt.claim.role','service_role',true);
  SELECT r.issue_id INTO STRICT issue_id FROM public.stage_c_material_race r WHERE ordinal=1;
  SELECT id INTO STRICT item_id FROM public.warehouse_issue_order_items WHERE issue_order_id=issue_id;
  payload:=jsonb_build_object('original_issue_order_id',issue_id,
    'items',jsonb_build_array(jsonb_build_object('original_issue_item_id',item_id,'quantity','0.3')));
  FOR row_record IN SELECT * FROM public.stage_c_material_race ORDER BY ordinal LOOP
    PERFORM public.command_warehouse_material_order(row_record.return_id,f.tenant_id,'return','save_draft',0,payload,
      f.actor_user_id,f.actor_employee_id,'race-return-save-'||row_record.ordinal);
  END LOOP;
END;
$setup_returns$;
COMMIT;
DO $race$
DECLARE f public.stage_c_material_fixture%ROWTYPE; a public.stage_c_material_race%ROWTYPE; b public.stage_c_material_race%ROWTYPE;
  result_a jsonb; result_b jsonb; deadline timestamptz;
BEGIN
  SELECT * INTO STRICT f FROM public.stage_c_material_fixture;
  SELECT * INTO STRICT a FROM public.stage_c_material_race WHERE ordinal=1;
  SELECT * INTO STRICT b FROM public.stage_c_material_race WHERE ordinal=2;
  PERFORM extensions.dblink_exec('material-a','BEGIN');
  SELECT payload INTO result_a FROM extensions.dblink('material-a',format('SELECT public.stage_c_material_race_complete(%L,''return'')',a.return_id)) AS result(payload jsonb);
  PERFORM extensions.dblink_send_query('material-b',format('SELECT public.stage_c_material_race_complete(%L,''return'')',b.return_id));
  deadline:=clock_timestamp()+interval '4 seconds';
  LOOP
    PERFORM pg_stat_clear_snapshot();
    EXIT WHEN EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='material-b' AND wait_event_type='Lock');
    IF clock_timestamp()>deadline THEN RAISE EXCEPTION 'Second return did not wait for transaction lock'; END IF;
    PERFORM pg_sleep(0.01);
  END LOOP;
  PERFORM extensions.dblink_exec('material-a','COMMIT');
  SELECT payload INTO result_b FROM extensions.dblink_get_result('material-b') AS result(payload jsonb);
  PERFORM * FROM extensions.dblink_get_result('material-b') AS result(payload jsonb);
  PERFORM extensions.dblink_disconnect('material-a');
  PERFORM extensions.dblink_disconnect('material-b');
  IF result_a->>'status' IS DISTINCT FROM 'completed' OR result_b->>'error' IS DISTINCT FROM 'WAREHOUSE_MATERIAL_RETURN_QUANTITY_EXCEEDED' THEN
    RAISE EXCEPTION 'Concurrent overreturn failed: % / %',result_a,result_b;
  END IF;
  IF (SELECT inventory_value FROM public.inventory_balances WHERE tenant_id=f.tenant_id AND warehouse_id=f.warehouse_id AND supplier_sku_id=f.sku_id)<>0.02
    OR (SELECT quantity_on_hand FROM public.inventory_balances WHERE tenant_id=f.tenant_id AND warehouse_id=f.warehouse_id AND supplier_sku_id=f.sku_id)<>0.3
    OR (SELECT status FROM public.warehouse_issue_orders WHERE id=b.issue_id)<>'submitted'
    OR (SELECT status FROM public.warehouse_return_orders WHERE id=b.return_id)<>'draft'
    OR EXISTS(SELECT 1 FROM public.warehouse_material_command_events WHERE actor_user_id=f.actor_user_id
      AND idempotency_key IN ('race-complete-'||b.issue_id,'race-complete-'||b.return_id)) THEN
    RAISE EXCEPTION 'Concurrent loser changed stock, state or command receipt';
  END IF;
END;
$race$;
SELECT 'EVIDENCE material concurrency: independent connections waited on lock; exactly one issue and one return succeeded; losers left no facts and stock remained 0.3 / 0.02';
