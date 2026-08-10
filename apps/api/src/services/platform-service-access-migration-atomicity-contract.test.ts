import { describe, expect, test } from "bun:test";
import {
  extractFunctionBody,
  extractFunctionDefinition,
  extractFunctionSignature,
  migrationPath,
  normalizeSql,
  readMigration,
} from "./platform-service-access-migration-test-helpers";

const attachmentPredecessorPath = new URL(
  "../../../../supabase/migrations/20260810185000_harden_platform_service_attachment_identity.sql",
  import.meta.url,
);

const acceptancePreparationRpc =
  "public.platform_service_upsert_acceptance_preparation( uuid, text, text, uuid, timestamptz )";

describe("platform service access migration atomicity follow-up", () => {
  test("creates one service-role-only atomic acceptance preparation command", async () => {
    const sql = await readMigration();
    const normalizedSql = normalizeSql(sql);
    const definition = normalizeSql(extractFunctionDefinition(
      sql,
      "platform_service_upsert_acceptance_preparation",
    ));
    const signature = normalizeSql(extractFunctionSignature(
      sql,
      "platform_service_upsert_acceptance_preparation",
    ));
    const body = normalizeSql(extractFunctionBody(
      sql,
      "platform_service_upsert_acceptance_preparation",
    ));

    expect(signature).toContain(
      "p_work_order_id uuid, p_status text, p_summary text, p_prepared_by_employee_id uuid, p_acceptance_due_at timestamptz default null",
    );
    expect(definition).toContain("security definer");
    const identityLookup = body.indexOf(
      "select service_order_id into v_order_id from public.tenant_service_work_orders",
    );
    const advisory = body.indexOf(
      "perform public.platform_service_lock_order(v_order_id);",
    );
    const orderLock = body.indexOf("from public.tenant_service_orders", advisory);
    const workOrderLock = body.indexOf(
      "from public.tenant_service_work_orders",
      orderLock,
    );
    const preparationLock = body.indexOf(
      "from public.tenant_service_acceptance_preparations",
      workOrderLock,
    );
    expect(identityLookup).toBeGreaterThan(-1);
    expect(advisory).toBeGreaterThan(identityLookup);
    expect(orderLock).toBeGreaterThan(advisory);
    expect(workOrderLock).toBeGreaterThan(orderLock);
    expect(preparationLock).toBeGreaterThan(workOrderLock);
    for (const lockStart of [orderLock, workOrderLock, preparationLock]) {
      expect(body.indexOf("for update;", lockStart)).toBeGreaterThan(lockStart);
    }

    expect(body).toContain("v_order.payment_status = 'paid'");
    expect(body).toContain("v_order.service_status = 'awaiting_acceptance'");
    expect(body).toContain("v_work_order.status = 'awaiting_acceptance'");
    expect(body).toContain("v_order.service_access_terminated_at is null");
    expect(body).toContain("v_acceptance.status in ('accepted', 'rejected', 'cancelled')");
    expect(body).toContain("v_acceptance_exists := found;");
    expect(body).toContain("v_acceptance_exists and v_acceptance.status in");
    expect(body).toContain("if v_acceptance_exists then");
    const stableReplay = body.indexOf(
      "if v_acceptance_exists and v_acceptance.status = p_status",
    );
    const commandClock = body.indexOf("v_command_at := clock_timestamp()");
    const eventInsert = body.indexOf(
      "insert into public.tenant_service_work_order_events",
    );
    expect(stableReplay).toBeGreaterThan(preparationLock);
    expect(commandClock).toBeGreaterThan(stableReplay);
    expect(eventInsert).toBeGreaterThan(commandClock);
    expect(body.slice(stableReplay, commandClock)).toContain("'idempotent', true");
    expect(body).toContain("p_status not in ('draft', 'submitted')");
    expect(body).toContain("p_status = 'submitted' and p_acceptance_due_at is null");
    expect(body).toContain("'acceptance_prepare'");
    expect(body).toContain("'acceptance_submit'");
    expect(body).not.toContain("p_metadata");

    for (const role of ["public", "anon", "authenticated"]) {
      expect(normalizedSql).toContain(
        `revoke all on function ${acceptancePreparationRpc} from ${role};`,
      );
    }
    expect(normalizedSql).toContain(
      `grant execute on function ${acceptancePreparationRpc} to service_role;`,
    );
  });

  test("makes acceptance attachment retries fact-preserving", async () => {
    const predecessorFile = Bun.file(attachmentPredecessorPath);
    expect(await predecessorFile.exists()).toBe(true);
    expect(
      attachmentPredecessorPath.pathname.localeCompare(migrationPath.pathname),
    ).toBeLessThan(0);
    const predecessor = normalizeSql(
      await predecessorFile.text(),
    );
    const mainMigration = normalizeSql(await readMigration());
    const referencedLock = predecessor.indexOf(
      "lock table public.tenants, public.employees in row share mode;",
    );
    const attachmentLock = predecessor.indexOf(
      "lock table public.tenant_service_fulfillment_attachments in share mode;",
    );
    const preflight = predecessor.indexOf("-- historical invariant preflight");
    const uniqueIndex = predecessor.indexOf(
      "create unique index tenant_service_fulfillment_attachments_scope_file_key",
    );
    expect(predecessor).toContain("set local lock_timeout = '5s';");
    expect(predecessor).toContain("set local statement_timeout = '2min';");
    expect(referencedLock).toBeGreaterThan(-1);
    expect(attachmentLock).toBeGreaterThan(referencedLock);
    expect(preflight).toBeGreaterThan(attachmentLock);
    expect(uniqueIndex).toBeGreaterThan(preflight);
    expect(predecessor).not.toContain("public.tenant_service_orders");
    expect(predecessor).not.toContain("public.tenant_service_work_orders");
    expect(predecessor).toContain(
      "platform_service_access_preflight_attachment_history_invalid",
    );
    expect(predecessor).toContain(
      "group by work_order_id, fulfillment_record_id, file_id having count(*) > 1",
    );
    expect(predecessor).toContain(
      "create unique index tenant_service_fulfillment_attachments_scope_file_key on public.tenant_service_fulfillment_attachments ( work_order_id, fulfillment_record_id, file_id ) nulls not distinct;",
    );
    expect(mainMigration).not.toContain(
      "platform_service_access_preflight_attachment_history_invalid",
    );
    expect(mainMigration).not.toContain(
      "tenant_service_fulfillment_attachments_scope_file_key",
    );
    expect(mainMigration).not.toContain(
      "lock table public.tenant_service_fulfillment_attachments",
    );
  });

  test("rejects invalid acceptance replay facts in both acceptance commands", async () => {
    const sql = await readMigration();
    for (const functionName of [
      "tenant_service_decide_acceptance",
      "platform_service_confirm_overdue_acceptance",
    ]) {
      const body = normalizeSql(extractFunctionBody(sql, functionName));
      const periodLookup = body.indexOf(
        "from public.tenant_service_contract_periods",
      );
      const versionCheck = body.indexOf(
        "if v_work_order.version <> p_expected",
        periodLookup,
      );
      const fastPath = body.slice(periodLookup, versionCheck);
      expect(fastPath).toContain("v_period.status not in ('active', 'adjusted')");
      expect(fastPath).toContain("v_order.payment_status = 'refunded'");
      expect(fastPath).toContain(
        "v_order.service_access_terminated_at is not null",
      );
      expect(fastPath).toContain("v_acceptance.status <> 'accepted'");
      expect(fastPath).toContain(
        "v_order.service_status is distinct from v_work_order.status",
      );
      expect(fastPath).toContain(
        "v_order.service_status not in ('accepted', 'active')",
      );
      expect(fastPath).toContain("'service_acceptance_invalid_state'");
    }
  });

  test("treats a same refund key as immutable state-pair idempotency", async () => {
    const sql = await readMigration();
    const body = normalizeSql(extractFunctionBody(
      sql,
      "platform_service_request_refund_review",
    ));
    const foundBranch = body.slice(
      body.indexOf("if found then"),
      body.indexOf("if v_order.version <> p_expected_version"),
    );

    for (const stablePair of [
      "v_refund.status = 'reviewing' and v_order.payment_status = 'refund_reviewing'",
      "v_refund.status = 'approved' and v_order.payment_status in ('refund_reviewing', 'refunding')",
      "v_refund.status = 'refunding' and v_order.payment_status = 'refunding'",
      "v_refund.status = 'refunded' and v_order.payment_status = 'refunded'",
      "v_refund.status in ('rejected', 'cancelled') and v_order.payment_status = 'paid'",
    ]) {
      expect(foundBranch).toContain(stablePair);
    }
    expect(foundBranch).toContain("'idempotent', true");
    expect(foundBranch).toContain("'service_order_idempotency_conflict'");
    expect(foundBranch).not.toContain("update public.tenant_service_orders");
  });

  test("locks referenced tables before every service table and preflight", async () => {
    const normalized = normalizeSql(await readMigration());
    const referencedLock = normalized.indexOf(
      "lock table public.tenants, public.employees in share row exclusive mode;",
    );
    const serviceLock = normalized.indexOf(
      "lock table public.tenant_service_orders",
    );
    const preflight = normalized.indexOf("-- historical invariant preflight");
    expect(referencedLock).toBeGreaterThan(
      normalized.indexOf("set local statement_timeout"),
    );
    expect(serviceLock).toBeGreaterThan(referencedLock);
    expect(preflight).toBeGreaterThan(serviceLock);
    const lockDocumentation = normalized.slice(
      normalized.lastIndexOf("-- lock referenced tables", referencedLock),
      serviceLock,
    );
    expect(lockDocumentation).toContain("fixed tenants -> employees order");
    expect(lockDocumentation).toContain("prevents later foreign-key lock upgrades");
    expect(lockDocumentation).toContain("referenced-table locks above");
  });

  test("bounds assign metadata before advisory and row locks", async () => {
    const body = normalizeSql(extractFunctionBody(
      await readMigration(),
      "platform_service_assign_work_order",
    ));
    const advisory = body.indexOf(
      "perform public.platform_service_lock_order(v_order_id);",
    );
    const guard = body.slice(0, advisory);
    expect(guard).toContain(
      "jsonb_typeof(coalesce(p_metadata, '{}'::jsonb)) <> 'object'",
    );
    expect(guard).toContain(
      "pg_column_size(coalesce(p_metadata, '{}'::jsonb)) > 8192",
    );
  });

  test("returns paid onboarding only while that access mode is still valid", async () => {
    const body = normalizeSql(extractFunctionBody(
      await readMigration(),
      "platform_service_confirm_payment",
    ));
    expect(body).toContain(
      "when v_order.service_access_terminated_at is null and v_order.service_status not in ('accepted', 'active') then 'paid_onboarding' else null end",
    );
    expect(body).toContain("'access_mode', 'paid_onboarding'");
  });
});
