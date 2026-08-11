import { describe, expect, test } from "bun:test";
import {
  extractFunctionBody,
  extractFunctionSignature,
  extractPreflight,
  extractStatement,
  normalizeSql,
  readMigration,
} from "./platform-service-access-migration-test-helpers";

const legacyFulfillmentFile = Bun.file(new URL(
  "../../../../supabase/migrations/20260804160000_create_platform_service_fulfillment_admin.sql",
  import.meta.url,
));
const lockCall = "perform public.platform_service_lock_order(v_order_id);";

const expectLockedTablesInOrder = (
  body: string,
  tableNames: readonly string[],
) => {
  let cursor = body.indexOf(lockCall) + lockCall.length;
  expect(cursor).toBeGreaterThan(lockCall.length - 1);

  for (const tableName of tableNames) {
    const tablePosition = body.indexOf(`from public.${tableName}`, cursor);
    const rowLockPosition = body.indexOf("for update;", tablePosition);
    expect(tablePosition).toBeGreaterThan(cursor - 1);
    expect(rowLockPosition).toBeGreaterThan(tablePosition);
    cursor = rowLockPosition + "for update;".length;
  }
};

describe("platform service access migration quality hardening", () => {
  test("bounds deployment waits and takes strong locks before preflight", async () => {
    const sql = await readMigration();
    const normalized = normalizeSql(sql);
    const beginPosition = normalized.indexOf("begin;");
    const lockTimeoutPosition = normalized.indexOf(
      "set local lock_timeout = '5s';",
    );
    const statementTimeoutPosition = normalized.indexOf(
      "set local statement_timeout = '5min';",
    );
    const lockPosition = normalized.indexOf(
      "lock table public.tenant_service_orders",
    );
    const preflightPosition = normalized.indexOf(
      "-- historical invariant preflight",
    );
    const ddlPosition = normalized.indexOf(
      "alter table public.tenant_service_orders add column source_trial_id",
    );

    expect(beginPosition).toBeGreaterThan(-1);
    expect(lockTimeoutPosition).toBeGreaterThan(beginPosition);
    expect(statementTimeoutPosition).toBeGreaterThan(lockTimeoutPosition);
    expect(lockPosition).toBeGreaterThan(statementTimeoutPosition);
    expect(preflightPosition).toBeGreaterThan(lockPosition);
    expect(ddlPosition).toBeGreaterThan(preflightPosition);

    const lockBlock = normalized.slice(lockPosition, preflightPosition);
    expect(lockBlock).toContain("in access exclusive mode;");
    for (const tableName of [
      "tenant_service_orders",
      "tenant_service_work_orders",
      "tenant_service_acceptance_preparations",
      "tenant_service_work_order_events",
      "tenant_service_refund_requests",
    ]) {
      expect(lockBlock).toContain(`public.${tableName}`);
    }
    expect(normalized.slice(0, preflightPosition)).toContain(
      "task 7 must measure",
    );
  });

  test("fails closed on malformed acceptance chronology", async () => {
    const sql = await readMigration();
    const preflight = normalizeSql(extractPreflight(sql));
    const backfillStart = sql.indexOf("-- Backfill already accepted orders");
    const backfillEnd = sql.indexOf("\n$$;", backfillStart);
    const backfill = normalizeSql(sql.slice(backfillStart, backfillEnd));
    expect(preflight).toContain("acceptance.submitted_at is not null");
    expect(preflight).toContain(
      "acceptance_event.created_at >= greatest( service_order.paid_at, acceptance.submitted_at )",
    );
    expect(preflight).toContain(
      "invalid_acceptance_event.created_at < greatest( service_order.paid_at, acceptance.submitted_at )",
    );
    expect(backfill).toContain("acceptance.submitted_at is not null");
    expect(backfill).toContain(
      "work_order_event.created_at >= greatest( service_order.paid_at, acceptance.submitted_at )",
    );
  });

  test("uses platform actor foreign keys and excludes accepted paid onboarding", async () => {
    const sql = await readMigration();
    const normalized = normalizeSql(sql);
    const paidIndex = normalizeSql(extractStatement(
      sql,
      "CREATE INDEX tenant_service_orders_paid_onboarding_access_idx",
    ));

    expect(normalized).toContain(
      "foreign key (service_access_terminated_by_employee_id) references public.employees(id)",
    );
    expect(normalized).toContain(
      "foreign key (refunded_by_employee_id) references public.employees(id)",
    );
    expect(normalized).not.toContain(
      "foreign key (service_access_terminated_by_employee_id, tenant_id)",
    );
    expect(normalized).not.toContain(
      "foreign key (refunded_by_employee_id, tenant_id)",
    );
    expect(paidIndex).toContain(
      "service_status not in ('accepted', 'active')",
    );
    expect(paidIndex).toContain("service_access_terminated_at is null");
    expect(paidIndex).not.toContain("service_status <> 'canceled'");
  });

  test("uses one advisory lock before canonical row locks in every command", async () => {
    const sql = await readMigration();
    const legacySql = await legacyFulfillmentFile.text();
    const normalizedSql = normalizeSql(sql);
    const helperBody = normalizeSql(extractFunctionBody(
      sql,
      "platform_service_lock_order",
    ));
    expect(helperBody).toContain("pg_advisory_xact_lock(");
    expect(helperBody).toContain(
      "'platform_service_order:' || p_service_order_id::text, 2026081019",
    );
    for (const role of ["public", "anon", "authenticated", "service_role"]) {
      expect(normalizedSql).toContain(
        `revoke all on function public.platform_service_lock_order(uuid) from ${role};`,
      );
    }
    expect(normalizedSql).not.toContain(
      "grant execute on function public.platform_service_lock_order(uuid)",
    );

    const cases = [
      [
        "tenant_service_decide_acceptance",
        [
          "tenant_service_orders",
          "tenant_service_work_orders",
          "tenant_service_acceptance_preparations",
        ],
      ],
      [
        "platform_service_confirm_overdue_acceptance",
        [
          "tenant_service_orders",
          "tenant_service_work_orders",
          "tenant_service_acceptance_preparations",
        ],
      ],
      [
        "platform_service_assign_work_order",
        ["tenant_service_orders", "tenant_service_work_orders"],
      ],
      [
        "platform_service_transition_work_order",
        ["tenant_service_orders", "tenant_service_work_orders"],
      ],
      [
        "platform_service_request_refund_review",
        [
          "tenant_service_orders",
          "tenant_service_work_orders",
          "tenant_service_refund_requests",
        ],
      ],
      [
        "platform_service_review_refund_request",
        [
          "tenant_service_orders",
          "tenant_service_work_orders",
          "tenant_service_refund_requests",
        ],
      ],
      [
        "platform_service_confirm_refund",
        [
          "tenant_service_orders",
          "tenant_service_work_orders",
          "tenant_service_acceptance_preparations",
          "tenant_service_refund_requests",
          "tenant_service_contract_periods",
          "tenant_service_contracts",
        ],
      ],
    ] as const;

    for (const [functionName, tableNames] of cases) {
      const body = normalizeSql(extractFunctionBody(sql, functionName));
      const advisoryPosition = body.indexOf(lockCall);
      expect(advisoryPosition).toBeGreaterThan(-1);
      expect(advisoryPosition).toBeLessThan(body.indexOf("for update;"));
      expectLockedTablesInOrder(body, tableNames);
    }

    for (const functionName of [
      "platform_service_assign_work_order",
      "platform_service_confirm_overdue_acceptance",
      "platform_service_transition_work_order",
    ]) {
      const body = normalizeSql(extractFunctionBody(sql, functionName));
      expect(body.indexOf("select service_order_id into v_order_id")).toBeLessThan(
        body.indexOf(lockCall),
      );
      expect(body).toContain("service_order_id = v_order.id");
      expect(body).toContain("tenant_id = v_order.tenant_id");
    }
    for (const functionName of [
      "platform_service_review_refund_request",
      "platform_service_confirm_refund",
    ]) {
      const body = normalizeSql(extractFunctionBody(sql, functionName));
      expect(body.indexOf("select service_order_id into v_order_id")).toBeLessThan(
        body.indexOf(lockCall),
      );
      expect(body).toContain("service_order_id = v_order.id");
      expect(body).toContain("tenant_id = v_order.tenant_id");
    }

    expect(normalizeSql(extractFunctionSignature(
      sql,
      "platform_service_assign_work_order",
    ))).toContain(
      "p_work_order_id uuid, p_assignee_employee_id uuid, p_expected_version integer, p_operator_employee_id uuid, p_remark text default null, p_metadata jsonb default '{}'::jsonb",
    );
    const assignVersionMarker =
      "if v_work_order.version <> p_expected_version then";
    const assignBody = normalizeSql(extractFunctionBody(
      sql,
      "platform_service_assign_work_order",
    ));
    const legacyAssignBody = normalizeSql(extractFunctionBody(
      legacySql,
      "platform_service_assign_work_order",
    ));
    expect(assignBody.slice(assignBody.indexOf(assignVersionMarker))).toBe(
      legacyAssignBody.slice(legacyAssignBody.indexOf(assignVersionMarker)),
    );
    expect(normalizeSql(extractFunctionSignature(
      sql,
      "platform_service_request_refund_review",
    ))).toContain(
      "p_tenant_id uuid, p_order_id uuid, p_expected_version integer, p_idempotency_key uuid, p_reason text, p_created_by_employee_id uuid",
    );
    expect(normalizeSql(extractFunctionSignature(
      sql,
      "platform_service_review_refund_request",
    ))).toContain(
      "p_refund_request_id uuid, p_decision text, p_expected_version integer, p_operator_employee_id uuid, p_review_remark text default null",
    );
  });

  test("binds refund execution to the locked payment and a global actor", async () => {
    const sql = await readMigration();
    const signature = normalizeSql(extractFunctionSignature(
      sql,
      "platform_service_confirm_refund",
    ));
    const body = normalizeSql(extractFunctionBody(
      sql,
      "platform_service_confirm_refund",
    ));
    const bindingPosition = body.indexOf(
      "service_refund_payment_binding_invalid",
    );

    expect(signature).toContain(
      "p_refund_request_id uuid, p_service_order_id uuid, p_transaction_id text, p_out_trade_no text, p_payment_config_id uuid, p_payment_config_guard_version integer, p_out_refund_no text, p_wechat_refund_id text, p_refund_amount_fen bigint, p_refunded_at timestamptz, p_operator_employee_id uuid, p_metadata jsonb default '{}'::jsonb",
    );
    for (const comparison of [
      "v_order.id is distinct from p_service_order_id",
      "v_order.transaction_id is distinct from p_transaction_id",
      "v_order.out_trade_no is distinct from p_out_trade_no",
      "v_order.payment_config_id is distinct from p_payment_config_id",
      "v_order.payment_config_guard_version is distinct from p_payment_config_guard_version",
    ]) {
      expect(body).toContain(comparison);
    }
    expect(bindingPosition).toBeGreaterThan(-1);
    expect(bindingPosition).toBeLessThan(
      body.indexOf("if v_refund.status = 'refunded' then"),
    );
    expect(bindingPosition).toBeLessThan(
      body.indexOf("update public.tenant_service_refund_requests"),
    );

    const operatorLock = body.indexOf(
      "perform public.platform_service_lock_refund_operator(p_operator_employee_id);",
    );
    const advisoryLock = body.indexOf(
      "perform public.platform_service_lock_order(v_order_id);",
    );
    expect(operatorLock).toBeGreaterThan(-1);
    expect(advisoryLock).toBeGreaterThan(operatorLock);
    expect(body.slice(operatorLock + 1)).not.toContain(
      "from public.employees as employee",
    );
    expect(body).not.toContain("employee.tenant_id = v_refund.tenant_id");
    expect(body).not.toContain("assert_platform_operator_actor");

    const reference =
      "public.platform_service_confirm_refund( uuid, uuid, text, text, uuid, integer, text, text, bigint, timestamptz, uuid, jsonb )";
    for (const role of ["public", "anon", "authenticated"]) {
      expect(normalizeSql(sql)).toContain(
        `revoke all on function ${reference} from ${role};`,
      );
    }
    expect(normalizeSql(sql)).toContain(
      `grant execute on function ${reference} to service_role;`,
    );
  });

  test("writes one bounded immutable event for each period mutation", async () => {
    const sql = await readMigration();
    const actionConstraint = normalizeSql(extractStatement(
      sql,
      "ADD CONSTRAINT tenant_service_work_order_events_action_check",
    ));
    const body = normalizeSql(extractFunctionBody(
      sql,
      "platform_service_confirm_refund",
    ));

    expect(actionConstraint).toContain("'contract_period_void'");
    expect(actionConstraint).toContain("'contract_period_adjust'");
    expect(body.match(/'contract_period_void'/g) ?? []).toHaveLength(1);
    expect(body.match(/'contract_period_adjust'/g) ?? []).toHaveLength(1);
    expect(body).toContain("returning * into v_reflow_updated_period;");
    expect(body.indexOf("returning * into v_reflow_updated_period;")).toBeLessThan(
      body.indexOf("'contract_period_adjust'"),
    );

    for (const action of ["contract_period_void", "contract_period_adjust"]) {
      const actionPosition = body.indexOf(`'${action}'`);
      const eventWindow = body.slice(actionPosition, actionPosition + 1400);
      for (const key of [
        "'period_id'",
        "'refund_request_id'",
        "'reason'",
        "'before'",
        "'after'",
        "'status'",
        "'starts_at'",
        "'ends_at'",
      ]) {
        expect(eventWindow).toContain(key);
      }
      expect(eventWindow).not.toContain("p_metadata");
      expect(eventWindow).not.toContain("out_refund_no");
      expect(eventWindow).not.toContain("wechat_refund_id");
    }
  });

  test("rejects nullable command inputs before taking the order lock", async () => {
    const sql = await readMigration();
    const cases = [
      [
        "tenant_service_decide_acceptance",
        [
          "p_tenant_id is null",
          "p_service_order_id is null",
          "p_decision is null",
          "p_expected_work_order_version is null",
          "p_operator_employee_id is null",
        ],
      ],
      [
        "platform_service_confirm_overdue_acceptance",
        [
          "p_work_order_id is null",
          "p_expected_version is null",
          "p_operator_employee_id is null",
        ],
      ],
      [
        "platform_service_assign_work_order",
        [
          "p_work_order_id is null",
          "p_assignee_employee_id is null",
          "p_expected_version is null",
          "p_operator_employee_id is null",
        ],
      ],
      [
        "platform_service_transition_work_order",
        [
          "p_work_order_id is null",
          "p_to_status is null",
          "p_expected_version is null",
          "p_operator_employee_id is null",
        ],
      ],
      [
        "platform_service_request_refund_review",
        [
          "p_tenant_id is null",
          "p_order_id is null",
          "p_expected_version is null",
          "p_idempotency_key is null",
          "p_reason is null",
          "p_created_by_employee_id is null",
        ],
      ],
      [
        "platform_service_review_refund_request",
        [
          "p_refund_request_id is null",
          "p_decision is null",
          "p_expected_version is null",
          "p_operator_employee_id is null",
        ],
      ],
      [
        "platform_service_confirm_refund",
        [
          "p_refund_request_id is null",
          "p_service_order_id is null",
          "p_transaction_id is null",
          "p_out_trade_no is null",
          "p_payment_config_id is null",
          "p_payment_config_guard_version is null",
          "p_operator_employee_id is null",
        ],
      ],
    ] as const;

    for (const [functionName, guards] of cases) {
      const body = normalizeSql(extractFunctionBody(sql, functionName));
      const lockPosition = body.indexOf(lockCall);
      expect(lockPosition).toBeGreaterThan(-1);
      const guardBlock = body.slice(0, lockPosition);
      for (const guard of guards) expect(guardBlock).toContain(guard);
    }
  });
});
