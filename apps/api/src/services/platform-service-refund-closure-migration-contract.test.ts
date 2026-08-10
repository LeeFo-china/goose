import { describe, expect, test } from "bun:test";

const migrationUrl = new URL(
  "../../../../supabase/migrations/20260811004000_close_platform_service_refund_execution.sql",
  import.meta.url,
);
const accessMigrationUrl = new URL(
  "../../../../supabase/migrations/20260810190000_create_platform_service_contract_access.sql",
  import.meta.url,
);

function normalizeSql(sql: string) {
  return sql.toLowerCase().replaceAll(/\s+/g, " ").trim();
}

function functionBody(
  sql: string,
  signature = "CREATE OR REPLACE FUNCTION public.platform_service_close_refund_execution",
) {
  const start = sql.indexOf(signature);
  const bodyStart = sql.indexOf("AS $$", start);
  const bodyEnd = sql.indexOf("\n$$;", bodyStart);
  expect(start).toBeGreaterThan(-1);
  expect(bodyStart).toBeGreaterThan(start);
  expect(bodyEnd).toBeGreaterThan(bodyStart);
  return normalizeSql(sql.slice(bodyStart, bodyEnd));
}

describe("platform service provider-closed refund recovery migration", () => {
  test("adds an independent bounded provider closure fact group", async () => {
    const file = Bun.file(migrationUrl);
    expect(await file.exists()).toBe(true);
    const sql = normalizeSql(await file.text());

    for (const column of [
      "provider_refund_status text null",
      "provider_out_refund_no text null",
      "provider_wechat_refund_id text null",
      "provider_refund_amount_fen bigint null",
      "provider_checked_at timestamptz null",
      "provider_checked_by_employee_id uuid null",
    ]) expect(sql).toContain(`add column ${column}`);
    expect(sql).toContain("provider_refund_status is null or provider_refund_status = 'closed'");
    expect(sql).toContain("foreign key (provider_checked_by_employee_id) references public.employees(id)");
    expect(sql).toContain("tenant_service_refund_requests_provider_closed_fields_check");
    expect(sql).toContain("status = 'cancelled'");
    expect(sql).toContain("tenant_service_refund_requests_provider_out_refund_unique_idx");
    expect(sql).toContain("tenant_service_refund_requests_provider_wechat_refund_unique_idx");
  });

  test("serializes provider identifiers across SUCCESS and CLOSED terminal columns", async () => {
    const sql = normalizeSql(await Bun.file(migrationUrl).text());
    expect(sql).toContain(
      "unique index tenant_service_refund_requests_terminal_out_refund_unique_idx on public.tenant_service_refund_requests ((coalesce(out_refund_no, provider_out_refund_no))) where coalesce(out_refund_no, provider_out_refund_no) is not null",
    );
    expect(sql).toContain(
      "unique index tenant_service_refund_requests_terminal_wechat_refund_unique_idx on public.tenant_service_refund_requests ((coalesce(wechat_refund_id, provider_wechat_refund_id))) where coalesce(wechat_refund_id, provider_wechat_refund_id) is not null",
    );
    expect(sql).toContain("unique constraint closes");
    expect(sql).toContain("concurrent different-request race at the database boundary");

    const closeBody = functionBody(await Bun.file(migrationUrl).text());
    expect(closeBody).toContain(
      "when unique_violation then raise exception 'service_refund_provider_id_conflict'",
    );
    const confirmBody = functionBody(
      await Bun.file(accessMigrationUrl).text(),
      "CREATE OR REPLACE FUNCTION public.platform_service_confirm_refund",
    );
    expect(confirmBody).toContain(
      "when unique_violation then raise exception 'service_refund_execution_id_conflict'",
    );
  });

  test("uses a service-role-only exact RPC and canonical lock order", async () => {
    const sqlText = await Bun.file(migrationUrl).text();
    const sql = normalizeSql(sqlText);
    const signature = "public.platform_service_close_refund_execution( uuid, uuid, text, text, uuid, integer, text, text, bigint, uuid, jsonb )";
    expect(sql).toContain("security definer set search_path = public, pg_temp");
    for (const role of ["public", "anon", "authenticated"]) {
      expect(sql).toContain(`revoke all on function ${signature} from ${role};`);
    }
    expect(sql).toContain(`grant execute on function ${signature} to service_role;`);

    const body = functionBody(sqlText);
    const advisory = body.indexOf("perform public.platform_service_lock_order(v_order_id);");
    const orderLock = body.indexOf("from public.tenant_service_orders", advisory);
    const workLock = body.indexOf("from public.tenant_service_work_orders", orderLock);
    const acceptanceLock = body.indexOf(
      "from public.tenant_service_acceptance_preparations",
      workLock,
    );
    const refundLock = body.indexOf("from public.tenant_service_refund_requests", acceptanceLock);
    expect(advisory).toBeGreaterThan(-1);
    expect(orderLock).toBeGreaterThan(advisory);
    expect(workLock).toBeGreaterThan(orderLock);
    expect(acceptanceLock).toBeGreaterThan(workLock);
    expect(refundLock).toBeGreaterThan(acceptanceLock);
    for (const position of [orderLock, workLock, acceptanceLock, refundLock]) {
      expect(body.indexOf("for update", position)).toBeGreaterThan(position);
    }
  });

  test("validates trusted payment, global actor, state and bounded command input", async () => {
    const body = functionBody(await Bun.file(migrationUrl).text());
    expect(body).toContain("p_service_order_id is null");
    expect(body).toContain("char_length(p_out_refund_no) > 64");
    expect(body).toContain("char_length(p_wechat_refund_id) > 128");
    expect(body).toContain("p_refund_amount_fen <= 0");
    expect(body).toContain("jsonb_typeof(coalesce(p_metadata, '{}'::jsonb)) <> 'object'");
    expect(body).toContain("pg_column_size(coalesce(p_metadata, '{}'::jsonb)) > 8192");
    expect(body).toContain("v_order.id is distinct from p_service_order_id");
    expect(body).toContain("v_order.transaction_id is distinct from p_transaction_id");
    expect(body).toContain("v_order.out_trade_no is distinct from p_out_trade_no");
    expect(body).toContain("v_order.payment_config_id is distinct from p_payment_config_id");
    expect(body).toContain("v_order.payment_config_guard_version is distinct from p_payment_config_guard_version");
    expect(body).toContain("employee.tenant_id is null");
    expect(body).toContain("employee.status = 'active'");
    expect(body).toContain("role.tenant_id is null");
    expect(body).toContain("role.status = 'active'");
    expect(body).toContain("v_refund.status not in ('approved', 'refunding')");
    expect(body).toContain("v_order.payment_status not in ('refund_reviewing', 'refunding')");
    expect(body).toContain("v_order.service_access_terminated_at is not null");
  });

  test("restores only payment review state and records an immutable CLOSED audit", async () => {
    const body = functionBody(await Bun.file(migrationUrl).text());
    const refundUpdate = body.indexOf("update public.tenant_service_refund_requests");
    const orderUpdate = body.indexOf("update public.tenant_service_orders", refundUpdate);
    const eventInsert = body.indexOf("insert into public.tenant_service_work_order_events", orderUpdate);
    expect(refundUpdate).toBeGreaterThan(-1);
    expect(body.slice(refundUpdate, orderUpdate)).toContain("status = 'cancelled'");
    expect(body.slice(refundUpdate, orderUpdate)).toContain("provider_refund_status = 'closed'");
    const orderMutation = body.slice(orderUpdate, eventInsert);
    expect(orderMutation).toContain("payment_status = 'paid'");
    expect(orderMutation).not.toContain("service_status =");
    expect(orderMutation).not.toContain("service_access_terminated_at =");
    expect(orderMutation).not.toContain("tenant_service_work_orders set");
    expect(orderMutation).not.toContain("tenant_service_acceptance_preparations set");
    expect(body.slice(eventInsert)).toContain("'refund_provider_closed'");
    expect(body.slice(eventInsert)).not.toContain("p_metadata");
    expect(body).toContain("'provider_status', 'closed'");
    expect(body).toContain("'refunded', false");
    expect(body).toContain("'access_terminated', false");
    expect(body).toContain("'retryable', false");
  });

  test("replays its own CLOSED fact without depending on a later order terminal state", async () => {
    const body = functionBody(await Bun.file(migrationUrl).text());
    const replayStart = body.indexOf(
      "if v_refund.status = 'cancelled' and v_refund.provider_refund_status = 'closed'",
    );
    const replayReturn = body.indexOf("return jsonb_build_object", replayStart);
    const replayEnd = body.indexOf("end if;", replayReturn);
    const replay = body.slice(replayStart, replayEnd);
    expect(replayStart).toBeGreaterThan(-1);
    expect(replay).toContain(
      "v_refund.provider_refund_amount_fen is distinct from p_refund_amount_fen",
    );
    expect(replay).not.toContain("v_order.payment_status");
    expect(replay).not.toContain("v_order.service_access_terminated_at");
    expect(replay).not.toContain("update public.");
    expect(replay).toContain("'idempotent', true");
  });

  test("bounds deployment locks before DDL and documents forward remediation", async () => {
    const sql = normalizeSql(await Bun.file(migrationUrl).text());
    const timeout = sql.indexOf("set local lock_timeout = '5s'");
    const employeeLock = sql.indexOf("lock table public.employees");
    const serviceLock = sql.indexOf("lock table public.tenant_service_work_order_events");
    const ddl = sql.indexOf("alter table public.tenant_service_refund_requests");
    expect(timeout).toBeGreaterThan(sql.indexOf("begin;"));
    expect(employeeLock).toBeGreaterThan(timeout);
    expect(serviceLock).toBeGreaterThan(employeeLock);
    expect(ddl).toBeGreaterThan(serviceLock);
    expect(sql).toContain("task 7 must measure");
    expect(sql).toContain("forward-only");
    expect(sql).toContain("do not repair dev or production with manual dml");
  });
});
