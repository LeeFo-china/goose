import { describe, expect, test } from "bun:test";
import {
  extractConstraint,
  extractFunctionBody,
  extractFunctionDefinition,
  extractFunctionSignature,
  extractPreflight,
  migrationFile,
  normalizeSql,
  readMigration,
} from "./platform-service-access-migration-test-helpers";

const legacyTransitionMigrationFile = Bun.file(new URL(
  "../../../../supabase/migrations/20260804160000_create_platform_service_fulfillment_admin.sql",
  import.meta.url,
));
const expectServiceRoleRpcAcl = (
  sql: string,
  functionName: string,
  argumentTypes: string,
) => {
  const normalized = normalizeSql(sql);
  const reference = `public.${functionName}( ${argumentTypes} )`;
  for (const role of ["public", "anon", "authenticated"]) {
    expect(normalized).toContain(
      `revoke all on function ${reference} from ${role};`,
    );
    expect(normalized).not.toContain(
      `grant execute on function ${reference} to ${role};`,
    );
  }
  expect(normalized).toContain(
    `grant execute on function ${reference} to service_role;`,
  );
};

const canonicalizePeriodSequence = (sequence: string) =>
  normalizeSql(sequence)
    .replace(/acceptance_event\.created_at|reflow_period\.accepted_at/g, "accepted_at")
    .replace(/service_order\.created_at|reflow_order\.created_at/g, "order_created_at")
    .replace(/service_order\.order_no|reflow_order\.order_no/g, "order_no");
describe("platform service contract access migration", () => {
  test("creates tenant-safe contract and immutable period facts", async () => {
    expect(await migrationFile.exists()).toBe(true);
    const sql = await readMigration();

    expect(sql).toContain("CREATE TABLE public.tenant_service_contracts");
    expect(sql).toContain("CREATE TABLE public.tenant_service_contract_periods");
    expect(sql).toContain("ADD COLUMN source_trial_id uuid NULL");
    expect(sql).toContain(
      "ADD COLUMN service_access_terminated_at timestamptz NULL",
    );
    expect(sql).toContain("tenant_service_contracts_tenant_family_key");
    expect(sql).toContain("tenant_service_contracts_identity_key");
    expect(sql).toContain("tenant_service_contract_periods_order_key");
    expect(sql).toContain("tenant_service_contract_periods_identity_key");
    expect(sql).toContain(
      "tenant_service_contract_periods_contract_identity_fkey",
    );
    expect(sql).toContain(
      "tenant_service_contract_periods_order_identity_fkey",
    );
    expect(sql).toContain("tenant_service_contracts_last_period_fkey");
    expect(sql).toContain("original_starts_at");
    expect(sql).toContain("original_ends_at");
    expect(sql).toContain(
      "OLD.original_starts_at IS DISTINCT FROM NEW.original_starts_at",
    );
    expect(sql).toContain(
      "OLD.original_ends_at IS DISTINCT FROM NEW.original_ends_at",
    );
  });

  test("fails closed on invalid history before applying DDL", async () => {
    const sql = await readMigration();
    const normalized = normalizeSql(sql);
    const preflight = extractPreflight(sql);
    const normalizedPreflight = normalizeSql(preflight);
    const beginPosition = normalized.indexOf("begin;");
    const lockPosition = normalized.indexOf(
      "lock table public.tenant_service_orders",
    );
    const preflightPosition = normalized.indexOf(
      "-- historical invariant preflight",
    );
    const preflightEndPosition = normalized.indexOf("end; $$;", preflightPosition);
    const ddlPosition = normalized.indexOf(
      "alter table public.tenant_service_orders add column source_trial_id",
    );

    expect(lockPosition).toBeGreaterThan(beginPosition);
    expect(preflightPosition).toBeGreaterThan(-1);
    expect(preflightPosition).toBeGreaterThan(lockPosition);
    expect(ddlPosition).toBeGreaterThan(preflightEndPosition);
    const lockBlock = normalized.slice(lockPosition, preflightPosition);
    for (const table of [
      "tenant_service_orders",
      "tenant_service_work_orders",
      "tenant_service_acceptance_preparations",
      "tenant_service_work_order_events",
      "tenant_service_refund_requests",
    ]) {
      expect(lockBlock).toContain(`public.${table}`);
    }
    expect(lockBlock).toContain("in access exclusive mode;");
    expect(normalized.slice(beginPosition, ddlPosition)).not.toMatch(
      /\b(?:create|alter|drop)\s+(?:table|index|trigger|policy)\b/,
    );

    expect(normalizedPreflight).toContain(
      "refund_state_order.payment_status in ( 'refund_reviewing', 'refunding' )",
    );
    expect(normalizedPreflight).toContain(
      "active_refund.status in ('reviewing', 'approved')",
    );
    expect(normalizedPreflight).toContain(") <> 1");
    expect(normalizedPreflight).toContain(
      "service_order.service_status = work_order.status",
    );
    expect(normalizedPreflight).toContain(
      "acceptance.work_order_id = work_order.id",
    );
    expect(normalizedPreflight).toContain(
      "acceptance_event.from_status = 'awaiting_acceptance'",
    );
    expect(normalizedPreflight).toContain(
      "acceptance_event.to_status = 'accepted'",
    );
    expect(normalizedPreflight).toContain(
      "from public.tenant_service_work_order_events as invalid_acceptance_event",
    );
    expect(normalizedPreflight).toContain(
      "invalid_acceptance_event.from_status is distinct from 'awaiting_acceptance'",
    );
    expect(normalizedPreflight).toContain(
      "invalid_acceptance_event.to_status is distinct from 'accepted'",
    );
    expect(sql).toContain(
      "PLATFORM_SERVICE_ACCESS_PREFLIGHT_ACCEPTANCE_HISTORY_INVALID",
    );
    expect(sql).toContain(
      "PLATFORM_SERVICE_ACCESS_PREFLIGHT_REFUND_HISTORY_INVALID",
    );
    expect(sql).toContain(
      "PLATFORM_SERVICE_ACCESS_PREFLIGHT_LEGACY_REFUND_UNSUPPORTED",
    );
    expect(sql).toContain("Forward-only rollback/remediation");
    expect(sql).not.toMatch(/DROP\s+TABLE\s+public\.tenant_service_contract/i);
  });

  test("documents release-safe remediation for every preflight code", async () => {
    const sql = await readMigration();
    const header = normalizeSql(sql.slice(0, sql.indexOf("BEGIN;")));

    for (const code of [
      "PLATFORM_SERVICE_ACCESS_PREFLIGHT_PAID_HISTORY_INVALID",
      "PLATFORM_SERVICE_ACCESS_PREFLIGHT_ACCEPTANCE_HISTORY_INVALID",
      "PLATFORM_SERVICE_ACCESS_PREFLIGHT_REFUND_HISTORY_INVALID",
      "PLATFORM_SERVICE_ACCESS_PREFLIGHT_LEGACY_REFUND_UNSUPPORTED",
    ]) {
      expect(header).toContain(code.toLowerCase());
    }
    expect(header).toContain("not-yet-released migration");
    expect(header).toContain("versioned predecessor migration");
    expect(header).toContain("earlier timestamp");
    expect(header).toContain("manual dev/prod dml repair is prohibited");
  });

  test("allows complete controlled termination facts before a full refund", async () => {
    const sql = await readMigration();
    const accessCheck = normalizeSql(extractConstraint(
      sql,
      "tenant_service_orders_access_termination_fields_check",
    ));
    const reasonCheck = normalizeSql(extractConstraint(
      sql,
      "tenant_service_orders_access_termination_reason_check",
    ));

    expect(accessCheck).toContain(
      "service_access_terminated_at is null and service_access_termination_reason is null and service_access_terminated_by_employee_id is null",
    );
    expect(accessCheck).toContain(
      "service_access_terminated_at is not null and service_access_termination_reason is not null and service_access_terminated_by_employee_id is not null",
    );
    expect(accessCheck).toContain(
      "payment_status <> 'refunded' or service_access_terminated_at is not null",
    );
    expect(accessCheck).not.toContain(
      "payment_status <> 'refunded' and service_access_terminated_at is null",
    );
    expect(reasonCheck).toContain(
      "btrim(service_access_termination_reason) <> ''",
    );
    expect(reasonCheck).toContain(
      "char_length(service_access_termination_reason) <= 500",
    );
  });

  test("adds bounded access and active-contract indexes", async () => {
    const sql = await readMigration();

    for (const indexName of [
      "tenant_service_orders_paid_onboarding_access_idx",
      "tenant_service_contracts_tenant_status_end_idx",
      "tenant_service_contract_periods_tenant_active_idx",
      "tenant_service_contract_periods_contract_active_idx",
    ]) {
      expect(sql).toContain(indexName);
    }
    expect(sql).toContain("(tenant_id, paid_at DESC, id DESC)");
    expect(sql).toContain("service_access_terminated_at IS NULL");
    expect(sql).toContain("'refund_reviewing'");
    expect(sql).toContain("'partially_refunded'");
  });

  test("preserves payment exactly-once behavior and identifies paid onboarding", async () => {
    const sql = await readMigration();
    const functionName = "platform_service_confirm_payment";
    const paymentDefinition = extractFunctionDefinition(sql, functionName);
    const paymentSignature = normalizeSql(extractFunctionSignature(sql, functionName));
    const paymentBody = extractFunctionBody(sql, functionName);

    expect(paymentDefinition).toContain(
      "CREATE OR REPLACE FUNCTION public.platform_service_confirm_payment",
    );
    expect(paymentSignature).toContain(
      "create or replace function public.platform_service_confirm_payment( p_order_id uuid, p_transaction_id text, p_paid_amount_fen bigint, p_paid_at timestamptz, p_notification_id uuid, p_metadata jsonb default '{}'::jsonb )",
    );
    expect(paymentBody).toContain("FOR UPDATE");
    expect(paymentBody).toContain("SERVICE_PAYMENT_TRANSACTION_MISMATCH");
    expect(paymentBody).toContain("SERVICE_PAYMENT_AMOUNT_MISMATCH");
    expect(paymentBody).toContain("ON CONFLICT (service_order_id) DO NOTHING");
    expect(paymentBody).toContain("'access_mode', 'paid_onboarding'");
    expect(paymentBody).toContain("'idempotent', true");
    expect(paymentBody).toContain("'idempotent', false");
  });

  test("serializes acceptance and makes one renewable period per order", async () => {
    const sql = await readMigration();
    const acceptanceName = "tenant_service_decide_acceptance";
    const overdueName = "platform_service_confirm_overdue_acceptance";
    const helperName = "tenant_service_ensure_contract_period";
    const acceptanceDefinition = extractFunctionDefinition(sql, acceptanceName);
    const acceptanceSignature = normalizeSql(extractFunctionSignature(sql, acceptanceName));
    const acceptanceBody = extractFunctionBody(sql, acceptanceName);
    const overdueDefinition = extractFunctionDefinition(sql, overdueName);
    const overdueSignature = normalizeSql(extractFunctionSignature(sql, overdueName));
    const overdueBody = extractFunctionBody(sql, overdueName);
    const helperDefinition = extractFunctionDefinition(sql, helperName);
    const helperSignature = normalizeSql(extractFunctionSignature(sql, helperName));
    const helperBody = extractFunctionBody(sql, helperName);

    expect(acceptanceDefinition).toContain(
      "CREATE OR REPLACE FUNCTION public.tenant_service_decide_acceptance",
    );
    expect(acceptanceSignature).toContain(
      "create or replace function public.tenant_service_decide_acceptance( p_tenant_id uuid, p_service_order_id uuid, p_decision text, p_expected_work_order_version integer, p_operator_employee_id uuid, p_remark text default null, p_metadata jsonb default '{}'::jsonb )",
    );
    expect(acceptanceBody).toContain("pg_advisory_xact_lock");
    expect(acceptanceBody).toContain(
      "tenant_service_ensure_contract_period",
    );
    expect(acceptanceBody).toContain("'contract', to_jsonb(v_contract)");
    expect(acceptanceBody).toContain("'contract_period', to_jsonb(v_period)");
    expect(acceptanceBody).toContain("'contract', NULL");
    expect(acceptanceBody).toContain("'contract_period', NULL");
    expect(acceptanceBody).toContain("'idempotent', true");
    expect(acceptanceBody).toContain("'idempotent', false");
    expect(overdueDefinition).toContain(
      "CREATE OR REPLACE FUNCTION public.platform_service_confirm_overdue_acceptance",
    );
    expect(overdueSignature).toContain(
      "create or replace function public.platform_service_confirm_overdue_acceptance( p_work_order_id uuid, p_expected_version integer, p_operator_employee_id uuid, p_remark text default null, p_metadata jsonb default '{}'::jsonb )",
    );
    expect(overdueBody).toContain("pg_advisory_xact_lock");
    expect(overdueBody).toContain("tenant_service_ensure_contract_period");
    expect(helperDefinition).toContain(
      "CREATE OR REPLACE FUNCTION public.tenant_service_ensure_contract_period",
    );
    expect(helperSignature).toContain(
      "create or replace function public.tenant_service_ensure_contract_period( p_tenant_id uuid, p_service_order_id uuid, p_accepted_at timestamptz )",
    );
    expect(helperBody).toContain("GREATEST");
    expect(helperBody).toContain("make_interval(years => v_order.term_years)");
    expect(helperBody).toContain("ON CONFLICT (service_order_id) DO NOTHING");
  });

  test("requires dedicated RPCs for acceptance without changing other transitions", async () => {
    const sql = await readMigration();
    const legacySql = await legacyTransitionMigrationFile.text();
    const functionName = "platform_service_transition_work_order";
    const transitionSignature = normalizeSql(extractFunctionSignature(sql, functionName));
    const transitionBody = normalizeSql(extractFunctionBody(sql, functionName));
    const canonicalizeBody = (body: string) => normalizeSql(body)
      .replace(/\(\s+/g, "(")
      .replace(/\s+\)/g, ")");
    const currentSuffix = canonicalizeBody(transitionBody).slice(
      canonicalizeBody(transitionBody).indexOf(
        "if v_work_order.version <> p_expected_version then",
      ),
    );
    const legacyBody = canonicalizeBody(
      extractFunctionBody(legacySql, functionName),
    );
    const legacySuffix = legacyBody.slice(legacyBody.indexOf(
      "if v_work_order.version <> p_expected_version then",
    ));
    const reconstructedLegacySuffix = currentSuffix
      .replace(
        "if p_to_status = 'accepted' then return jsonb_build_object('work_order', null, 'order', null, 'error_code', 'service_acceptance_dedicated_rpc_required'); end if; ",
        "",
      )
      .replace(
        "(v_from_status = 'awaiting_acceptance' and p_to_status = 'rectifying')",
        "(v_from_status = 'awaiting_acceptance' and p_to_status in ('accepted', 'rectifying'))",
      );

    expect(transitionSignature).toContain(
      "create or replace function public.platform_service_transition_work_order( p_work_order_id uuid, p_to_status text, p_expected_version integer, p_operator_employee_id uuid, p_remark text default null, p_metadata jsonb default '{}'::jsonb )",
    );
    expect(transitionBody).toContain(
      "if p_to_status = 'accepted' then return jsonb_build_object( 'work_order', null, 'order', null, 'error_code', 'service_acceptance_dedicated_rpc_required' ); end if;",
    );
    expect(reconstructedLegacySuffix).toBe(legacySuffix);
  });

  test("finalizes only bound full refunds and recomputes later periods", async () => {
    const sql = await readMigration();
    const functionName = "platform_service_confirm_refund";
    const refundDefinition = extractFunctionDefinition(sql, functionName);
    const refundSignature = normalizeSql(extractFunctionSignature(sql, functionName));
    const refundBody = extractFunctionBody(sql, functionName);

    expect(refundDefinition).toContain(
      "CREATE OR REPLACE FUNCTION public.platform_service_confirm_refund",
    );
    expect(refundSignature).toContain(
      "create or replace function public.platform_service_confirm_refund( p_refund_request_id uuid, p_service_order_id uuid, p_transaction_id text, p_out_trade_no text, p_payment_config_id uuid, p_payment_config_guard_version integer, p_out_refund_no text, p_wechat_refund_id text, p_refund_amount_fen bigint, p_refunded_at timestamptz, p_operator_employee_id uuid, p_metadata jsonb default '{}'::jsonb )",
    );
    expect(refundBody).toContain("SERVICE_REFUND_PARTIAL_NOT_SUPPORTED");
    expect(refundBody).toContain("SERVICE_REFUND_AMOUNT_MISMATCH");
    expect(refundBody).toContain("SERVICE_REFUND_IDEMPOTENCY_CONFLICT");
    expect(refundBody).toContain("v_refund.service_order_id");
    expect(refundBody).toContain("tenant_id = v_refund.tenant_id");
    expect(refundBody).toContain("refund_request_id = v_refund.id");
    expect(refundBody).toContain("status = 'voided'");
    expect(refundBody).toContain("status = 'adjusted'");
    expect(refundBody).toContain(
      "service_access_terminated_at = p_refunded_at",
    );
    expect(refundBody).toContain("payment_status = 'refunded'");
    expect(refundBody).toContain("'idempotent', true");
    expect(refundBody).toContain("'idempotent', false");
  });

  test("reflows only periods after the refunded period in stable original order", async () => {
    const sql = await readMigration();
    const refundBody = normalizeSql(
      extractFunctionBody(sql, "platform_service_confirm_refund"),
    );
    const backfillStart = sql.indexOf("-- Backfill already accepted orders");
    const backfillEnd = sql.indexOf("\n$$;", backfillStart);
    const backfill = backfillStart < 0 || backfillEnd < 0
      ? ""
      : sql.slice(backfillStart, backfillEnd + 4);
    const normalizedBackfill = normalizeSql(backfill);
    const backfillSequence = backfill.match(
      /acceptance_event\.created_at ASC,\s*service_order\.created_at ASC,\s*service_order\.order_no ASC/,
    )?.[0] ?? "";
    const refundSequence = extractFunctionBody(sql, "platform_service_confirm_refund").match(
      /reflow_period\.accepted_at ASC,\s*reflow_order\.created_at ASC,\s*reflow_order\.order_no ASC/,
    )?.[0] ?? "";

    expect(canonicalizePeriodSequence(backfillSequence)).toBe(
      "accepted_at asc, order_created_at asc, order_no asc",
    );
    expect(canonicalizePeriodSequence(refundSequence)).toBe(
      canonicalizePeriodSequence(backfillSequence),
    );
    expect(normalizedBackfill).toContain(
      "work_order_event.from_status = 'awaiting_acceptance'",
    );
    expect(normalizedBackfill).toContain(
      "work_order_event.to_status = 'accepted'",
    );
    expect(refundBody).toContain(
      "join public.tenant_service_orders as reflow_order on reflow_order.id = reflow_period.service_order_id and reflow_order.tenant_id = reflow_period.tenant_id",
    );
    expect(refundBody).toContain(
      "( reflow_period.accepted_at, reflow_order.created_at, reflow_order.order_no ) > ( v_period.accepted_at, v_order.created_at, v_order.order_no )",
    );
    expect(refundBody).toContain(
      "where id = v_reflow_period.id and tenant_id = v_refund.tenant_id",
    );
    expect(refundBody).not.toContain("order by accepted_at asc, id asc");
  });

  test("returns explicit JSON nulls for a preaccept refund", async () => {
    const sql = await readMigration();
    const refundBody = extractFunctionBody(sql, "platform_service_confirm_refund");

    expect(refundBody.match(
      /'contract', CASE\s+WHEN v_has_period THEN to_jsonb\(v_contract\)\s+ELSE NULL\s+END/g,
    ) ?? []).toHaveLength(2);
    expect(refundBody.match(
      /'contract_period', CASE\s+WHEN v_has_period THEN to_jsonb\(v_period\)\s+ELSE NULL\s+END/g,
    ) ?? []).toHaveLength(2);
  });

  test("stores bounded refund execution facts without exposing caller metadata", async () => {
    const sql = await readMigration();
    const refundBody = extractFunctionBody(sql, "platform_service_confirm_refund");

    expect(sql).toContain("ADD COLUMN out_refund_no text NULL");
    expect(sql).toContain("ADD COLUMN wechat_refund_id text NULL");
    expect(sql).toContain("ADD COLUMN refund_amount_fen bigint NULL");
    expect(sql).toContain("ADD COLUMN refunded_at timestamptz NULL");
    expect(sql).toContain("tenant_service_refund_requests_out_refund_unique_idx");
    expect(sql).toContain("tenant_service_refund_requests_wechat_refund_unique_idx");
    expect(refundBody).toContain(
      "pg_column_size(coalesce(p_metadata, '{}'::jsonb)) > 8192",
    );
    expect(refundBody).not.toContain("'metadata', p_metadata");
  });

  test("forces RLS and exposes mutation RPCs only to service_role", async () => {
    const sql = await readMigration();
    const normalized = normalizeSql(sql);

    for (const table of [
      "tenant_service_contracts",
      "tenant_service_contract_periods",
    ]) {
      expect(sql).toContain(
        `ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`,
      );
      expect(sql).toContain(
        `ALTER TABLE public.${table} FORCE ROW LEVEL SECURITY`,
      );
      expect(sql).toContain(`CREATE POLICY ${table}_self_read`);
    }

    for (const [functionName, argumentTypes] of [
      ["platform_service_confirm_payment", "uuid, text, bigint, timestamptz, uuid, jsonb"],
      ["tenant_service_decide_acceptance", "uuid, uuid, text, integer, uuid, text, jsonb"],
      ["platform_service_confirm_overdue_acceptance", "uuid, integer, uuid, text, jsonb"],
      ["platform_service_assign_work_order", "uuid, uuid, integer, uuid, text, jsonb"],
      ["platform_service_transition_work_order", "uuid, text, integer, uuid, text, jsonb"],
      ["platform_service_request_refund_review", "uuid, uuid, integer, uuid, text, uuid"],
      ["platform_service_review_refund_request", "uuid, text, integer, uuid, text"],
      ["platform_service_confirm_refund", "uuid, uuid, text, text, uuid, integer, text, text, bigint, timestamptz, uuid, jsonb"],
    ] as const) {
      expectServiceRoleRpcAcl(sql, functionName, argumentTypes);
    }
    const helperReference =
      "public.tenant_service_ensure_contract_period( uuid, uuid, timestamptz )";
    for (const role of ["public", "anon", "authenticated", "service_role"]) {
      expect(normalized).toContain(
        `revoke all on function ${helperReference} from ${role};`,
      );
    }
    expect(normalized).not.toContain(
      `grant execute on function ${helperReference}`,
    );
    expect(normalized).toContain(
      "revoke all on table public.tenant_service_contracts from service_role; grant select on table public.tenant_service_contracts to service_role;",
    );
    expect(normalized).toContain(
      "revoke all on table public.tenant_service_contract_periods from service_role; grant select on table public.tenant_service_contract_periods to service_role;",
    );
    expect(normalized).not.toMatch(
      /create policy tenant_service_contracts_[^;]+for (insert|update|delete)/,
    );
    expect(normalized).not.toMatch(
      /create policy tenant_service_contract_periods_[^;]+for (insert|update|delete)/,
    );
  });
});
