import { describe, expect, test } from "bun:test";

const migrationPath = new URL(
  "../../../../supabase/migrations/20260810190000_create_platform_service_contract_access.sql",
  import.meta.url,
);
const migrationFile = Bun.file(migrationPath);
const readMigration = async () =>
  (await migrationFile.exists()) ? migrationFile.text() : "";

const normalizeSql = (sql: string) =>
  sql.replace(/\s+/g, " ").trim().toLowerCase();

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
    const preflightPosition = normalized.indexOf(
      "platform_service_access_preflight_paid_history_invalid",
    );
    const ddlPosition = normalized.indexOf(
      "alter table public.tenant_service_orders add column source_trial_id",
    );

    expect(preflightPosition).toBeGreaterThan(-1);
    expect(ddlPosition).toBeGreaterThan(preflightPosition);
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
    const normalized = normalizeSql(sql);

    expect(sql).toContain(
      "CREATE OR REPLACE FUNCTION public.platform_service_confirm_payment",
    );
    expect(normalized).toContain(
      "create or replace function public.platform_service_confirm_payment( p_order_id uuid, p_transaction_id text, p_paid_amount_fen bigint, p_paid_at timestamptz, p_notification_id uuid, p_metadata jsonb default '{}'::jsonb )",
    );
    expect(sql).toContain("FOR UPDATE");
    expect(sql).toContain("SERVICE_PAYMENT_TRANSACTION_MISMATCH");
    expect(sql).toContain("SERVICE_PAYMENT_AMOUNT_MISMATCH");
    expect(sql).toContain("ON CONFLICT (service_order_id) DO NOTHING");
    expect(sql).toContain("'access_mode', 'paid_onboarding'");
    expect(sql).toContain("'idempotent', true");
    expect(sql).toContain("'idempotent', false");
  });

  test("serializes acceptance and makes one renewable period per order", async () => {
    const sql = await readMigration();
    const normalized = normalizeSql(sql);

    expect(sql).toContain(
      "CREATE OR REPLACE FUNCTION public.tenant_service_decide_acceptance",
    );
    expect(normalized).toContain(
      "create or replace function public.tenant_service_decide_acceptance( p_tenant_id uuid, p_service_order_id uuid, p_decision text, p_expected_work_order_version integer, p_operator_employee_id uuid, p_remark text default null, p_metadata jsonb default '{}'::jsonb )",
    );
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toContain("GREATEST");
    expect(sql).toContain("make_interval(years => v_order.term_years)");
    expect(sql).toContain("ON CONFLICT (service_order_id) DO NOTHING");
    expect(sql).toContain("'contract', to_jsonb(v_contract)");
    expect(sql).toContain("'contract_period', to_jsonb(v_period)");
    expect(sql).toContain("'contract', NULL");
    expect(sql).toContain("'contract_period', NULL");
    expect(sql).toContain("'idempotent', true");
    expect(sql).toContain("'idempotent', false");
    expect(sql).toContain(
      "CREATE OR REPLACE FUNCTION public.platform_service_confirm_overdue_acceptance",
    );
    expect(normalized).toContain(
      "create or replace function public.platform_service_confirm_overdue_acceptance( p_work_order_id uuid, p_expected_version integer, p_operator_employee_id uuid, p_remark text default null, p_metadata jsonb default '{}'::jsonb )",
    );
    expect(sql).toContain(
      "CREATE OR REPLACE FUNCTION public.tenant_service_ensure_contract_period",
    );
    expect(normalized).toContain(
      "revoke all on function public.tenant_service_ensure_contract_period( uuid, uuid, timestamptz ) from public;",
    );
    expect(normalized).toContain(
      "revoke all on function public.tenant_service_ensure_contract_period( uuid, uuid, timestamptz ) from service_role;",
    );
  });

  test("finalizes only bound full refunds and recomputes later periods", async () => {
    const sql = await readMigration();
    const normalized = normalizeSql(sql);

    expect(sql).toContain(
      "CREATE OR REPLACE FUNCTION public.platform_service_confirm_refund",
    );
    expect(normalized).toContain(
      "create or replace function public.platform_service_confirm_refund( p_refund_request_id uuid, p_out_refund_no text, p_wechat_refund_id text, p_refund_amount_fen bigint, p_refunded_at timestamptz, p_operator_employee_id uuid, p_metadata jsonb default '{}'::jsonb )",
    );
    expect(sql).toContain("p_refund_request_id uuid");
    expect(sql).toContain("p_out_refund_no text");
    expect(sql).toContain("p_wechat_refund_id text");
    expect(sql).toContain("p_refund_amount_fen bigint");
    expect(sql).toContain("SERVICE_REFUND_PARTIAL_NOT_SUPPORTED");
    expect(sql).toContain("SERVICE_REFUND_AMOUNT_MISMATCH");
    expect(sql).toContain("SERVICE_REFUND_IDEMPOTENCY_CONFLICT");
    expect(sql).toContain("v_refund.service_order_id");
    expect(sql).toContain("tenant_id = v_refund.tenant_id");
    expect(sql).toContain("refund_request_id = v_refund.id");
    expect(sql).toContain("status = 'voided'");
    expect(sql).toContain("status = 'adjusted'");
    expect(sql).toContain("ORDER BY accepted_at ASC, id ASC");
    expect(sql).toContain("service_access_terminated_at = p_refunded_at");
    expect(sql).toContain("payment_status = 'refunded'");
    expect(sql).toContain("'idempotent', true");
    expect(sql).toContain("'idempotent', false");
  });

  test("stores bounded refund execution facts without exposing caller metadata", async () => {
    const sql = await readMigration();

    expect(sql).toContain("ADD COLUMN out_refund_no text NULL");
    expect(sql).toContain("ADD COLUMN wechat_refund_id text NULL");
    expect(sql).toContain("ADD COLUMN refund_amount_fen bigint NULL");
    expect(sql).toContain("ADD COLUMN refunded_at timestamptz NULL");
    expect(sql).toContain("tenant_service_refund_requests_out_refund_unique_idx");
    expect(sql).toContain("tenant_service_refund_requests_wechat_refund_unique_idx");
    expect(sql).toContain("pg_column_size(p_metadata) > 8192");
    expect(sql).not.toContain("'metadata', p_metadata");
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

    for (const functionName of [
      "platform_service_confirm_payment",
      "tenant_service_decide_acceptance",
      "platform_service_confirm_refund",
    ]) {
      expect(normalized).toContain(
        `revoke all on function public.${functionName}`,
      );
    }
    expect(normalized).toContain("from public;");
    expect(normalized).toContain("from anon;");
    expect(normalized).toContain("from authenticated;");
    expect(normalized).toContain("to service_role;");
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
