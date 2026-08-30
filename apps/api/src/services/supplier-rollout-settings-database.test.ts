import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";

import {
  createConcurrentFixture,
  executePsql,
  parseSupabasePostgresContainer,
  resolveLocalSupabasePostgres,
  startPsqlSession,
  supplierRolloutAclSql,
  waitForMarker,
  type PsqlSession,
} from "./supplier-rollout-settings-database.test-helper";

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

${supplierRolloutAclSql()}

SET LOCAL ROLE service_role;
DO $behavior$
DECLARE
  v_constraint text;
  v_event_count bigint;
  v_level integer;
  v_result jsonb;
  v_version integer := 0;
BEGIN
  FOR v_level IN 1..6 LOOP
    v_result := public.set_tenant_supplier_rollout_settings(
      '${tenantId}',
      true,
      false,
      v_level >= 2,
      v_level >= 3,
      v_level >= 4,
      v_level >= 5,
      v_level >= 6,
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
      OR (v_result -> 'setting' ->> 'purchase_batch_workflow_enabled')::boolean
        IS DISTINCT FROM (v_level >= 6)
    THEN
      RAISE EXCEPTION 'invalid forward level % response: %', v_level, v_result;
    END IF;
  END LOOP;

  FOR v_level IN REVERSE 5..0 LOOP
    v_result := public.set_tenant_supplier_rollout_settings(
      '${tenantId}',
      v_level >= 1,
      false,
      v_level >= 2,
      v_level >= 3,
      v_level >= 4,
      v_level >= 5,
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
        IS DISTINCT FROM (v_level >= 5)
      OR (v_result -> 'setting' ->> 'purchase_batch_workflow_enabled')::boolean
        IS DISTINCT FROM false
    THEN
      RAISE EXCEPTION 'invalid reverse level % response: %', v_level, v_result;
    END IF;
  END LOOP;

  IF v_version <> 12 THEN
    RAISE EXCEPTION 'expected sequence version 12, got %', v_version;
  END IF;

  BEGIN
    PERFORM public.set_tenant_supplier_rollout_settings(
      '${tenantId}', true, false, true, false, false, false, false,
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
    '${tenantId}', true, false, false, false, false, false, false,
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
    '${tenantId}', true, false, false, false, false, false, false,
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
    '${tenantId}', true, false, false, false, false, false, false,
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
    AND event.from_state -> '_request' ->> 'expected_version' = '12'
    AND event.from_state -> '_request' ->>
      'purchase_batch_workflow_enabled' = 'false';
  IF v_event_count <> 1 THEN
    RAISE EXCEPTION 'idempotent replay wrote % events', v_event_count;
  END IF;

  BEGIN
    PERFORM public.set_tenant_supplier_rollout_settings(
      '${tenantId}', true, true, false, false, false, false, false,
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
    '${tenantId}', true, false, false, false, false, false, false,
    v_version - 1, '${actorUserId}', '${actorEmployeeId}',
    'optimistic-lock-loser', NULL
  );
  IF v_result ->> 'status' <> 'version_conflict'
    OR (v_result ->> 'version')::integer <> v_version
  THEN
    RAISE EXCEPTION 'stale optimistic writer was not rejected: %', v_result;
  END IF;

  v_result := public.set_tenant_supplier_rollout_settings(
    '${tenantId}', true, false, true, false, false, false, false,
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
  IF v_event_count <> 14 THEN
    RAISE EXCEPTION 'expected 14 committed rollout events, got %', v_event_count;
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

  test("resolves exclusively through the labeled docker container", () => {
    const commands: string[] = [];
    const resolution = resolveLocalSupabasePostgres((command, args) => {
      commands.push([command, ...args].join(" "));
      if (command !== "docker") {
        throw new Error(`unexpected command: ${command}`);
      }
      return {
        exitCode: 0,
        stdout: JSON.stringify({
          Image: "public.ecr.aws/supabase/postgres:17.6.1.106",
          Labels: "com.supabase.cli.project=gooes",
          Names: "resolved-without-status",
          State: "running",
        }),
        stderr: "",
        timedOut: false,
      };
    });

    expect(commands).toEqual(["docker ps --format {{json .}}"]);
    expect(resolution).toEqual({
      available: true,
      container: "resolved-without-status",
    });
  });

  test("does not expose command output when docker ps fails", () => {
    const simulatedSecret = "SUPABASE_SECRET_SHOULD_NOT_APPEAR";
    const resolution = resolveLocalSupabasePostgres(() => ({
      exitCode: 37,
      stdout: simulatedSecret,
      stderr: `diagnostic:${simulatedSecret}`,
      timedOut: false,
    }));

    expect(resolution.available).toBe(false);
    if (resolution.available) {
      throw new Error("expected docker resolution failure");
    }
    expect(resolution.reason).toContain("docker ps");
    expect(resolution.reason).toContain("exit code 37");
    expect(resolution.reason).toContain("supabase start");
    expect(resolution.reason).not.toContain(simulatedSecret);
  });

  test("reports docker ps timeouts without exposing command output", () => {
    const simulatedSecret = "SUPABASE_TIMEOUT_SECRET_SHOULD_NOT_APPEAR";
    const resolution = resolveLocalSupabasePostgres(() => ({
      exitCode: 1,
      stdout: simulatedSecret,
      stderr: `diagnostic:${simulatedSecret}`,
      timedOut: true,
    }));

    expect(resolution).toEqual({
      available: false,
      reason: "命令阶段 docker ps 超过 15 秒，已终止；请确认 Docker 可用并先运行 supabase start",
    });
    expect(JSON.stringify(resolution)).not.toContain(simulatedSecret);
  });

  test("reports psql timeouts without exposing command output", () => {
    const simulatedSecret = "PSQL_TIMEOUT_SECRET_SHOULD_NOT_APPEAR";
    let timeoutError: unknown;

    try {
      executePsql("local-postgres", "select 1", () => ({
        exitCode: 1,
        stdout: simulatedSecret,
        stderr: `diagnostic:${simulatedSecret}`,
        timedOut: true,
      }));
    } catch (error) {
      timeoutError = error;
    }

    expect(timeoutError).toBeInstanceOf(Error);
    expect((timeoutError as Error).message).toBe(
      "命令阶段 docker exec psql 超过 15 秒，已终止；本地数据库行为验证未完成",
    );
    expect((timeoutError as Error).message).not.toContain(simulatedSecret);
  });

  test("guards the exact retired and current overload ACL catalog state", () => {
    const aclSql = supplierRolloutAclSql();
    expect(aclSql).toContain(
      "to_regprocedure('public.set_tenant_supplier_rollout_settings(uuid,boolean,boolean,boolean,boolean,boolean,boolean,integer,uuid,uuid,text,text)') IS NOT NULL",
    );
    expect(aclSql).toContain(
      "to_regprocedure('public.set_tenant_supplier_rollout_settings(uuid,boolean,boolean,boolean,boolean,boolean,boolean,boolean,integer,uuid,uuid,text,text)') IS NULL",
    );
    expect(aclSql).toContain("pg_catalog.aclexplode");
    expect(aclSql).toContain("permission.grantee <> procedure_definition.proowner");
    expect(aclSql).toContain("OR permission.is_grantable");
    expect(aclSql).toContain("role_definition.rolname = 'service_role'");
  });

  const localPostgres = resolveLocalSupabasePostgres();
  test("executes rollout, ordering, locking, idempotency, audit, and ACL behavior", () => {
    if (!localPostgres.available) {
      throw new Error(
        `本地 Supabase PostgreSQL 不可用：${localPostgres.reason}；请先运行 supabase start`,
      );
    }

    const output = executePsql(localPostgres.container, behaviorSql());

    expect(output).toContain("SUPPLIER_ROLLOUT_DATABASE_BEHAVIOR_OK");
  });

  test("serializes two real sessions and rejects the stale concurrent writer", async () => {
    if (!localPostgres.available) {
      throw new Error(
        `本地 Supabase PostgreSQL 不可用：${localPostgres.reason}；请先运行 supabase start`,
      );
    }

    const fixture = createConcurrentFixture();
    let testFailure: unknown;
    let cleanupFailure: unknown;
    let sessionA: PsqlSession | undefined;
    let sessionB: PsqlSession | undefined;

    try {
      executePsql(localPostgres.container, fixture.setupSql);
      sessionA = startPsqlSession(
        localPostgres.container,
        fixture.sessionASql,
      );
      await waitForMarker(sessionA, "SESSION_A_LOCKED");

      sessionB = startPsqlSession(
        localPostgres.container,
        fixture.sessionBSql,
      );
      await waitForMarker(sessionB, "SESSION_B_STARTED");
      expect(sessionA.child.exitCode).toBeNull();
      expect(sessionB.child.exitCode).toBeNull();

      const [sessionAExitCode, sessionBExitCode] = await Promise.all([
        sessionA.completed,
        sessionB.completed,
      ]);
      expect(sessionAExitCode).toBe(0);
      expect(sessionBExitCode).toBe(0);
      expect(sessionA.output.stdout).toContain("SESSION_A_COMMITTED");
      expect(sessionB.output.stdout).toContain(
        "SESSION_B_VERSION_CONFLICT",
      );

      const verification = executePsql(
        localPostgres.container,
        fixture.verifySql,
      );
      expect(verification).toContain(
        "SUPPLIER_ROLLOUT_CONCURRENT_VERIFY_OK",
      );
    } catch (error) {
      testFailure = error;
    } finally {
      const sessions = [sessionA, sessionB].filter(
        (session): session is PsqlSession => session !== undefined,
      );
      for (const session of sessions) {
        if (session.child.exitCode === null) {
          session.child.kill("SIGTERM");
        }
      }
      await Promise.allSettled(sessions.map((session) => session.completed));

      try {
        const cleanup = executePsql(
          localPostgres.container,
          fixture.cleanupSql,
        );
        expect(cleanup).toContain("SUPPLIER_ROLLOUT_CONCURRENT_CLEANUP_OK");
      } catch (error) {
        cleanupFailure = error;
      }
    }

    if (testFailure && cleanupFailure) {
      throw new AggregateError(
        [testFailure, cleanupFailure],
        "并发行为验证及精确 fixture 清理均失败",
      );
    }
    if (cleanupFailure) {
      throw cleanupFailure;
    }
    if (testFailure) {
      throw testFailure;
    }
  }, 30_000);
});
