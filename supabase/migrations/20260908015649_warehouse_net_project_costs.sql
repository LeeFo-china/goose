-- Forward-only: retain immutable cost facts. Disable warehouse materials before
-- an application rollback; never restore unsigned sums while return facts exist.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

DO $patch$
DECLARE
  v_name text;
  v_definition text;
  v_count integer;
  v_expected integer;
  v_old text;
  v_new text;
  v_signed text := $expr$(CASE WHEN cost_event.event_direction = 'decrease'
    THEN -cost_event.amount ELSE cost_event.amount END)$expr$;
BEGIN
  FOREACH v_name IN ARRAY ARRAY[
    'search_finance_project_risk_ids',
    '__gooes_submit_supplier_purchase_batch_destinations_v2',
    '__gooes_review_supplier_purchase_batch_destinations_v2',
    '__gooes_supplier_purchase_batch_budget_preflight'
  ] LOOP
    SELECT count(*), min(pg_get_functiondef(p.oid)) INTO v_count, v_definition
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = v_name AND p.prokind = 'f';
    IF v_count <> 1 OR position('public.project_cost_events' IN v_definition) = 0 THEN
      RAISE EXCEPTION 'WAREHOUSE_COST_AGGREGATE_SOURCE_MISMATCH: %', v_name;
    END IF;

    IF v_name = '__gooes_submit_supplier_purchase_batch_destinations_v2' THEN
      v_old := 'SELECT cost_event.cost_category_id, cost_event.amount';
      v_new := 'SELECT cost_event.cost_category_id, ' || v_signed || ' AS amount';
      v_expected := 1;
    ELSE
      v_old := 'cost_event.amount';
      v_new := v_signed;
      v_expected := CASE WHEN v_name = 'search_finance_project_risk_ids' THEN 2 ELSE 1 END;
    END IF;
    v_count := (length(v_definition) - length(replace(v_definition, v_old, ''))) / length(v_old);
    IF v_count <> v_expected OR position('cost_event.event_direction' IN v_definition) > 0 THEN
      RAISE EXCEPTION 'WAREHOUSE_COST_AGGREGATE_SOURCE_MISMATCH: % (% matches)', v_name, v_count;
    END IF;
    -- CREATE OR REPLACE from the effective definition preserves all earlier
    -- authorization/locking corrections, signatures, security settings and ACLs.
    EXECUTE replace(v_definition, v_old, v_new);
  END LOOP;
END;
$patch$;

COMMIT;
