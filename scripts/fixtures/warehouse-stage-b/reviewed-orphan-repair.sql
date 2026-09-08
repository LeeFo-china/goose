-- Isolated synthetic/minimal-schema regression only. The runner injects the
-- unchanged migration DO body into pg_temp.apply_reviewed_repair below.
-- Never run against application databases.
DO $$ BEGIN
  IF current_database() <> 'orphan_repair_test' THEN
    RAISE EXCEPTION 'ISOLATED_ORPHAN_REPAIR_DATABASE_REQUIRED';
  END IF;
END $$;

CREATE TEMP TABLE reviewed_warehouse_rows (snapshot jsonb NOT NULL);
INSERT INTO reviewed_warehouse_rows VALUES
('{"id":"c040be4b-61a8-4966-9d7e-27e42fa942aa","name":"公司仓库","status":"active","address":null,"version":1,"tenant_id":"992b842f-231b-46bb-b494-9b0f5cd5c192","created_at":"2026-09-05T15:49:05.07165+00:00","is_default":true,"updated_at":"2026-09-05T15:49:05.07165+00:00","contact_name":null,"contact_phone":null,"warehouse_code":"WH-000004","manager_employee_id":null,"created_by_employee_id":"db285789-726e-45e6-8fb4-cd878b467a1c","updated_by_employee_id":"db285789-726e-45e6-8fb4-cd878b467a1c"}'::jsonb),
('{"id":"1ae564fe-915a-40b7-9245-133d80c60961","name":"公司仓库","status":"active","address":null,"version":1,"tenant_id":"1116dec1-9c13-46a8-940b-48465e1db6e2","created_at":"2026-09-05T17:20:20.669002+00:00","is_default":true,"updated_at":"2026-09-05T17:20:20.669002+00:00","contact_name":null,"contact_phone":null,"warehouse_code":"WH-000024","manager_employee_id":null,"created_by_employee_id":"26bafdfb-4133-484a-b9e1-8c7beb59c638","updated_by_employee_id":"26bafdfb-4133-484a-b9e1-8c7beb59c638"}'::jsonb),
('{"id":"402b619f-d22f-4fbc-ae18-6bd84a54333d","name":"公司仓库","status":"active","address":null,"version":1,"tenant_id":"c7264018-d4fb-410a-b342-3ffa755a6523","created_at":"2026-09-05T17:40:08.719184+00:00","is_default":true,"updated_at":"2026-09-05T17:40:08.719184+00:00","contact_name":null,"contact_phone":null,"warehouse_code":"WH-000026","manager_employee_id":null,"created_by_employee_id":"cedc1fc7-d3c0-41a7-8221-4dd5a21b7035","updated_by_employee_id":"cedc1fc7-d3c0-41a7-8221-4dd5a21b7035"}'::jsonb),
('{"id":"f1ba1d8a-b0db-42f2-a87e-8bcbd9e2601a","name":"公司仓库","status":"active","address":null,"version":1,"tenant_id":"77ba4a82-2cf8-452f-93d4-79e41dcc4340","created_at":"2026-09-06T01:27:26.723396+00:00","is_default":true,"updated_at":"2026-09-06T01:27:26.723396+00:00","contact_name":null,"contact_phone":null,"warehouse_code":"WH-000032","manager_employee_id":null,"created_by_employee_id":"a9176c33-99d3-458c-9bc4-93fe54e19982","updated_by_employee_id":"a9176c33-99d3-458c-9bc4-93fe54e19982"}'::jsonb);

CREATE FUNCTION pg_temp.seed_reviewed_orphans() RETURNS void LANGUAGE plpgsql AS $seed$
DECLARE dependency record;
BEGIN
  TRUNCATE public.warehouses CASCADE;
  TRUNCATE public.platform_audit_logs;
  DELETE FROM public.employees;
  DELETE FROM public.tenants;
  INSERT INTO public.tenants(id) VALUES ('aaaaaaaa-0000-4000-8000-000000000001');
  INSERT INTO public.warehouses(id,tenant_id,warehouse_code,name)
  VALUES ('aaaaaaaa-0000-4000-8000-000000000002',
    'aaaaaaaa-0000-4000-8000-000000000001','WH-NORMAL','Normal warehouse');
  FOR dependency IN SELECT conrelid::regclass AS relation FROM pg_constraint
    WHERE contype='f' AND confrelid='public.warehouses'::regclass LOOP
    EXECUTE format('INSERT INTO %s(warehouse_id,tenant_id)
      SELECT id,tenant_id FROM public.warehouses WHERE warehouse_code=''WH-NORMAL''',
      dependency.relation);
  END LOOP;
  -- Reproduce historical corruption only inside the disposable synthetic DB.
  PERFORM set_config('session_replication_role','replica',true);
  INSERT INTO public.warehouses SELECT
    (jsonb_populate_record(NULL::public.warehouses,snapshot)).*
    FROM reviewed_warehouse_rows;
  PERFORM set_config('session_replication_role','origin',true);
END;
$seed$;

CREATE FUNCTION pg_temp.apply_reviewed_repair() RETURNS void LANGUAGE plpgsql AS $test_body$
-- __REVIEWED_REPAIR_BODY__
$test_body$;

CREATE FUNCTION pg_temp.assert_repair_rejected(expected_message text) RETURNS void
LANGUAGE plpgsql AS $assert$
DECLARE before_rows jsonb; before_audit jsonb; rejected boolean := false;
BEGIN
  SELECT jsonb_agg(to_jsonb(w) ORDER BY id) INTO before_rows FROM public.warehouses w;
  SELECT jsonb_agg(to_jsonb(a) ORDER BY id) INTO before_audit FROM public.platform_audit_logs a;
  BEGIN
    PERFORM pg_temp.apply_reviewed_repair();
  EXCEPTION WHEN raise_exception THEN
    IF position(expected_message IN SQLERRM) <> 1 THEN RAISE; END IF;
    rejected := true;
  END;
  IF NOT rejected THEN RAISE EXCEPTION 'EXPECTED_REPAIR_REJECTION: %',expected_message; END IF;
  IF before_rows IS DISTINCT FROM
      (SELECT jsonb_agg(to_jsonb(w) ORDER BY id) FROM public.warehouses w)
    OR before_audit IS DISTINCT FROM
      (SELECT jsonb_agg(to_jsonb(a) ORDER BY id) FROM public.platform_audit_logs a) THEN
    RAISE EXCEPTION 'REJECTION_PARTIALLY_COMMITTED';
  END IF;
END;
$assert$;

SELECT pg_temp.seed_reviewed_orphans();
DO $test$
DECLARE normal_before jsonb; dependency record; i integer;
BEGIN
  SELECT to_jsonb(w) INTO normal_before FROM public.warehouses w WHERE warehouse_code='WH-NORMAL';
  BEGIN
    ALTER TABLE public.warehouses ADD CONSTRAINT restore_created_by_probe
      FOREIGN KEY(created_by_employee_id,tenant_id) REFERENCES public.employees(id,tenant_id);
    RAISE EXCEPTION 'EXPECTED_RESTORE_FK_FAILURE';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
  PERFORM pg_temp.apply_reviewed_repair();
  IF (SELECT count(*) FROM public.warehouses) <> 1
    OR (SELECT count(*) FROM public.platform_audit_logs) <> 4 THEN
    RAISE EXCEPTION 'REPAIR_MUST_DELETE_FOUR_AND_AUDIT_FOUR';
  END IF;
  IF normal_before IS DISTINCT FROM
    (SELECT to_jsonb(w) FROM public.warehouses w WHERE warehouse_code='WH-NORMAL')
    OR EXISTS (SELECT 1 FROM public.platform_audit_logs a
      FULL JOIN reviewed_warehouse_rows r ON a.metadata->'before'=r.snapshot
      WHERE a.id IS NULL OR r.snapshot IS NULL
        OR a.metadata->>'before_md5' <> md5(r.snapshot::text)
        OR a.metadata->>'repair_key' <> 'warehouse-orphan-20260908'
        OR a.actor_employee_id IS NOT NULL OR a.actor_user_id IS NOT NULL
        OR a.target_tenant_id IS NOT NULL) THEN
    RAISE EXCEPTION 'NORMAL_ROW_OR_ARCHIVE_CHANGED';
  END IF;
  FOR dependency IN SELECT conrelid::regclass AS relation FROM pg_constraint
    WHERE contype='f' AND confrelid='public.warehouses'::regclass LOOP
    EXECUTE format('SELECT count(*) FROM %s',dependency.relation) INTO i;
    IF i<>1 THEN RAISE EXCEPTION 'BUSINESS_ROWS_CHANGED'; END IF;
  END LOOP;
  PERFORM pg_temp.apply_reviewed_repair();
  IF (SELECT count(*) FROM public.platform_audit_logs) <> 4 THEN
    RAISE EXCEPTION 'NO_TARGET_REPLAY_WROTE_AUDIT';
  END IF;
END;
$test$;

DO $tests$
DECLARE dependency record; present integer;
BEGIN
  FOR present IN 1..3 LOOP
    PERFORM pg_temp.seed_reviewed_orphans();
    DELETE FROM public.warehouses WHERE id IN
      (SELECT id FROM public.warehouses WHERE warehouse_code<>'WH-NORMAL'
       ORDER BY id LIMIT 4-present);
    PERFORM pg_temp.assert_repair_rejected('WAREHOUSE_ORPHAN_REPAIR_TARGET_SET_CHANGED');
  END LOOP;
  PERFORM pg_temp.seed_reviewed_orphans();
  PERFORM set_config('session_replication_role','replica',true);
  UPDATE public.warehouses SET name='changed' WHERE warehouse_code='WH-000032';
  PERFORM set_config('session_replication_role','origin',true);
  PERFORM pg_temp.assert_repair_rejected('WAREHOUSE_ORPHAN_REPAIR_ROW_CHANGED');
  PERFORM pg_temp.seed_reviewed_orphans();
  INSERT INTO public.tenants(id) SELECT tenant_id FROM public.warehouses WHERE warehouse_code='WH-000004';
  PERFORM pg_temp.assert_repair_rejected('WAREHOUSE_ORPHAN_REPAIR_ROW_CHANGED');
  PERFORM pg_temp.seed_reviewed_orphans();
  INSERT INTO public.employees(id,tenant_id)
    SELECT created_by_employee_id,'aaaaaaaa-0000-4000-8000-000000000001'::uuid
    FROM public.warehouses WHERE warehouse_code='WH-000032';
  PERFORM pg_temp.assert_repair_rejected('WAREHOUSE_ORPHAN_REPAIR_ROW_CHANGED');

  FOR dependency IN SELECT conrelid::regclass AS relation FROM pg_constraint
    WHERE contype='f' AND confrelid='public.warehouses'::regclass LOOP
    PERFORM pg_temp.seed_reviewed_orphans();
    EXECUTE format('INSERT INTO %s(warehouse_id,tenant_id)
      SELECT id,tenant_id FROM public.warehouses WHERE warehouse_code=''WH-000032''',
      dependency.relation);
    PERFORM pg_temp.assert_repair_rejected('WAREHOUSE_ORPHAN_REPAIR_HAS_DEPENDENCY');
  END LOOP;

  PERFORM pg_temp.seed_reviewed_orphans();
  PERFORM set_config('session_replication_role','replica',true);
  INSERT INTO public.warehouses(id,tenant_id,warehouse_code,name)
    VALUES ('aaaaaaaa-0000-4000-8000-000000000003',
      'aaaaaaaa-0000-4000-8000-000000000004','WH-UNREVIEWED','Unknown orphan');
  PERFORM set_config('session_replication_role','origin',true);
  PERFORM pg_temp.assert_repair_rejected('WAREHOUSE_ORPHAN_REPAIR_UNREVIEWED_ORPHAN');

  PERFORM pg_temp.seed_reviewed_orphans();
  CREATE TABLE public.unreviewed_reference(warehouse_id uuid REFERENCES public.warehouses(id));
  PERFORM pg_temp.assert_repair_rejected('WAREHOUSE_ORPHAN_REPAIR_DEPENDENCIES_CHANGED');
  DROP TABLE public.unreviewed_reference;

  CREATE TABLE public.unconstrained_reference(warehouse_id uuid);
  PERFORM pg_temp.assert_repair_rejected('WAREHOUSE_ORPHAN_REPAIR_DEPENDENCIES_CHANGED');
  DROP TABLE public.unconstrained_reference;

  ALTER TABLE public.warehouses DISABLE TRIGGER ALL;
  PERFORM pg_temp.assert_repair_rejected('WAREHOUSE_ORPHAN_REPAIR_CONSTRAINT_GUARD');
  ALTER TABLE public.warehouses ENABLE TRIGGER ALL;

  ALTER TABLE public.warehouses DROP CONSTRAINT warehouses_created_by_tenant_fkey;
  ALTER TABLE public.warehouses ADD CONSTRAINT warehouses_created_by_tenant_fkey
    FOREIGN KEY(created_by_employee_id,tenant_id)
    REFERENCES public.employees(id,tenant_id) ON DELETE RESTRICT NOT VALID;
  PERFORM pg_temp.assert_repair_rejected('WAREHOUSE_ORPHAN_REPAIR_CONSTRAINT_GUARD');
  -- Clear only synthetic orphans before revalidating the test schema.
  DELETE FROM public.warehouses WHERE warehouse_code<>'WH-NORMAL';
  ALTER TABLE public.warehouses VALIDATE CONSTRAINT warehouses_created_by_tenant_fkey;
  PERFORM pg_temp.seed_reviewed_orphans();
  PERFORM set_config('session_replication_role','replica',true);
  PERFORM pg_temp.assert_repair_rejected('WAREHOUSE_ORPHAN_REPAIR_TRIGGERS_REQUIRED');
  PERFORM set_config('session_replication_role','origin',true);
END;
$tests$;

CREATE FUNCTION pg_temp.reject_second_archive() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.resource_label='WH-000024' THEN RAISE EXCEPTION 'INJECTED_AUDIT_FAILURE'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER reject_archive BEFORE INSERT ON public.platform_audit_logs
FOR EACH ROW EXECUTE FUNCTION pg_temp.reject_second_archive();
SELECT pg_temp.seed_reviewed_orphans();
SELECT pg_temp.assert_repair_rejected('INJECTED_AUDIT_FAILURE');
DROP TRIGGER reject_archive ON public.platform_audit_logs;
SELECT pg_temp.seed_reviewed_orphans();
SELECT 'REVIEWED_ORPHAN_REPAIR_REGRESSIONS_PASSED' AS result;
