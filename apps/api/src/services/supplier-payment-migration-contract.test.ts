import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

const migrationUrl = new URL(
  "../../../../supabase/migrations/20260731110000_create_supplier_payment_requests.sql",
  import.meta.url,
);
const migration = existsSync(migrationUrl)
  ? readFileSync(migrationUrl, "utf8")
  : "";
const financeMigration = readFileSync(
  new URL(
    "../../../../supabase/migrations/20260616170000_decoration_finance_phase1.sql",
    import.meta.url,
  ),
  "utf8",
);

function table(name: string) {
  const start = migration.indexOf(`CREATE TABLE public.${name}`);
  if (start < 0) return "";
  const end = migration.indexOf("\n);", start);
  return end < 0 ? migration.slice(start) : migration.slice(start, end + 3);
}

function fn(name: string) {
  const start = migration.search(
    new RegExp(`CREATE(?: OR REPLACE)? FUNCTION public\\.${name}\\s*\\(`),
  );
  if (start < 0) return "";
  const end = migration.indexOf("\n$$;", start);
  return end < 0 ? migration.slice(start) : migration.slice(start, end + 4);
}

function contracts(source: string, patterns: readonly RegExp[]) {
  for (const pattern of patterns) expect(source).toMatch(pattern);
}

describe("supplier payment data migration contract", () => {
  test("creates tenant-safe payment request and payment facts", () => {
    const request = table("supplier_payment_requests");
    const requestAllocation = table(
      "supplier_payment_request_allocations",
    );
    const payment = table("supplier_payments");
    const paymentAllocation = table("supplier_payment_allocations");

    contracts(request, [
      /id uuid PRIMARY KEY/,
      /tenant_id uuid NOT NULL/,
      /project_id uuid NOT NULL/,
      /tenant_supplier_id uuid NOT NULL/,
      /supplier_id uuid NOT NULL/,
      /request_no text NOT NULL/,
      /status text NOT NULL DEFAULT 'draft'/,
      /currency char\(3\) NOT NULL DEFAULT 'CNY'/,
      /requested_amount numeric\(18, 2\) NOT NULL DEFAULT 0/,
      /paid_amount numeric\(18, 2\) NOT NULL DEFAULT 0/,
      /version integer NOT NULL DEFAULT 1/,
      /submitted_by_employee_id uuid NULL/,
      /reviewed_by_employee_id uuid NULL/,
      /cancelled_by_employee_id uuid NULL/,
      /closed_by_employee_id uuid NULL/,
      /FOREIGN KEY \(project_id, tenant_id\)[\s\S]*projects\(id, tenant_id\)/,
      /FOREIGN KEY \(tenant_supplier_id, tenant_id, supplier_id\)[\s\S]*tenant_suppliers\(id, tenant_id, supplier_id\)/,
      /UNIQUE \(id, tenant_id\)/,
      /UNIQUE \(tenant_id, request_no\)/,
      /status IN \([\s\S]*'draft'[\s\S]*'pending_approval'[\s\S]*'approved'[\s\S]*'partially_paid'[\s\S]*'paid'[\s\S]*'rejected'[\s\S]*'cancelled'[\s\S]*'closed'[\s\S]*\)/,
      /requested_amount >= 0[\s\S]*paid_amount >= 0[\s\S]*paid_amount <= requested_amount/,
      /supplier_payment_requests_state_audit_check/,
    ]);
    contracts(requestAllocation, [
      /payment_request_id uuid NOT NULL/,
      /payable_event_id uuid NOT NULL/,
      /requested_amount numeric\(18, 2\) NOT NULL/,
      /paid_amount numeric\(18, 2\) NOT NULL DEFAULT 0/,
      /FOREIGN KEY \(payment_request_id, tenant_id\)[\s\S]*supplier_payment_requests\(\s*id,\s*tenant_id\s*\)/,
      /FOREIGN KEY \(payable_event_id, tenant_id\)[\s\S]*supplier_payable_events\(\s*id,\s*tenant_id\s*\)/,
      /UNIQUE \(payment_request_id, payable_event_id\)/,
      /requested_amount > 0[\s\S]*paid_amount >= 0[\s\S]*paid_amount <= requested_amount/,
    ]);
    contracts(payment, [
      /payment_request_id uuid NOT NULL/,
      /payment_no text NOT NULL/,
      /currency char\(3\) NOT NULL DEFAULT 'CNY'/,
      /amount numeric\(18, 2\) NOT NULL/,
      /payment_method text NOT NULL/,
      /payment_reference text NOT NULL/,
      /paid_at timestamptz NOT NULL/,
      /evidence_images jsonb NOT NULL/,
      /confirmed_by_employee_id uuid NOT NULL/,
      /idempotency_key text NOT NULL/,
      /FOREIGN KEY \([\s\S]*payment_request_id,[\s\S]*tenant_id,[\s\S]*project_id,[\s\S]*tenant_supplier_id,[\s\S]*supplier_id,[\s\S]*currency[\s\S]*supplier_payment_requests/,
      /payment_method IN \(\s*'bank_transfer',\s*'wechat',\s*'alipay',\s*'cash',\s*'other'\s*\)/,
      /jsonb_typeof\(evidence_images\) = 'array'/,
      /jsonb_array_length\(evidence_images\) BETWEEN 1 AND 9/,
      /UNIQUE \(tenant_id, payment_no\)/,
      /UNIQUE \(tenant_id, idempotency_key\)/,
    ]);
    contracts(paymentAllocation, [
      /supplier_payment_id uuid NOT NULL/,
      /payment_request_allocation_id uuid NOT NULL/,
      /payable_event_id uuid NOT NULL/,
      /amount numeric\(18, 2\) NOT NULL/,
      /FOREIGN KEY \(supplier_payment_id, tenant_id\)[\s\S]*supplier_payments\(id, tenant_id\)/,
      /FOREIGN KEY \(\s*payment_request_allocation_id,\s*tenant_id,\s*payable_event_id\s*\)[\s\S]*supplier_payment_request_allocations/,
      /UNIQUE \(supplier_payment_id, payment_request_allocation_id\)/,
      /CHECK \(amount > 0\)/,
    ]);
  });

  test("keeps writes private and facts append-only behind forced RLS", () => {
    const guard = fn("prevent_supplier_payment_fact_mutation");
    contracts(guard, [
      /RETURNS trigger/,
      /TG_OP IN \('UPDATE', 'DELETE'\)/,
      /SUPPLIER_PAYMENT_FACT_IMMUTABLE/,
      /SET search_path = pg_catalog, public/,
    ]);
    for (const name of [
      "supplier_payment_requests",
      "supplier_payment_request_allocations",
      "supplier_payments",
      "supplier_payment_allocations",
    ]) {
      expect(migration).toContain(
        `ALTER TABLE public.${name} ENABLE ROW LEVEL SECURITY;`,
      );
      expect(migration).toContain(
        `ALTER TABLE public.${name} FORCE ROW LEVEL SECURITY;`,
      );
    }
    for (const name of ["supplier_payments", "supplier_payment_allocations"]) {
      expect(migration).toMatch(new RegExp(
        `CREATE TRIGGER ${name}_immutable[\\s\\S]*BEFORE UPDATE OR DELETE` +
          `[\\s\\S]*ON public\\.${name}[\\s\\S]*prevent_supplier_payment_fact_mutation`,
      ));
    }
    contracts(fn("require_supplier_payment_command_context"), [
      /current_setting\('app\.supplier_payment_command', true\)/,
      /SUPPLIER_PAYMENT_COMMAND_REQUIRED/,
    ]);
    for (const name of [
      "supplier_payment_requests",
      "supplier_payment_request_allocations",
    ]) {
      expect(migration).toMatch(new RegExp(
        `CREATE TRIGGER ${name}_command_only[\\s\\S]*` +
          `ON public\\.${name}[\\s\\S]*` +
          `require_supplier_payment_command_context`,
      ));
    }
    for (const name of [
      "save_supplier_payment_request_draft",
      "submit_supplier_payment_request",
      "review_supplier_payment_request",
      "cancel_supplier_payment_request",
      "close_supplier_payment_request",
      "confirm_supplier_payment",
    ]) {
      expect(fn(name)).toMatch(
        /set_config\('app\.supplier_payment_command', 'on', true\)/,
      );
    }
    expect(migration).toMatch(
      /REVOKE ALL ON TABLE[\s\S]*supplier_payment_requests[\s\S]*supplier_payment_request_allocations[\s\S]*supplier_payments[\s\S]*supplier_payment_allocations[\s\S]*FROM PUBLIC, anon, authenticated, service_role/,
    );
    expect(migration).toMatch(
      /GRANT SELECT ON TABLE[\s\S]*supplier_payment_requests[\s\S]*supplier_payment_request_allocations[\s\S]*supplier_payments[\s\S]*supplier_payment_allocations[\s\S]*TO service_role/,
    );
    expect(migration).not.toMatch(
      /GRANT [^;]*(?:INSERT|UPDATE|DELETE|TRUNCATE)[^;]*ON TABLE[^;]*supplier_payment/,
    );
  });

  test("extends the existing ledgers without duplicating project cost", () => {
    contracts(migration, [
      /DROP CONSTRAINT finance_ledger_entries_entry_type_check/,
      /finance_ledger_entries_entry_type_check[\s\S]*'project_payment'[\s\S]*'expense_settlement'[\s\S]*'refund'[\s\S]*'adjustment'[\s\S]*'supplier_payment'/,
      /ALTER TABLE public\.finance_ledger_entries[\s\S]*ALTER COLUMN amount TYPE numeric\(18, 2\)/,
      /supplier_command_events_resource_type_check[\s\S]*'supplier_payment_request'[\s\S]*'supplier_payment'/,
    ]);
    expect(financeMigration).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS finance_ledger_entries_source_unique_idx[\s\S]*tenant_id, source_type, source_id, entry_type/,
    );
    const paymentCommand = fn("confirm_supplier_payment");
    expect(paymentCommand).toMatch(
      /INSERT INTO public\.finance_ledger_entries[\s\S]*'out'[\s\S]*'supplier_payment'[\s\S]*'supplier_payment'/,
    );
    expect(paymentCommand).not.toMatch(/INSERT INTO public\.project_cost_events/);
  });

  test("seeds five tenant administrator permissions", () => {
    for (const permission of [
      "supplier.payable.view",
      "supplier.payment-request.view",
      "supplier.payment-request.manage",
      "supplier.payment-request.approve",
      "supplier.payment-request.pay",
    ]) {
      expect(migration).toContain(`'${permission}'`);
    }
    expect(migration).toMatch(
      /WHERE roles\.code = 'system_admin'[\s\S]*roles\.tenant_id IS NOT NULL/,
    );
  });

  test("adds bounded set-based queries with stable pagination", () => {
    const listFunctions = [
      "list_supplier_payables",
      "list_supplier_payment_requests",
      "list_supplier_payment_request_payments",
    ] as const;
    for (const name of listFunctions) {
      const query = fn(name);
      contracts(query, [
        /p_page integer DEFAULT 1/,
        /p_page_size integer DEFAULT 20/,
        /p_page IS NULL/,
        /p_page_size IS NULL/,
        /p_page < 1/,
        /p_page_size NOT BETWEEN 1 AND 100/,
        /COUNT\(\*\) OVER \(\)/,
        /ORDER BY[\s\S]*id DESC/,
        /LIMIT p_page_size/,
        /OFFSET \(p_page - 1\) \* p_page_size/,
        /SECURITY DEFINER/,
        /SET search_path = pg_catalog, public/,
      ]);
    }
    contracts(fn("get_supplier_payment_request_detail"), [
      /supplier_payment_requests/,
      /supplier_payment_request_allocations/,
      /jsonb_agg/,
    ]);
    contracts(fn("get_supplier_purchase_order_financial_summary"), [
      /project_cost_events/,
      /supplier_payable_events/,
      /supplier_payment_allocations/,
      /supplier_purchase_order_id/,
    ]);
    expect(migration).not.toMatch(/\bLOOP\b/);
  });

  test("adds indexes for payable, request, allocation, payment and PO reads", () => {
    for (const index of [
      "supplier_payable_events_tenant_status_query_idx",
      "supplier_payment_requests_tenant_status_updated_idx",
      "supplier_payment_requests_tenant_project_supplier_updated_idx",
      "supplier_payment_request_allocations_active_payable_idx",
      "supplier_payment_request_allocations_request_idx",
      "supplier_payments_tenant_request_paid_idx",
      "supplier_payment_allocations_payable_idx",
      "supplier_payment_allocations_payment_idx",
      "supplier_payable_events_order_summary_idx",
    ]) {
      expect(migration).toContain(`CREATE INDEX ${index}`);
    }
  });

  test("documents a forward-only compensating rollback", () => {
    expect(migration).toMatch(
      /^-- Rollback:[\s\S]*forward migration[\s\S]*stop writes[\s\S]*compensat[\s\S]*must not DROP/i,
    );
  });
});
