import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

const migrationUrl = new URL(
  "../../../../supabase/migrations/20260826141000_create_supplier_purchase_batches.sql",
  import.meta.url,
);
const sql = existsSync(migrationUrl) ? readFileSync(migrationUrl, "utf8") : "";

function compact(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function extractFunction(name: string): string {
  return sql.match(new RegExp(
    `CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`,
  ))?.[0] ?? "";
}

function expectOrdered(value: string, patterns: readonly RegExp[]): void {
  let cursor = 0;
  for (const pattern of patterns) {
    const match = value.slice(cursor).match(pattern);
    expect(match, `missing ordered contract ${pattern}`).not.toBeNull();
    cursor += (match?.index ?? 0) + (match?.[0].length ?? 0);
  }
}

describe("supplier purchase batch foundation migration", () => {
  test("is one bounded forward-only additive transaction", () => {
    expect(existsSync(migrationUrl)).toBe(true);
    expect(sql).toMatch(/^-- Rollback: forward-only\./);
    expect(sql).toContain("SET LOCAL lock_timeout = '5s';");
    expect(sql).toContain("SET LOCAL statement_timeout = '5min';");
    expect(sql).toMatch(/\bBEGIN;[\s\S]*\bCOMMIT;\s*$/);
    expect(sql).not.toMatch(/\bUPDATE public\.supplier_purchase_(?:requisitions|orders)\b/);
  });

  test("creates the tenant-owned aggregate with exact lifecycle and audit facts", () => {
    const batch = sql.slice(
      sql.indexOf("CREATE TABLE public.supplier_purchase_batches"),
      sql.indexOf("CREATE TABLE public.supplier_purchase_batch_items"),
    );

    for (const field of [
      "id uuid PRIMARY KEY",
      "tenant_id uuid NOT NULL",
      "project_id uuid NOT NULL",
      "batch_no text NOT NULL",
      "status text NOT NULL DEFAULT 'draft'",
      "priced_at timestamptz",
      "subtotal_amount numeric(18, 2)",
      "tax_amount numeric(18, 2)",
      "total_amount numeric(18, 2)",
      "budget_checked_at timestamptz",
      "budget_status text NOT NULL DEFAULT 'unchecked'",
      "budget_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb",
      "split_generation integer NOT NULL DEFAULT 0",
      "supplier_count integer NOT NULL DEFAULT 0",
      "item_count integer NOT NULL DEFAULT 0",
      "version integer NOT NULL DEFAULT 1",
      "created_by_employee_id uuid NOT NULL",
      "updated_by_employee_id uuid NOT NULL",
      "submitted_by_employee_id uuid NULL",
      "submitted_at timestamptz NULL",
      "reviewed_by_employee_id uuid NULL",
      "reviewed_at timestamptz NULL",
      "review_remark text NULL",
      "cancelled_by_employee_id uuid NULL",
      "cancelled_at timestamptz NULL",
      "cancel_reason text NULL",
    ]) expect(batch).toContain(field);

    expect(batch).toMatch(
      /status IN \(\s*'draft',\s*'pending_approval',\s*'rejected',\s*'cancelled',\s*'ordered'\s*\)/,
    );
    expect(batch).toMatch(/currency (?:text|char\(3\)) NOT NULL DEFAULT 'CNY'/);
    expect(batch).toMatch(/currency(?:\:\:text)? = 'CNY'/);
    expect(batch).toMatch(/total_amount = subtotal_amount \+ tax_amount/);
    expect(batch).toMatch(/split_generation >= 0/);
    expect(batch).toMatch(/supplier_count BETWEEN 0 AND 20/);
    expect(batch).toMatch(/item_count BETWEEN 0 AND 100/);
    expect(batch).toMatch(/version > 0/);
    expect(batch).toMatch(/FOREIGN KEY \(project_id, tenant_id\)[\s\S]*REFERENCES public\.projects\(id, tenant_id\)/);
    for (const actor of [
      "created_by_employee_id",
      "updated_by_employee_id",
      "submitted_by_employee_id",
      "reviewed_by_employee_id",
      "cancelled_by_employee_id",
    ]) {
      expect(batch).toMatch(new RegExp(
        `FOREIGN KEY \\(${actor}, tenant_id\\)[\\s\\S]*?` +
          "REFERENCES public\\.employees\\(id, tenant_id\\)",
      ));
    }
    expect(batch).toMatch(/UNIQUE \(id, tenant_id\)/);
    expect(batch).toMatch(/UNIQUE \(tenant_id, batch_no\)/);
  });

  test("stores bounded immutable item and monetary snapshots with tenant-safe links", () => {
    const item = sql.slice(
      sql.indexOf("CREATE TABLE public.supplier_purchase_batch_items"),
      sql.indexOf("ALTER TABLE public.supplier_purchase_requisitions"),
    );

    for (const field of [
      "purchase_batch_id uuid NOT NULL",
      "line_no integer NOT NULL",
      "supplier_sku_id uuid NOT NULL",
      "quantity numeric(18, 4) NOT NULL",
      "cost_category_id uuid NOT NULL",
      "supplier_id uuid NOT NULL",
      "tenant_supplier_id uuid NOT NULL",
      "supplier_product_id uuid NOT NULL",
      "supplier_price_list_id uuid NOT NULL",
      "supplier_price_list_item_id uuid NOT NULL",
      "product_code_snapshot text NOT NULL",
      "product_name_snapshot text NOT NULL",
      "sku_code_snapshot text NOT NULL",
      "sku_name_snapshot text NOT NULL",
      "purchase_unit_id uuid NOT NULL",
      "base_unit_id uuid NOT NULL",
      "base_unit_conversion numeric(18, 8) NOT NULL",
      "price_list_code_snapshot text NOT NULL",
      "price_list_version_snapshot integer NOT NULL",
      "unit_price numeric(14, 2) NOT NULL",
      "tax_rate numeric(7, 6) NOT NULL",
      "tax_inclusive boolean NOT NULL",
      "line_subtotal_amount numeric(18, 2) NOT NULL",
      "line_tax_amount numeric(18, 2) NOT NULL",
      "line_total_amount numeric(18, 2) NOT NULL",
    ]) expect(item).toContain(field);

    expect(item).toMatch(/UNIQUE \(purchase_batch_id, supplier_sku_id\)/);
    expect(item).toMatch(/UNIQUE \(purchase_batch_id, line_no\)/);
    expect(item).toMatch(/quantity > 0[\s\S]*scale\(quantity\) <= 4/);
    expect(item).toMatch(/line_no BETWEEN 1 AND 100/);
    expect(item).toMatch(/line_total_amount = line_subtotal_amount \+ line_tax_amount/);
    for (const contract of [
      /FOREIGN KEY \(purchase_batch_id, tenant_id\)[\s\S]*REFERENCES public\.supplier_purchase_batches\(id, tenant_id\)/,
      /FOREIGN KEY \(tenant_supplier_id, tenant_id, supplier_id\)[\s\S]*REFERENCES public\.tenant_suppliers\(id, tenant_id, supplier_id\)/,
      /FOREIGN KEY \(cost_category_id, tenant_id\)[\s\S]*REFERENCES public\.finance_cost_categories\(id, tenant_id\)/,
      /FOREIGN KEY \(supplier_product_id, supplier_id\)[\s\S]*REFERENCES public\.supplier_products\(id, supplier_id\)/,
      /FOREIGN KEY \(supplier_sku_id, supplier_id\)[\s\S]*REFERENCES public\.supplier_skus\(id, supplier_id\)/,
      /FOREIGN KEY \(supplier_price_list_id, tenant_id, supplier_id\)[\s\S]*REFERENCES public\.supplier_price_lists\(id, tenant_id, supplier_id\)/,
    ]) expect(item).toMatch(contract);
  });

  test("adds nullable ownership columns and tenant-safe aggregate references", () => {
    const normalized = compact(sql);
    expect(normalized).toMatch(
      /ALTER TABLE public\.supplier_purchase_requisitions ADD COLUMN purchase_batch_id uuid NULL, ADD COLUMN split_generation integer NULL/,
    );
    expect(normalized).toMatch(
      /supplier_purchase_requisitions_batch_tenant_fkey FOREIGN KEY \(purchase_batch_id, tenant_id\) REFERENCES public\.supplier_purchase_batches\(id, tenant_id\) ON DELETE RESTRICT/,
    );
    expect(normalized).toMatch(
      /CHECK \( \(purchase_batch_id IS NULL AND split_generation IS NULL\) OR \(purchase_batch_id IS NOT NULL AND split_generation IS NOT NULL AND split_generation > 0\) \)/,
    );
    expect(normalized).toMatch(
      /ALTER TABLE public\.supplier_purchase_orders ADD COLUMN purchase_batch_id uuid NULL/,
    );
    expect(normalized).toMatch(
      /supplier_purchase_orders_batch_tenant_fkey FOREIGN KEY \(purchase_batch_id, tenant_id\) REFERENCES public\.supplier_purchase_batches\(id, tenant_id\) ON DELETE RESTRICT/,
    );
  });

  test("makes requisition batch ownership immutable after insert", () => {
    const guard = extractFunction(
      "prevent_supplier_purchase_requisition_batch_reassignment",
    );
    const normalized = compact(sql);

    expect(guard).toMatch(/RETURNS trigger[\s\S]*SECURITY DEFINER/);
    expect(guard).toContain("SET search_path = pg_catalog, public");
    expect(guard).toMatch(
      /NEW\.purchase_batch_id IS DISTINCT FROM OLD\.purchase_batch_id/,
    );
    expect(guard).toMatch(
      /NEW\.split_generation IS DISTINCT FROM OLD\.split_generation/,
    );
    expect(guard).toContain("SUPPLIER_PURCHASE_BATCH_OWNERSHIP_IMMUTABLE");
    expect(normalized).toMatch(
      /CREATE TRIGGER supplier_purchase_requisitions_prevent_batch_reassignment BEFORE UPDATE OF purchase_batch_id, split_generation ON public\.supplier_purchase_requisitions FOR EACH ROW EXECUTE FUNCTION public\.prevent_supplier_purchase_requisition_batch_reassignment\(\)/,
    );
    expect(normalized).toMatch(
      /REVOKE ALL ON FUNCTION public\.prevent_supplier_purchase_requisition_batch_reassignment\(\) FROM PUBLIC, anon, authenticated, service_role/,
    );
  });

  test("adds deterministic list, child, and partial uniqueness indexes", () => {
    const normalized = compact(sql);
    for (const contract of [
      /CREATE INDEX supplier_purchase_batches_tenant_status_updated_idx ON public\.supplier_purchase_batches\( tenant_id, status, updated_at DESC, id DESC \)/,
      /CREATE INDEX supplier_purchase_batches_tenant_project_updated_idx ON public\.supplier_purchase_batches\( tenant_id, project_id, updated_at DESC, id DESC \)/,
      /CREATE INDEX supplier_purchase_batch_items_parent_line_idx ON public\.supplier_purchase_batch_items\( tenant_id, purchase_batch_id, line_no, id \)/,
      /CREATE UNIQUE INDEX supplier_purchase_requisitions_batch_supplier_generation_uidx ON public\.supplier_purchase_requisitions\( tenant_id, purchase_batch_id, split_generation, tenant_supplier_id \) WHERE purchase_batch_id IS NOT NULL/,
      /CREATE UNIQUE INDEX supplier_purchase_orders_batch_supplier_uidx ON public\.supplier_purchase_orders\( tenant_id, purchase_batch_id, tenant_supplier_id \) WHERE purchase_batch_id IS NOT NULL/,
    ]) expect(normalized).toMatch(contract);
  });

  test("creates a tenant-safe immutable command event ledger", () => {
    const event = sql.slice(
      sql.indexOf("CREATE TABLE public.supplier_purchase_batch_command_events"),
      sql.indexOf("ALTER FUNCTION public.submit_supplier_purchase_requisition"),
    );
    for (const field of [
      "tenant_id uuid NOT NULL",
      "purchase_batch_id uuid NOT NULL",
      "command_type text NOT NULL",
      "idempotency_key text NOT NULL",
      "request_fingerprint text NOT NULL",
      "actor_user_id uuid NOT NULL",
      "actor_employee_id uuid NOT NULL",
      "result jsonb NOT NULL",
      "result_version integer NOT NULL",
    ]) expect(event).toContain(field);
    expect(event).toMatch(/UNIQUE \(tenant_id, purchase_batch_id, command_type, idempotency_key\)/);
    expect(event).toMatch(/FOREIGN KEY \(purchase_batch_id, tenant_id\)[\s\S]*REFERENCES public\.supplier_purchase_batches\(id, tenant_id\)/);
    expect(event).toMatch(/FOREIGN KEY \(actor_employee_id, tenant_id\)[\s\S]*REFERENCES public\.employees\(id, tenant_id\)/);
    expect(event).toMatch(/command_type IN \([\s\S]*'save_draft'[\s\S]*'submit'[\s\S]*'review'[\s\S]*'cancel'/);
    expect(event).toMatch(/char_length\(idempotency_key\) <= 120/);
    expect(event).toMatch(/result_version > 0/);
  });

  test("guards all direct requisition mutations without exposing bypasses", () => {
    const commands = [
      "submit_supplier_purchase_requisition",
      "review_supplier_purchase_requisition",
      "cancel_supplier_purchase_requisition",
      "convert_supplier_purchase_requisition",
    ] as const;
    const normalized = compact(sql);

    for (const name of commands) {
      const fn = extractFunction(name);
      expect(fn, `${name} must be redefined`).not.toBe("");
      expect(fn).toContain("SECURITY DEFINER");
      expect(fn).toContain("SET search_path = pg_catalog, public");
      expectOrdered(fn, [
        /FROM public\.supplier_purchase_requisitions/,
        /requisition\.id = p_requisition_id[\s\S]*requisition\.tenant_id = p_tenant_id/,
        /purchase_batch_id IS NOT NULL/,
        /SUPPLIER_PURCHASE_BATCH_MANAGED_REQUISITION/,
        new RegExp(`${name}_unmanaged_v1`),
      ]);
      expect(normalized).toMatch(new RegExp(
        `REVOKE ALL ON FUNCTION public\\.${name}\\([^;]+\\) ` +
          "FROM PUBLIC, anon, authenticated, service_role; " +
          `GRANT EXECUTE ON FUNCTION public\\.${name}\\([^;]+\\) ` +
          "TO service_role;",
      ));
      expect(normalized).toMatch(new RegExp(
        `REVOKE ALL ON FUNCTION public\\.${name}_unmanaged_v1\\([^;]+\\) ` +
          "FROM PUBLIC, anon, authenticated, service_role;",
      ));
      expect(normalized).not.toMatch(new RegExp(
        `GRANT EXECUTE ON FUNCTION public\\.${name}_unmanaged_v1`,
      ));
    }
  });

  test("keeps all new facts private and read-only to the API role", () => {
    const normalized = compact(sql);
    for (const table of [
      "supplier_purchase_batches",
      "supplier_purchase_batch_items",
      "supplier_purchase_batch_command_events",
    ]) {
      expect(normalized).toContain(
        `ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;`,
      );
      expect(normalized).toContain(
        `ALTER TABLE public.${table} FORCE ROW LEVEL SECURITY;`,
      );
    }
    expect(normalized).toMatch(
      /REVOKE ALL ON TABLE public\.supplier_purchase_batches, public\.supplier_purchase_batch_items, public\.supplier_purchase_batch_command_events FROM PUBLIC, anon, authenticated, service_role/,
    );
    expect(normalized).toMatch(
      /GRANT SELECT ON TABLE public\.supplier_purchase_batches, public\.supplier_purchase_batch_items, public\.supplier_purchase_batch_command_events TO service_role/,
    );
  });
});
