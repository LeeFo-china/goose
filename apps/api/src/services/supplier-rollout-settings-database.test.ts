import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";

import {
  executePsql,
  parseSupabasePostgresContainer,
  resolveLocalSupabasePostgres,
} from "./supplier-rollout-settings-database.test-helper";

const rolloutSignature = [
  "public.set_tenant_supplier_rollout_settings(",
  "uuid,boolean,boolean,boolean,boolean,boolean,boolean,",
  "integer,uuid,uuid,text,text)",
].join("");

function behaviorSql() {
  const tenantId = randomUUID();
  const actorUserId = randomUUID();
  const actorEmployeeId = randomUUID();
  const slug = `supplier-rollout-test-${tenantId}`;

  return `
BEGIN;

INSERT INTO public.tenants (id, name, slug, status)
VALUES ('${tenantId}', '供应商灰度数据库测试租户', '${slug}', 'active');

INSERT INTO public.employees (id, name, status, tenant_id)
VALUES ('${actorEmployeeId}', '供应商灰度数据库测试操作人', 'active', '${tenantId}');

DO $acl$
BEGIN
  IF NOT pg_catalog.has_function_privilege(
    'service_role',
    '${rolloutSignature}',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'service_role must execute rollout command';
  END IF;
  IF pg_catalog.has_function_privilege(
    'authenticated',
    '${rolloutSignature}',
    'EXECUTE'
  ) OR pg_catalog.has_function_privilege(
    'anon',
    '${rolloutSignature}',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'rollout command ACL is wider than service_role';
  END IF;
END
$acl$;

SET LOCAL ROLE service_role;
DO $behavior$
DECLARE
  v_constraint text;
  v_event_count bigint;
  v_level integer;
  v_result jsonb;
  v_version integer := 0;
BEGIN
  FOR v_level IN 1..5 LOOP
    v_result := public.set_tenant_supplier_rollout_settings(
      '${tenantId}',
      true,
      false,
      v_level >= 2,
      v_level >= 3,
      v_level >= 4,
      v_level >= 5,
      v_version,
      '${actorUserId}',
      '${actorEmployeeId}',
      pg_catalog.format('sequence-up-%s', v_level),
      NULL
    );
    v_version := v_version + 1;
    IF v_result ->> 'status' <> 'updated'
      OR (v_result ->> 'idempotent')::boolean
      OR (v_result ->> 'version')::integer <> v_version
      OR (v_result -> 'setting' ->> 'module_enabled')::boolean IS DISTINCT FROM true
      OR (v_result -> 'setting' ->> 'ownership_reads_enabled')::boolean
        IS DISTINCT FROM (v_level >= 2)
      OR (v_result -> 'setting' ->> 'private_supplier_writes_enabled')::boolean
        IS DISTINCT FROM (v_level >= 3)
      OR (v_result -> 'setting' ->> 'private_catalog_writes_enabled')::boolean
        IS DISTINCT FROM (v_level >= 4)
      OR (v_result -> 'setting' ->> 'procurement_snapshot_v1_enabled')::boolean
        IS DISTINCT FROM (v_level >= 5)
    THEN
      RAISE EXCEPTION 'invalid forward level % response: %', v_level, v_result;
    END IF;
  END LOOP;

  FOR v_level IN REVERSE 4..0 LOOP
    v_result := public.set_tenant_supplier_rollout_settings(
      '${tenantId}',
      v_level >= 1,
      false,
      v_level >= 2,
      v_level >= 3,
      v_level >= 4,
      false,
      v_version,
      '${actorUserId}',
      '${actorEmployeeId}',
      pg_catalog.format('sequence-down-%s', v_level),
      CASE WHEN v_level = 0 THEN '数据库行为测试逆序停用' ELSE NULL END
    );
    v_version := v_version + 1;
    IF v_result ->> 'status' <> 'updated'
      OR (v_result ->> 'idempotent')::boolean
      OR (v_result ->> 'version')::integer <> v_version
      OR (v_result -> 'setting' ->> 'module_enabled')::boolean
        IS DISTINCT FROM (v_level >= 1)
      OR (v_result -> 'setting' ->> 'ownership_reads_enabled')::boolean
        IS DISTINCT FROM (v_level >= 2)
      OR (v_result -> 'setting' ->> 'private_supplier_writes_enabled')::boolean
        IS DISTINCT FROM (v_level >= 3)
      OR (v_result -> 'setting' ->> 'private_catalog_writes_enabled')::boolean
        IS DISTINCT FROM (v_level >= 4)
      OR (v_result -> 'setting' ->> 'procurement_snapshot_v1_enabled')::boolean
        IS DISTINCT FROM false
    THEN
      RAISE EXCEPTION 'invalid reverse level % response: %', v_level, v_result;
    END IF;
  END LOOP;

  IF v_version <> 10 THEN
    RAISE EXCEPTION 'expected sequence version 10, got %', v_version;
  END IF;

  BEGIN
    PERFORM public.set_tenant_supplier_rollout_settings(
      '${tenantId}', true, false, true, false, false, false,
      v_version, '${actorUserId}', '${actorEmployeeId}',
      'jump-level-zero-to-two', NULL
    );
    RAISE EXCEPTION USING
      ERRCODE = 'XX000',
      MESSAGE = 'rollout jump was not rejected';
  EXCEPTION
    WHEN SQLSTATE 'P0001' THEN
      IF SQLERRM <> 'SUPPLIER_ROLLOUT_ORDER_INVALID' THEN
        RAISE;
      END IF;
  END;

  v_result := public.set_tenant_supplier_rollout_settings(
    '${tenantId}', true, false, false, false, false, false,
    v_version - 1, '${actorUserId}', '${actorEmployeeId}',
    'stale-before-enable', NULL
  );
  IF v_result ->> 'status' <> 'version_conflict'
    OR v_result ->> 'error_code' <> 'SUPPLIER_VERSION_CONFLICT'
    OR (v_result ->> 'version')::integer <> v_version
  THEN
    RAISE EXCEPTION 'invalid version conflict envelope: %', v_result;
  END IF;

  v_result := public.set_tenant_supplier_rollout_settings(
    '${tenantId}', true, false, false, false, false, false,
    v_version, '${actorUserId}', '${actorEmployeeId}',
    'idempotent-enable', NULL
  );
  v_version := v_version + 1;
  IF (v_result ->> 'idempotent')::boolean
    OR (v_result ->> 'version')::integer <> v_version
  THEN
    RAISE EXCEPTION 'invalid first idempotent response: %', v_result;
  END IF;

  v_result := public.set_tenant_supplier_rollout_settings(
    '${tenantId}', true, false, false, false, false, false,
    v_version - 1, '${actorUserId}', '${actorEmployeeId}',
    'idempotent-enable', NULL
  );
  IF NOT (v_result ->> 'idempotent')::boolean
    OR (v_result ->> 'version')::integer <> v_version
  THEN
    RAISE EXCEPTION 'invalid idempotent replay response: %', v_result;
  END IF;

  SELECT pg_catalog.count(*)
  INTO v_event_count
  FROM public.supplier_command_events AS event
  WHERE event.actor_user_id = '${actorUserId}'
    AND event.idempotency_key = 'idempotent-enable'
    AND event.resource_type = 'tenant_supplier'
    AND event.resource_id = '${tenantId}'
    AND event.command = 'set_tenant_supplier_rollout_settings'
    AND event.result_version = v_version
    AND event.from_state -> '_request' ->> 'expected_version' = '10';
  IF v_event_count <> 1 THEN
    RAISE EXCEPTION 'idempotent replay wrote % events', v_event_count;
  END IF;

  BEGIN
    PERFORM public.set_tenant_supplier_rollout_settings(
      '${tenantId}', true, true, false, false, false, false,
      v_version - 1, '${actorUserId}', '${actorEmployeeId}',
      'idempotent-enable', NULL
    );
    RAISE EXCEPTION USING
      ERRCODE = 'XX000',
      MESSAGE = 'idempotency conflict was not rejected';
  EXCEPTION
    WHEN SQLSTATE 'P0001' THEN
      IF SQLERRM <> 'SUPPLIER_IDEMPOTENCY_CONFLICT' THEN
        RAISE;
      END IF;
  END;

  v_result := public.set_tenant_supplier_rollout_settings(
    '${tenantId}', true, false, false, false, false, false,
    v_version - 1, '${actorUserId}', '${actorEmployeeId}',
    'optimistic-lock-loser', NULL
  );
  IF v_result ->> 'status' <> 'version_conflict'
    OR (v_result ->> 'version')::integer <> v_version
  THEN
    RAISE EXCEPTION 'stale optimistic writer was not rejected: %', v_result;
  END IF;

  v_result := public.set_tenant_supplier_rollout_settings(
    '${tenantId}', true, false, true, false, false, false,
    v_version, '${actorUserId}', '${actorEmployeeId}',
    'enable-ownership-for-legacy-check', NULL
  );
  v_version := v_version + 1;
  IF (v_result ->> 'version')::integer <> v_version THEN
    RAISE EXCEPTION 'ownership enable failed before legacy guard: %', v_result;
  END IF;

  BEGIN
    PERFORM public.set_tenant_supplier_module(
      '${tenantId}', false, false, v_version,
      '${actorUserId}', '${actorEmployeeId}',
      'legacy-module-bypass', '旧命令不得绕过子开关顺序'
    );
    RAISE EXCEPTION USING
      ERRCODE = 'XX000',
      MESSAGE = 'legacy module command bypassed rollout CHECK';
  EXCEPTION
    WHEN check_violation THEN
      GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
      IF v_constraint <> 'tenant_supplier_settings_ownership_rollout_order_check' THEN
        RAISE;
      END IF;
  END;

  SELECT pg_catalog.count(*)
  INTO v_event_count
  FROM public.supplier_command_events AS event
  WHERE event.actor_user_id = '${actorUserId}'
    AND event.command = 'set_tenant_supplier_rollout_settings';
  IF v_event_count <> 12 THEN
    RAISE EXCEPTION 'expected 12 committed rollout events, got %', v_event_count;
  END IF;
END
$behavior$;
RESET ROLE;

ROLLBACK;
SELECT 'SUPPLIER_ROLLOUT_DATABASE_BEHAVIOR_OK';
`;
}

describe("supplier rollout local PostgreSQL helper", () => {
  test("selects the running Supabase PostgreSQL container by project label", () => {
    const output = [
      JSON.stringify({
        Image: "public.ecr.aws/supabase/postgres:17.6.1.106",
        Labels: "com.supabase.cli.project=gooes,com.docker.compose.project=gooes",
        Names: "resolved-from-docker-ps",
        State: "running",
      }),
      JSON.stringify({
        Image: "public.ecr.aws/supabase/postgres-meta:v0.96.4",
        Labels: "com.supabase.cli.project=gooes,com.docker.compose.project=gooes",
        Names: "not-the-database",
        State: "running",
      }),
    ].join("\n");

    expect(parseSupabasePostgresContainer(output, "gooes")).toBe(
      "resolved-from-docker-ps",
    );
  });

  const localPostgres = resolveLocalSupabasePostgres();
  if (!localPostgres.available) {
    test.skip(
      `requires local Supabase PostgreSQL: ${localPostgres.reason}`,
      () => {},
    );
  } else {
    test("executes rollout, ordering, locking, idempotency, audit, and ACL behavior", () => {
      const output = executePsql(localPostgres.container, behaviorSql());

      expect(output).toContain("SUPPLIER_ROLLOUT_DATABASE_BEHAVIOR_OK");
    });
  }
});
