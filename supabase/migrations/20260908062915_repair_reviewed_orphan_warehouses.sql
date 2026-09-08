-- Remove only the four reviewed, unchanged, unreferenced orphan warehouses.
-- Full original rows are archived atomically in platform_audit_logs.metadata.
-- Rollback: retain the pre-apply database backup and audit snapshots. Restoring
-- these rows requires reviewed restoration of their original tenant/employees
-- first, through a separate forward migration; never disable FK checks.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
-- The reviewed JSONB hashes were captured in UTC.
SET LOCAL timezone = 'UTC';

DO $repair$
DECLARE
  v_ids uuid[] := ARRAY[
    'c040be4b-61a8-4966-9d7e-27e42fa942aa'::uuid,
    '1ae564fe-915a-40b7-9245-133d80c60961'::uuid,
    '402b619f-d22f-4fbc-ae18-6bd84a54333d'::uuid,
    'f1ba1d8a-b0db-42f2-a87e-8bcbd9e2601a'::uuid
  ];
  v_relations text[] := ARRAY[
    'inventory_balances','inventory_transactions','supplier_payable_events',
    'supplier_payment_requests','supplier_payments','supplier_purchase_batches',
    'supplier_purchase_orders','supplier_purchase_requisitions','warehouse_command_events'
  ];
  v_present integer;
  v_expected record;
  v_row public.warehouses%ROWTYPE;
  v_dependency record;
  v_has_dependency boolean;
  v_deleted integer := 0;
  v_affected integer;
BEGIN
  IF current_setting('session_replication_role') <> 'origin' THEN
    RAISE EXCEPTION 'WAREHOUSE_ORPHAN_REPAIR_TRIGGERS_REQUIRED';
  END IF;
  -- Block parent resurrection, target changes and incoming FK writes/DDL while
  -- inspecting and deleting. Timeouts above abort instead of waiting indefinitely.
  LOCK TABLE public.tenants, public.employees IN SHARE MODE;
  LOCK TABLE public.warehouses IN EXCLUSIVE MODE;
  SELECT count(*) INTO v_present FROM public.warehouses WHERE id=ANY(v_ids);
  IF v_present=0 THEN RETURN; END IF;
  IF v_present<>4 THEN
    RAISE EXCEPTION 'WAREHOUSE_ORPHAN_REPAIR_TARGET_SET_CHANGED';
  END IF;
  IF EXISTS(SELECT 1 FROM public.warehouses w
    WHERE NOT(w.id=ANY(v_ids)) AND (
      NOT EXISTS(SELECT 1 FROM public.tenants t WHERE t.id=w.tenant_id)
      OR (w.created_by_employee_id IS NOT NULL AND NOT EXISTS(
        SELECT 1 FROM public.employees e WHERE e.id=w.created_by_employee_id AND e.tenant_id=w.tenant_id))
      OR (w.updated_by_employee_id IS NOT NULL AND NOT EXISTS(
        SELECT 1 FROM public.employees e WHERE e.id=w.updated_by_employee_id AND e.tenant_id=w.tenant_id))
      OR (w.manager_employee_id IS NOT NULL AND NOT EXISTS(
        SELECT 1 FROM public.employees e WHERE e.id=w.manager_employee_id AND e.tenant_id=w.tenant_id))
    )) THEN
    RAISE EXCEPTION 'WAREHOUSE_ORPHAN_REPAIR_UNREVIEWED_ORPHAN';
  END IF;
  -- Match names AND column mappings, not merely the count of incoming FKs.
  IF (SELECT array_agg(r.relname::text ORDER BY r.relname)
      FROM pg_constraint c JOIN pg_class r ON r.oid=c.conrelid
      JOIN pg_namespace n ON n.oid=r.relnamespace
      WHERE c.contype='f' AND c.confrelid='public.warehouses'::regclass
        AND n.nspname='public') IS DISTINCT FROM v_relations
    OR EXISTS(SELECT 1 FROM pg_constraint c
      WHERE c.contype='f' AND c.confrelid='public.warehouses'::regclass
        AND (
          (SELECT array_agg(a.attname::text ORDER BY k.ordinality)
           FROM unnest(c.conkey) WITH ORDINALITY k(attnum,ordinality)
           JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.attnum)
            IS DISTINCT FROM ARRAY['warehouse_id','tenant_id']::text[]
          OR (SELECT array_agg(a.attname::text ORDER BY k.ordinality)
           FROM unnest(c.confkey) WITH ORDINALITY k(attnum,ordinality)
           JOIN pg_attribute a ON a.attrelid=c.confrelid AND a.attnum=k.attnum)
            IS DISTINCT FROM ARRAY['id','tenant_id']::text[]
          OR c.confdeltype<>'r'
          OR c.condeferrable
          OR c.connamespace<>'public'::regnamespace
        ))
    OR EXISTS(SELECT 1 FROM pg_attribute a
      JOIN pg_class r ON r.oid=a.attrelid
      JOIN pg_namespace n ON n.oid=r.relnamespace
      WHERE n.nspname='public' AND r.relkind IN ('r','p')
        AND a.attname='warehouse_id' AND NOT a.attisdropped
        AND NOT EXISTS(SELECT 1 FROM pg_constraint c
          WHERE c.conrelid=r.oid AND c.contype='f'
            AND c.confrelid='public.warehouses'::regclass AND a.attnum=ANY(c.conkey))) THEN
    RAISE EXCEPTION 'WAREHOUSE_ORPHAN_REPAIR_DEPENDENCIES_CHANGED';
  END IF;
  IF EXISTS(SELECT 1 FROM pg_constraint c
    WHERE c.contype='f' AND (c.conrelid='public.warehouses'::regclass
      OR c.confrelid='public.warehouses'::regclass)
      AND (NOT c.convalidated OR EXISTS(
        SELECT 1 FROM pg_trigger t WHERE t.tgconstraint=c.oid AND t.tgenabled NOT IN ('O','A')))) THEN
    RAISE EXCEPTION 'WAREHOUSE_ORPHAN_REPAIR_CONSTRAINT_GUARD';
  END IF;

  FOR v_expected IN SELECT * FROM (VALUES
    ('c040be4b-61a8-4966-9d7e-27e42fa942aa'::uuid,'992b842f-231b-46bb-b494-9b0f5cd5c192'::uuid,'db285789-726e-45e6-8fb4-cd878b467a1c'::uuid,'WH-000004','4103ef24183be8d47d90e7561ce9db22'),
    ('1ae564fe-915a-40b7-9245-133d80c60961'::uuid,'1116dec1-9c13-46a8-940b-48465e1db6e2'::uuid,'26bafdfb-4133-484a-b9e1-8c7beb59c638'::uuid,'WH-000024','ff2066f5bf7a0e7e76e44876c8715e46'),
    ('402b619f-d22f-4fbc-ae18-6bd84a54333d'::uuid,'c7264018-d4fb-410a-b342-3ffa755a6523'::uuid,'cedc1fc7-d3c0-41a7-8221-4dd5a21b7035'::uuid,'WH-000026','64118381064d0691523e6f42b03cec60'),
    ('f1ba1d8a-b0db-42f2-a87e-8bcbd9e2601a'::uuid,'77ba4a82-2cf8-452f-93d4-79e41dcc4340'::uuid,'a9176c33-99d3-458c-9bc4-93fe54e19982'::uuid,'WH-000032','baecc026272ffb676fa0e9c9e59f1d81')
  ) AS targets(id,tenant_id,employee_id,warehouse_code,row_md5)
  LOOP
    SELECT * INTO STRICT v_row FROM public.warehouses WHERE id=v_expected.id FOR UPDATE;
    IF v_row.tenant_id<>v_expected.tenant_id
      OR v_row.warehouse_code<>v_expected.warehouse_code
      OR v_row.created_by_employee_id IS DISTINCT FROM v_expected.employee_id
      OR v_row.updated_by_employee_id IS DISTINCT FROM v_expected.employee_id
      OR md5(to_jsonb(v_row)::text)<>v_expected.row_md5
      OR EXISTS(SELECT 1 FROM public.tenants WHERE id=v_row.tenant_id)
      OR EXISTS(SELECT 1 FROM public.employees WHERE id=v_expected.employee_id) THEN
      RAISE EXCEPTION 'WAREHOUSE_ORPHAN_REPAIR_ROW_CHANGED: %',v_expected.warehouse_code;
    END IF;
    FOR v_dependency IN SELECT conrelid::regclass AS relation FROM pg_constraint
      WHERE contype='f' AND confrelid='public.warehouses'::regclass
    LOOP
      EXECUTE format('SELECT EXISTS(SELECT 1 FROM %s WHERE warehouse_id=$1)',v_dependency.relation)
        INTO v_has_dependency USING v_row.id;
      IF v_has_dependency THEN
        RAISE EXCEPTION 'WAREHOUSE_ORPHAN_REPAIR_HAS_DEPENDENCY: %',v_dependency.relation;
      END IF;
    END LOOP;
    INSERT INTO public.platform_audit_logs(
      action,actor_employee_id,actor_user_id,target_tenant_id,
      resource_type,resource_id,resource_label,status,summary,metadata
    ) VALUES(
      'warehouse_orphan_remediation',NULL,NULL,NULL,
      'warehouse',v_row.id,v_row.warehouse_code,'success',
      'migration: remove reviewed unreferenced orphan warehouse',
      jsonb_build_object('repair_key','warehouse-orphan-20260908',
        'execution_source','database_migration','orphan_tenant_id',v_row.tenant_id,
        'before',to_jsonb(v_row),'before_md5',v_expected.row_md5)
    );
    DELETE FROM public.warehouses WHERE id=v_row.id;
    GET DIAGNOSTICS v_affected=ROW_COUNT;
    IF v_affected<>1 THEN RAISE EXCEPTION 'WAREHOUSE_ORPHAN_REPAIR_DELETE_COUNT'; END IF;
    v_deleted:=v_deleted+v_affected;
  END LOOP;
  IF v_deleted<>4 THEN RAISE EXCEPTION 'WAREHOUSE_ORPHAN_REPAIR_TOTAL_COUNT'; END IF;
END;
$repair$;
COMMIT;
