-- ONLY the schema-only disposable runner with synthetic fixtures may execute this.
DO $$ BEGIN
  IF to_regclass('public.supplier_sku_cleanup_isolated_marker') IS NULL THEN
    RAISE EXCEPTION 'ISOLATED_SKU_CLEANUP_MARKER_REQUIRED';
  END IF;
END $$;
SET timezone='UTC';
CREATE TEMP TABLE repair_full_schema_rows(snapshot jsonb NOT NULL);
INSERT INTO repair_full_schema_rows VALUES
('{"id":"c040be4b-61a8-4966-9d7e-27e42fa942aa","name":"公司仓库","status":"active","address":null,"version":1,"tenant_id":"992b842f-231b-46bb-b494-9b0f5cd5c192","created_at":"2026-09-05T15:49:05.07165+00:00","is_default":true,"updated_at":"2026-09-05T15:49:05.07165+00:00","contact_name":null,"contact_phone":null,"warehouse_code":"WH-000004","manager_employee_id":null,"created_by_employee_id":"db285789-726e-45e6-8fb4-cd878b467a1c","updated_by_employee_id":"db285789-726e-45e6-8fb4-cd878b467a1c"}'::jsonb),
('{"id":"1ae564fe-915a-40b7-9245-133d80c60961","name":"公司仓库","status":"active","address":null,"version":1,"tenant_id":"1116dec1-9c13-46a8-940b-48465e1db6e2","created_at":"2026-09-05T17:20:20.669002+00:00","is_default":true,"updated_at":"2026-09-05T17:20:20.669002+00:00","contact_name":null,"contact_phone":null,"warehouse_code":"WH-000024","manager_employee_id":null,"created_by_employee_id":"26bafdfb-4133-484a-b9e1-8c7beb59c638","updated_by_employee_id":"26bafdfb-4133-484a-b9e1-8c7beb59c638"}'::jsonb),
('{"id":"402b619f-d22f-4fbc-ae18-6bd84a54333d","name":"公司仓库","status":"active","address":null,"version":1,"tenant_id":"c7264018-d4fb-410a-b342-3ffa755a6523","created_at":"2026-09-05T17:40:08.719184+00:00","is_default":true,"updated_at":"2026-09-05T17:40:08.719184+00:00","contact_name":null,"contact_phone":null,"warehouse_code":"WH-000026","manager_employee_id":null,"created_by_employee_id":"cedc1fc7-d3c0-41a7-8221-4dd5a21b7035","updated_by_employee_id":"cedc1fc7-d3c0-41a7-8221-4dd5a21b7035"}'::jsonb),
('{"id":"f1ba1d8a-b0db-42f2-a87e-8bcbd9e2601a","name":"公司仓库","status":"active","address":null,"version":1,"tenant_id":"77ba4a82-2cf8-452f-93d4-79e41dcc4340","created_at":"2026-09-06T01:27:26.723396+00:00","is_default":true,"updated_at":"2026-09-06T01:27:26.723396+00:00","contact_name":null,"contact_phone":null,"warehouse_code":"WH-000032","manager_employee_id":null,"created_by_employee_id":"a9176c33-99d3-458c-9bc4-93fe54e19982","updated_by_employee_id":"a9176c33-99d3-458c-9bc4-93fe54e19982"}'::jsonb);
CREATE TEMP TABLE repair_full_schema_baseline AS
SELECT (SELECT jsonb_agg(to_jsonb(w) ORDER BY id) FROM public.warehouses w) AS warehouses,
  (SELECT count(*) FROM public.platform_audit_logs) AS audit_count;
CREATE TEMP TABLE repair_full_schema_dependencies(relation regclass,rows bigint);
DO $snapshot$
DECLARE dependency record; count_before bigint;
BEGIN
  IF EXISTS(SELECT 1 FROM public.warehouses w JOIN repair_full_schema_rows r
    ON w.id=(r.snapshot->>'id')::uuid)
    OR EXISTS(SELECT 1 FROM public.tenants t JOIN repair_full_schema_rows r
    ON t.id=(r.snapshot->>'tenant_id')::uuid) THEN
    RAISE EXCEPTION 'FULL_SCHEMA_TEST_TARGET_COLLISION';
  END IF;
  FOR dependency IN SELECT conrelid::regclass AS relation FROM pg_constraint
    WHERE contype='f' AND confrelid='public.warehouses'::regclass LOOP
    EXECUTE format('SELECT count(*) FROM %s',dependency.relation) INTO count_before;
    INSERT INTO repair_full_schema_dependencies VALUES(dependency.relation,count_before);
  END LOOP;
  IF (SELECT count(*) FROM repair_full_schema_dependencies)<>9
    OR (SELECT sum(rows) FROM repair_full_schema_dependencies)=0 THEN
    RAISE EXCEPTION 'FULL_SCHEMA_TEST_REQUIRES_NINE_TABLES_AND_PRESERVED_FACTS';
  END IF;
END;
$snapshot$;
BEGIN;
SET LOCAL session_replication_role=replica;
INSERT INTO public.warehouses SELECT
  (jsonb_populate_record(NULL::public.warehouses,snapshot)).*
  FROM repair_full_schema_rows;
COMMIT;

-- __FULL_REPAIR_MIGRATION__

DO $verify$
DECLARE baseline record; dependency record; count_after bigint;
BEGIN
  SELECT * INTO STRICT baseline FROM repair_full_schema_baseline;
  IF baseline.warehouses IS DISTINCT FROM
    (SELECT jsonb_agg(to_jsonb(w) ORDER BY id) FROM public.warehouses w)
    OR (SELECT count(*) FROM public.platform_audit_logs)<>baseline.audit_count+4 THEN
    RAISE EXCEPTION 'FULL_SCHEMA_REPAIR_CHANGED_UNREVIEWED_ROWS';
  END IF;
  IF (SELECT count(*) FROM public.platform_audit_logs a JOIN repair_full_schema_rows r
    ON a.metadata->'before'=r.snapshot
    WHERE a.action='warehouse_orphan_remediation'
      AND a.metadata->>'before_md5'=md5(r.snapshot::text)
      AND a.metadata->>'repair_key'='warehouse-orphan-20260908')<>4 THEN
    RAISE EXCEPTION 'FULL_SCHEMA_REPAIR_ARCHIVE_MISMATCH';
  END IF;
  FOR dependency IN SELECT * FROM repair_full_schema_dependencies LOOP
    EXECUTE format('SELECT count(*) FROM %s',dependency.relation) INTO count_after;
    IF dependency.rows<>count_after THEN RAISE EXCEPTION 'FULL_SCHEMA_FACTS_CHANGED'; END IF;
  END LOOP;
  ALTER TABLE public.warehouses ADD CONSTRAINT full_schema_restore_employee_probe
    FOREIGN KEY(created_by_employee_id,tenant_id) REFERENCES public.employees(id,tenant_id);
  ALTER TABLE public.warehouses DROP CONSTRAINT full_schema_restore_employee_probe;
END;
$verify$;
SELECT 'PASS full-schema exact migration: four audit/deletes, other warehouses and nonempty facts unchanged' AS result;

