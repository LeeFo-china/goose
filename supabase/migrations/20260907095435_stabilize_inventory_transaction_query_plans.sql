-- Optional warehouse/SKU/type filters have strongly different selectivity.
-- After expensive broad-page reads, auto can retain a generic plan that scans
-- an entire tenant for a selective SKU. Replan only this read-only function;
-- preserve the SQL body, signature, ACL, search_path and caller configuration.
-- Tradeoff: each call incurs planning CPU. No global/session default changes.
-- Rollback, if needed, via a NEW migration: ALTER FUNCTION ... RESET plan_cache_mode.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='1min';

DO $inventory_query_plan_guard$
DECLARE
  target regprocedure:='public.list_inventory_transactions(uuid,uuid,uuid,text,integer,integer)'::regprocedure;
BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid=target)<>'413a01db2e001a7696c9d0c947b45ebd'
    OR (SELECT proconfig FROM pg_proc WHERE oid=target) IS DISTINCT FROM ARRAY['search_path=pg_catalog, public']::text[] THEN
    RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='INVENTORY_QUERY_PLAN_SOURCE_MISMATCH';
  END IF;
END;
$inventory_query_plan_guard$;

ALTER FUNCTION public.list_inventory_transactions(uuid,uuid,uuid,text,integer,integer)
SET plan_cache_mode='force_custom_plan';

NOTIFY pgrst,'reload schema';
COMMIT;
