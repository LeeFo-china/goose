import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

const migrationUrl = new URL(
  "../../../../supabase/migrations/20260731100000_create_supplier_cost_payable_facts.sql",
  import.meta.url,
);
const migration = existsSync(migrationUrl)
  ? readFileSync(migrationUrl, "utf8")
  : "";
const previousGuardMigration = readFileSync(
  new URL(
    "../../../../supabase/migrations/20260729191000_fix_supplier_purchase_order_transitions.sql",
    import.meta.url,
  ),
  "utf8",
);

function contracts(source: string, patterns: readonly RegExp[]) {
  for (const pattern of patterns) expect(source).toMatch(pattern);
}

function ordered(source: string, patterns: readonly RegExp[]) {
  let cursor = 0;
  for (const pattern of patterns) {
    const match = pattern.exec(source.slice(cursor));
    expect(match, `missing ordered contract ${pattern}`).not.toBeNull();
    cursor += (match?.index ?? 0) + (match?.[0].length ?? 0);
  }
}

function sqlFunctionFrom(source: string, schema: string, name: string) {
  const start = source.search(
    new RegExp(
      `CREATE (?:OR REPLACE )?FUNCTION ${schema}\\.${name}\\s*\\(`,
    ),
  );
  if (start < 0) return "";
  const end = source.indexOf("\n$$;", start);
  return end < 0 ? source.slice(start) : source.slice(start, end + 4);
}

function sqlFunction(schema: string, name: string) {
  return sqlFunctionFrom(migration, schema, name);
}

function sqlTable(name: string) {
  const start = migration.indexOf(`CREATE TABLE public.${name}`);
  if (start < 0) return "";
  const end = migration.indexOf("\n);", start);
  return end < 0 ? migration.slice(start) : migration.slice(start, end + 3);
}

function aclStatement(prefix: string, suffix: string) {
  const start = migration.indexOf(prefix);
  if (start < 0) return "";
  const end = migration.indexOf(suffix, start);
  return end < 0
    ? migration.slice(start)
    : migration.slice(start, end + suffix.length);
}

describe("supplier cost and payable migration contract", () => {
  test("adds immutable tenant-safe cost and payable facts", () => {
    for (const table of ["project_cost_events", "supplier_payable_events"]) {
      const definition = sqlTable(table);
      expect(definition).not.toBe("");
      contracts(definition, [
        /id uuid PRIMARY KEY DEFAULT gen_random_uuid\(\)/,
        /tenant_id uuid NOT NULL/,
        /project_id uuid NOT NULL/,
        /cost_category_id uuid NOT NULL/,
        /tenant_supplier_id uuid NOT NULL/,
        /supplier_id uuid NOT NULL/,
        /supplier_purchase_order_id uuid NOT NULL/,
        /supplier_purchase_order_item_id uuid NOT NULL/,
        /supplier_purchase_order_receipt_id uuid NOT NULL/,
        /supplier_purchase_order_receipt_item_id uuid NOT NULL/,
        /purchase_requisition_id uuid NULL/,
        /source_type text NOT NULL DEFAULT\s*'supplier_purchase_receipt_item'/,
        /source_id uuid NOT NULL/,
        /currency char\(3\) NOT NULL DEFAULT 'CNY'/,
        /amount numeric\(18, 2\) NOT NULL/,
        /accepted_quantity numeric\(18, 4\) NOT NULL/,
        /FOREIGN KEY \(project_id, tenant_id\)[\s\S]*projects\(id, tenant_id\)/,
        /FOREIGN KEY \(cost_category_id, tenant_id\)[\s\S]*finance_cost_categories\(id, tenant_id\)/,
        /FOREIGN KEY \(tenant_supplier_id, tenant_id, supplier_id\)[\s\S]*tenant_suppliers\(id, tenant_id, supplier_id\)/,
        /FOREIGN KEY \(supplier_purchase_order_id, tenant_id, supplier_id\)[\s\S]*supplier_purchase_orders\(id, tenant_id, supplier_id\)/,
        /FOREIGN KEY \(\s*supplier_purchase_order_item_id,\s*tenant_id,\s*supplier_purchase_order_id\s*\)[\s\S]*supplier_purchase_order_items/,
        /FOREIGN KEY \(\s*supplier_purchase_order_receipt_id,\s*tenant_id,\s*supplier_purchase_order_id\s*\)[\s\S]*supplier_purchase_order_receipts/,
        /FOREIGN KEY \([\s\S]*supplier_purchase_order_receipt_item_id,[\s\S]*tenant_id,[\s\S]*supplier_purchase_order_receipt_id,[\s\S]*supplier_purchase_order_id,[\s\S]*supplier_purchase_order_item_id[\s\S]*supplier_purchase_order_receipt_items/,
        /FOREIGN KEY \(purchase_requisition_id, tenant_id\)[\s\S]*supplier_purchase_requisitions\(id, tenant_id\)/,
        /UNIQUE \(tenant_id, source_type, source_id\)/,
        /CHECK \(source_type = 'supplier_purchase_receipt_item'\)/,
        /CHECK \(source_id = supplier_purchase_order_receipt_item_id\)/,
        /CHECK \(currency = 'CNY'\)/,
        /CHECK \(amount >= 0\)/,
        /CHECK \(accepted_quantity > 0\)/,
      ]);
      expect(migration).toContain(
        `ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;`,
      );
      expect(migration).toContain(
        `ALTER TABLE public.${table} FORCE ROW LEVEL SECURITY;`,
      );
    }
    contracts(sqlTable("supplier_payable_events"), [
      /occurred_at timestamptz NOT NULL/,
      /due_at timestamptz NOT NULL/,
      /invoice_required_before_payment boolean NOT NULL/,
      /CHECK \(due_at >= occurred_at\)/,
    ]);
    contracts(migration, [
      /ADD CONSTRAINT supplier_purchase_order_receipt_items_id_tenant_receipt_order_item_key[\s\S]*UNIQUE \(\s*id,\s*tenant_id,\s*receipt_id,\s*supplier_purchase_order_id,\s*supplier_purchase_order_item_id\s*\)/,
    ]);
  });

  test("adds commercial snapshots, line categories, and consumed commitments", () => {
    contracts(migration, [
      /ALTER TABLE public\.supplier_purchase_orders[\s\S]*ADD COLUMN settlement_term_days_snapshot integer/,
      /ALTER TABLE public\.supplier_purchase_orders[\s\S]*ADD COLUMN invoice_required_before_payment_snapshot boolean/,
      /ALTER TABLE public\.supplier_purchase_orders[\s\S]*ADD COLUMN commercial_snapshot_source text/,
      /supplier_purchase_orders_commercial_snapshot_source_check[\s\S]*'contract_snapshot'[\s\S]*'relationship_default_snapshot'[\s\S]*'legacy_default_snapshot'/,
      /ALTER TABLE public\.supplier_purchase_order_items[\s\S]*ADD COLUMN cost_category_id uuid/,
      /supplier_purchase_order_items_cost_category_tenant_fkey[\s\S]*FOREIGN KEY \(cost_category_id, tenant_id\)[\s\S]*finance_cost_categories\(id, tenant_id\)/,
      /ALTER TABLE public\.project_cost_commitments[\s\S]*ADD COLUMN recognized_amount numeric\(18, 2\) NOT NULL DEFAULT 0/,
      /ALTER TABLE public\.project_cost_commitments[\s\S]*ADD COLUMN consumed_at timestamptz NULL/,
      /DROP CONSTRAINT project_cost_commitments_status_check/,
      /ADD CONSTRAINT project_cost_commitments_status_check[\s\S]*'reserved'[\s\S]*'converted'[\s\S]*'consumed'[\s\S]*'released'/,
      /recognized_amount >= 0[\s\S]*recognized_amount <= amount/,
      /status = 'consumed'[\s\S]*recognized_amount = amount[\s\S]*consumed_at IS NOT NULL/,
      /status IN \('reserved', 'converted'\)[\s\S]*consumed_at IS NULL/,
      /status = 'released'[\s\S]*released_by_employee_id IS NOT NULL[\s\S]*released_at IS NOT NULL[\s\S]*release_reason IS NOT NULL/,
    ]);
  });

  test("keeps facts append-only with forced RLS and narrow service grants", () => {
    const guard = sqlFunction(
      "public",
      "prevent_supplier_accounting_event_mutation",
    );
    contracts(guard, [
      /RETURNS trigger/,
      /IF TG_OP IN \('UPDATE', 'DELETE'\)/,
      /SUPPLIER_ACCOUNTING_EVENT_IMMUTABLE/,
      /RETURN NEW/,
      /SET search_path = pg_catalog, public/,
    ]);
    for (const table of ["project_cost_events", "supplier_payable_events"]) {
      contracts(migration, [
        new RegExp(
          `CREATE TRIGGER ${table}_immutable[\\s\\S]*BEFORE UPDATE OR DELETE[\\s\\S]*ON public\\.${table}[\\s\\S]*prevent_supplier_accounting_event_mutation`,
        ),
      ]);
    }
    const revoke = aclStatement(
      "REVOKE ALL ON TABLE",
      "FROM PUBLIC, anon, authenticated, service_role;",
    );
    const select = aclStatement(
      "GRANT SELECT ON TABLE",
      "TO service_role;",
    );
    for (const table of ["project_cost_events", "supplier_payable_events"]) {
      expect(revoke).toContain(`public.${table}`);
      expect(select).toContain(`public.${table}`);
    }
    expect(migration).not.toMatch(
      /GRANT [^;]*(?:INSERT|UPDATE|DELETE|TRUNCATE)[^;]*ON TABLE[^;]*(?:project_cost_events|supplier_payable_events)/,
    );
    expect(migration).toMatch(
      /REVOKE ALL ON FUNCTION\s*public\.prevent_supplier_accounting_event_mutation\(\)\s*FROM PUBLIC, anon, authenticated, service_role/,
    );
  });

  test("aggregates only unrecognized active commitments", () => {
    const totals = sqlFunction(
      "public",
      "list_project_cost_commitment_totals",
    );
    contracts(totals, [
      /status IN \('reserved', 'converted'\)/,
      /SUM\(\s*greatest\(\s*commitment\.amount - commitment\.recognized_amount,\s*0\s*\)\s*\)/,
      /SET search_path = pg_catalog, public/,
    ]);
    const activeAggregationPatch = migration.slice(
      migration.indexOf("-- Patch active commitment aggregation"),
      migration.indexOf("-- End active commitment aggregation"),
    );
    contracts(activeAggregationPatch, [
      /submit_supplier_purchase_requisition/,
      /greatest\(\s*commitment\.amount - commitment\.recognized_amount,\s*0\s*\)/,
      /SUPPLIER_COMMITMENT_AGGREGATION_SOURCE_MISMATCH/,
    ]);
  });

  test("backfills only exact requisition and SKU mappings and diagnoses gaps", () => {
    const backfill = migration.slice(
      migration.indexOf("-- Backfill reliable historical line categories"),
      migration.indexOf("-- End reliable historical line categories"),
    );
    contracts(backfill, [
      /purchase_order\.purchase_requisition_id/,
      /requisition_item\.purchase_requisition_id/,
      /requisition_item\.supplier_sku_id/,
      /purchase_item\.supplier_sku_id = mapped\.supplier_sku_id/,
      /COUNT\(DISTINCT requisition_item\.cost_category_id\) = 1/,
      /SET cost_category_id = mapped\.cost_category_id/,
      /purchase_item\.cost_category_id IS NULL/,
    ]);
    expect(backfill).not.toMatch(
      /(?:product_name|sku_name|unit_price|total_amount).*=/,
    );

    const gaps = sqlFunction(
      "public",
      "list_supplier_accounting_legacy_gaps",
    );
    contracts(gaps, [
      /p_tenant_id uuid,\s*p_page integer,\s*p_page_size integer/,
      /p_page < 1/,
      /p_page_size NOT BETWEEN 1 AND 100/,
      /SUPPLIER_ACCOUNTING_LEGACY_GAP_PAGINATION_INVALID/,
      /unmapped_order_item/,
      /unfinancialized_receipt_item/,
      /legacy_default_snapshot/,
      /supplier_purchase_order_items/,
      /supplier_purchase_orders/,
      /supplier_purchase_order_receipt_items/,
      /accepted_quantity > 0/,
      /project_cost_events/,
      /supplier_payable_events/,
      /COUNT\(\*\) OVER \(\)/,
      /LIMIT p_page_size/,
      /OFFSET \(p_page - 1\) \* p_page_size/,
      /SECURITY DEFINER/,
      /SET search_path = pg_catalog, public/,
    ]);
    expect(migration).toMatch(
      /GRANT EXECUTE ON FUNCTION\s*public\.list_supplier_accounting_legacy_gaps\(\s*uuid,\s*integer,\s*integer\s*\)\s*TO service_role/,
    );
  });

  test("backfills historical commercial terms only from relationship defaults", () => {
    const commercialBackfill = migration.slice(
      migration.indexOf("-- Backfill historical commercial defaults"),
      migration.indexOf("-- End historical commercial defaults"),
    );
    contracts(commercialBackfill, [
      /UPDATE public\.supplier_purchase_orders AS purchase_order/,
      /FROM public\.tenant_suppliers AS relationship/,
      /settlement_term_days_snapshot = relationship\.settlement_term_days/,
      /invoice_required_before_payment_snapshot =\s*relationship\.invoice_required_before_payment/,
      /commercial_snapshot_source = 'legacy_default_snapshot'/,
    ]);
    expect(commercialBackfill).not.toMatch(/supplier_contracts|CURRENT_DATE/);
    ordered(migration, [
      /-- Backfill historical commercial defaults/,
      /commercial_snapshot_source = 'legacy_default_snapshot'/,
      /-- Backfill financializable accepted receipt items/,
      /cost_event\.occurred_at \+ make_interval\(\s*days => purchase_order\.settlement_term_days_snapshot\s*\)/,
      /purchase_order\.invoice_required_before_payment_snapshot/,
    ]);
  });

  test("uses a transaction-scoped guard suspension for historical backfill", () => {
    ordered(migration, [
      /ALTER TABLE public\.supplier_purchase_order_items\s*DISABLE TRIGGER supplier_purchase_order_items_require_draft/,
      /ALTER TABLE public\.supplier_purchase_orders\s*DISABLE TRIGGER supplier_purchase_orders_prevent_submitted_mutation/,
      /-- Backfill reliable historical line categories/,
      /UPDATE public\.supplier_purchase_order_items AS purchase_item/,
      /UPDATE public\.supplier_purchase_orders AS purchase_order/,
      /ALTER TABLE public\.supplier_purchase_order_items\s*ENABLE TRIGGER supplier_purchase_order_items_require_draft/,
      /ALTER TABLE public\.supplier_purchase_orders\s*ENABLE TRIGGER supplier_purchase_orders_prevent_submitted_mutation/,
      /SUPPLIER_PURCHASE_ORDER_GUARD_RESTORE_FAILED/,
    ]);
    contracts(migration, [
      /pg_catalog\.pg_trigger/,
      /supplier_purchase_order_items_require_draft/,
      /public\.prevent_supplier_purchase_order_item_mutation\(\)'\s*::regprocedure/,
      /supplier_purchase_orders_prevent_submitted_mutation/,
      /public\.prevent_submitted_supplier_purchase_order_mutation\(\)'\s*::regprocedure/,
      /guard_trigger\.tgenabled = 'O'/,
    ]);
  });

  test("populates every inserted order snapshot before enforcing not null", () => {
    const snapshot = sqlFunction(
      "public",
      "populate_supplier_purchase_order_commercial_snapshot",
    );
    contracts(snapshot, [
      /RETURNS trigger/,
      /SECURITY DEFINER/,
      /SET search_path = pg_catalog, public/,
      /FROM public\.tenant_suppliers AS relationship[\s\S]*FOR SHARE/,
      /FROM public\.supplier_contracts AS contract/,
      /contract\.lifecycle_status = 'active'/,
      /contract\.valid_from <= NEW\.priced_at::date/,
      /contract\.valid_until >= NEW\.priced_at::date/,
      /ORDER BY contract\.valid_until DESC, contract\.id/,
      /NEW\.settlement_term_days_snapshot := COALESCE\(/,
      /NEW\.invoice_required_before_payment_snapshot := COALESCE\(/,
      /NEW\.commercial_snapshot_source := CASE/,
      /'contract_snapshot'/,
      /'relationship_default_snapshot'/,
      /RETURN NEW/,
    ]);
    ordered(snapshot, [
      /FROM public\.tenant_suppliers AS relationship[\s\S]*?FOR SHARE/,
      /FROM public\.supplier_contracts AS contract/,
    ]);
    const contractRead = snapshot.slice(
      snapshot.indexOf("FROM public.supplier_contracts AS contract"),
      snapshot.indexOf("NEW.settlement_term_days_snapshot"),
    );
    expect(contractRead).not.toContain("FOR SHARE");
    contracts(migration, [
      /CREATE TRIGGER supplier_purchase_orders_commercial_snapshot\s*BEFORE INSERT ON public\.supplier_purchase_orders[\s\S]*populate_supplier_purchase_order_commercial_snapshot/,
      /REVOKE ALL ON FUNCTION\s*public\.populate_supplier_purchase_order_commercial_snapshot\(\)\s*FROM PUBLIC, anon, authenticated, service_role/,
    ]);
    const triggerAt = migration.indexOf(
      "CREATE TRIGGER supplier_purchase_orders_commercial_snapshot",
    );
    const notNullAt = migration.indexOf(
      "ALTER COLUMN settlement_term_days_snapshot SET NOT NULL",
    );
    const convertAt = migration.indexOf(
      "CREATE OR REPLACE FUNCTION public.convert_supplier_purchase_requisition",
    );
    expect(triggerAt).toBeGreaterThanOrEqual(0);
    expect(triggerAt).toBeLessThan(notNullAt);
    expect(notNullAt).toBeLessThan(convertAt);
  });

  test("freezes commercial snapshots after order submission", () => {
    const guard = sqlFunction(
      "public",
      "prevent_submitted_supplier_purchase_order_mutation",
    );
    const previousGuard = sqlFunctionFrom(
      previousGuardMigration,
      "public",
      "prevent_submitted_supplier_purchase_order_mutation",
    );
    contracts(guard, [
      /IF OLD\.status = 'submitted'/,
      /NEW\.settlement_term_days_snapshot IS DISTINCT FROM\s*OLD\.settlement_term_days_snapshot/,
      /NEW\.invoice_required_before_payment_snapshot IS DISTINCT FROM\s*OLD\.invoice_required_before_payment_snapshot/,
      /NEW\.commercial_snapshot_source IS DISTINCT FROM\s*OLD\.commercial_snapshot_source/,
      /IF NEW\.status NOT IN \('draft', 'submitted', 'cancelled'\)[\s\S]*NEW\.version <> OLD\.version \+ 1[\s\S]*NEW\.updated_by_employee_id IS NULL[\s\S]*NEW\.updated_at < OLD\.updated_at/,
      /IF NEW\.status = 'cancelled' AND \([\s\S]*NEW\.cancelled_by_employee_id IS NULL[\s\S]*NEW\.updated_by_employee_id IS DISTINCT FROM\s*NEW\.cancelled_by_employee_id/,
    ]);
    const withoutSnapshotFreeze = guard.replace(
      /\s+OR NEW\.settlement_term_days_snapshot IS DISTINCT FROM\s+OLD\.settlement_term_days_snapshot\s+OR NEW\.invoice_required_before_payment_snapshot IS DISTINCT FROM\s+OLD\.invoice_required_before_payment_snapshot\s+OR NEW\.commercial_snapshot_source IS DISTINCT FROM\s+OLD\.commercial_snapshot_source/,
      "",
    );
    const normalizeSql = (source: string) =>
      source.replace(/\s+/g, " ").trim();
    expect(normalizeSql(withoutSnapshotFreeze)).toBe(
      normalizeSql(previousGuard),
    );
  });

  test("converts requisitions with category and commercial snapshots", () => {
    const convert = sqlFunction(
      "public",
      "convert_supplier_purchase_requisition",
    );
    contracts(convert, [
      /CREATE OR REPLACE FUNCTION/,
      /p_requisition_id uuid[\s\S]*p_tenant_id uuid[\s\S]*p_expected_version integer[\s\S]*p_purchase_order_id uuid[\s\S]*p_actor_user_id uuid[\s\S]*p_actor_employee_id uuid[\s\S]*p_idempotency_key text/,
      /SECURITY DEFINER/,
      /SET search_path = pg_catalog, public/,
      /UPDATE public\.supplier_purchase_order_items AS purchase_item[\s\S]*SET cost_category_id = requisition_item\.cost_category_id[\s\S]*purchase_item\.supplier_sku_id =\s*requisition_item\.supplier_sku_id/,
      /convert_supplier_purchase_requisition_commercial_v1\([\s\S]*v_result ->> 'status' <> 'converted'[\s\S]*v_result ->> 'idempotent'/,
    ]);
    expect(convert).not.toMatch(
      /UPDATE public\.supplier_purchase_orders AS purchase_order/,
    );
    ordered(convert, [
      /convert_supplier_purchase_requisition_commercial_v1\(/,
      /v_result ->> 'idempotent'/,
      /UPDATE public\.supplier_purchase_order_items AS purchase_item/,
    ]);
  });

  test("financializes accepted receipts atomically with exact allocation", () => {
    const receipt = sqlFunction(
      "public",
      "create_supplier_purchase_order_receipt",
    );
    contracts(receipt, [
      /CREATE OR REPLACE FUNCTION/,
      /p_receipt_id uuid[\s\S]*p_order_id uuid[\s\S]*p_tenant_id uuid[\s\S]*p_expected_fulfillment_version integer[\s\S]*p_receipt_no text[\s\S]*p_received_at timestamptz[\s\S]*p_remark text[\s\S]*p_items jsonb[\s\S]*p_actor_user_id uuid[\s\S]*p_actor_employee_id uuid[\s\S]*p_idempotency_key text/,
      /SECURITY DEFINER/,
      /SET search_path = pg_catalog, public/,
      /receipt_item\.accepted_quantity > 0[\s\S]*purchase_item\.cost_category_id IS NULL/,
      /'status', 'state_conflict'[\s\S]*'SUPPLIER_PURCHASE_ORDER_COST_CATEGORY_REQUIRED'/,
      /create_supplier_purchase_order_receipt_fulfillment_v1\(/,
      /previous_recognized_amount/,
      /greatest\(\s*least\(\s*financial_line\.line_total_amount,\s*CASE[\s\S]*financial_line\.cumulative_accepted_quantity >=\s*financial_line\.ordered_quantity[\s\S]*financial_line\.line_total_amount[\s\S]*round\(\s*financial_line\.line_total_amount \*\s*financial_line\.cumulative_accepted_quantity \/\s*financial_line\.ordered_quantity,\s*2\s*\)[\s\S]*END\s*\) -\s*financial_line\.previous_recognized_amount,\s*0\s*\)/,
      /WHERE financial_line\.accepted_quantity > 0/,
      /INSERT INTO public\.project_cost_events/,
      /INSERT INTO public\.supplier_payable_events/,
      /p_received_at \+ make_interval\(\s*days => v_order\.settlement_term_days_snapshot\s*\)/,
      /invoice_required_before_payment_snapshot/,
      /FROM public\.project_cost_commitments AS commitment[\s\S]*ORDER BY commitment\.cost_category_id, commitment\.id[\s\S]*FOR UPDATE/,
      /recognized_amount =\s*commitment\.recognized_amount \+ recognized\.amount/,
      /status = CASE[\s\S]*THEN 'consumed'/,
      /consumed_at = CASE[\s\S]*p_received_at/,
      /v_result ->> 'status' <> 'receipt_created'[\s\S]*v_result ->> 'idempotent'/,
    ]);
    ordered(receipt, [
      /create_supplier_purchase_order_receipt_fulfillment_v1\(/,
      /SUPPLIER_PURCHASE_ORDER_COST_CATEGORY_REQUIRED/,
      /INSERT INTO public\.project_cost_events/,
      /INSERT INTO public\.supplier_payable_events/,
      /UPDATE public\.project_cost_commitments/,
    ]);
    expect(receipt).toMatch(
      /exception block is a subtransaction[\s\S]*v1 receipt[\s\S]*command event[\s\S]*roll back/i,
    );
    expect(receipt).not.toMatch(
      /line_total_amount \*\s*financial_line\.accepted_quantity \/\s*financial_line\.ordered_quantity/,
    );
  });

  test("allocates live and historical facts from monotonic cumulative targets", () => {
    const backfill = migration.slice(
      migration.indexOf("-- Backfill financializable accepted receipt items"),
      migration.indexOf(
        "INSERT INTO public.supplier_payable_events",
        migration.indexOf("-- Backfill financializable accepted receipt items"),
      ),
    );
    contracts(backfill, [
      /SUM\(receipt_item\.accepted_quantity\) OVER \([\s\S]*ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW[\s\S]*AS cumulative_accepted_quantity/,
      /targeted AS MATERIALIZED/,
      /least\(\s*historical_line\.line_total_amount,\s*CASE[\s\S]*historical_line\.cumulative_accepted_quantity >=\s*historical_line\.ordered_quantity[\s\S]*historical_line\.line_total_amount[\s\S]*round\(\s*historical_line\.line_total_amount \*\s*historical_line\.cumulative_accepted_quantity \/\s*historical_line\.ordered_quantity,\s*2\s*\)[\s\S]*END\s*\)[\s\S]*AS cumulative_target_amount/,
      /greatest\(\s*targeted\.cumulative_target_amount - COALESCE\(\s*lag\(targeted\.cumulative_target_amount\) OVER \([\s\S]*ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING[\s\S]*\),\s*0\s*\),\s*0\s*\)[\s\S]*AS recognized_amount/,
    ]);
    expect(backfill).not.toMatch(
      /line_total_amount \*\s*historical_line\.accepted_quantity \/\s*historical_line\.ordered_quantity/,
    );

    const lineTotalCents = 4;
    const orderedQuantity = 6;
    const cumulativeTargets = Array.from({ length: orderedQuantity }, (_, i) =>
      Math.min(
        lineTotalCents,
        Math.round((lineTotalCents * (i + 1)) / orderedQuantity),
      ),
    );
    const allocations = cumulativeTargets.map(
      (target, i) => target - (cumulativeTargets[i - 1] ?? 0),
    );
    const unsafeFinalAllocation =
      lineTotalCents -
      Array.from({ length: orderedQuantity - 1 }, () =>
        Math.round(lineTotalCents / orderedQuantity),
      ).reduce((sum, amount) => sum + amount, 0);

    expect(unsafeFinalAllocation).toBe(-1);
    expect(allocations).toEqual([1, 0, 1, 1, 0, 1]);
    expect(allocations.every((amount) => amount >= 0)).toBe(true);
    expect(allocations.reduce((sum, amount) => sum + amount, 0)).toBe(
      lineTotalCents,
    );
  });

  test("provides covering indexes and set-based forward-only reconciliation", () => {
    contracts(migration, [
      /CREATE INDEX project_cost_events_tenant_project_category_occurred_idx\s*ON public\.project_cost_events\(\s*tenant_id,\s*project_id,\s*cost_category_id,\s*occurred_at DESC,\s*id DESC\s*\)/,
      /CREATE INDEX supplier_payable_events_tenant_project_due_idx\s*ON public\.supplier_payable_events\(\s*tenant_id,\s*project_id,\s*due_at,\s*id\s*\)/,
      /CREATE INDEX supplier_payable_events_tenant_supplier_occurred_idx\s*ON public\.supplier_payable_events\(\s*tenant_id,\s*tenant_supplier_id,\s*occurred_at DESC,\s*id DESC\s*\)/,
      /CONSTRAINT project_cost_events_source_unique_idx\s*UNIQUE \(tenant_id, source_type, source_id\)/,
      /CONSTRAINT supplier_payable_events_source_unique_idx\s*UNIQUE \(tenant_id, source_type, source_id\)/,
      /CREATE INDEX supplier_purchase_order_items_legacy_category_gap_idx/,
      /CREATE INDEX supplier_purchase_order_receipt_items_financialization_idx/,
      /CREATE INDEX project_cost_commitments_active_remaining_idx[\s\S]*INCLUDE \(amount, recognized_amount\)[\s\S]*WHERE status IN \('reserved', 'converted'\)/,
      /-- Backfill financializable accepted receipt items/,
      /ON CONFLICT \(tenant_id, source_type, source_id\) DO NOTHING/,
      /UPDATE public\.project_cost_commitments AS commitment[\s\S]*recognized_amount/,
    ]);
    expect(migration).not.toMatch(/\bLOOP\b/);
    expect(migration).toMatch(
      /^-- Rollback:[\s\S]*forward migration[\s\S]*operating facts[\s\S]*must not DROP/i,
    );
    expect(migration).not.toMatch(/\bDROP TABLE\b/i);
    expect(migration).not.toMatch(/\bDROP COLUMN\b/i);
    expect(migration).toMatch(/\bBEGIN;/);
    expect(migration).toMatch(/\bCOMMIT;\s*$/);
  });
});
