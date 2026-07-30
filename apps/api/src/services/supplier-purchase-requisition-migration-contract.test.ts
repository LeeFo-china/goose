import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

const migrationPath = new URL(
  "../../../../supabase/migrations/20260730150000_create_supplier_purchase_requisitions.sql",
  import.meta.url,
);
const sql = existsSync(migrationPath)
  ? readFileSync(migrationPath, "utf8")
  : "";
const task3Marker = "-- Task 3: atomic purchase requisition commands";
const schemaFoundationSql = sql.slice(0, sql.indexOf(task3Marker));

function extractStatement(startPattern: RegExp) {
  const start = sql.search(startPattern);
  if (start < 0) return "";

  let depth = 0;
  let isInsideString = false;
  for (let index = start; index < sql.length; index += 1) {
    const character = sql[index];
    if (character === "'") {
      if (isInsideString && sql[index + 1] === "'") {
        index += 1;
        continue;
      }
      isInsideString = !isInsideString;
      continue;
    }
    if (isInsideString) continue;
    if (character === "(") depth += 1;
    if (character === ")") depth -= 1;
    if (character === ";" && depth === 0) {
      return sql.slice(start, index + 1);
    }
  }
  return "";
}

function extractTable(table: string) {
  return extractStatement(
    new RegExp(`CREATE TABLE public\\.${table}\\s*\\(`),
  );
}

function splitTopLevelClauses(statement: string) {
  const bodyStart = statement.indexOf("(");
  const bodyEnd = statement.lastIndexOf(")");
  if (bodyStart < 0 || bodyEnd <= bodyStart) return [];

  const body = statement.slice(bodyStart + 1, bodyEnd);
  const clauses: string[] = [];
  let clauseStart = 0;
  let depth = 0;
  let isInsideString = false;
  for (let index = 0; index < body.length; index += 1) {
    const character = body[index];
    if (character === "'") {
      if (isInsideString && body[index + 1] === "'") {
        index += 1;
        continue;
      }
      isInsideString = !isInsideString;
      continue;
    }
    if (isInsideString) continue;
    if (character === "(") depth += 1;
    if (character === ")") depth -= 1;
    if (character !== "," || depth !== 0) continue;
    clauses.push(body.slice(clauseStart, index).trim());
    clauseStart = index + 1;
  }
  clauses.push(body.slice(clauseStart).trim());
  return clauses.filter(Boolean);
}

function extractColumnNames(table: string) {
  return splitTopLevelClauses(extractTable(table))
    .map((clause) => /^([a-z][a-z0-9_]*)\s/i.exec(clause)?.[1] ?? "")
    .filter((name) => (
      name !== ""
      && name.toUpperCase() !== "CONSTRAINT"
      && name.toUpperCase() !== "UNIQUE"
    ));
}

function extractConstraint(table: string, constraint: string) {
  return splitTopLevelClauses(extractTable(table))
    .find((clause) => clause.startsWith(`CONSTRAINT ${constraint}`)) ?? "";
}

function expectContracts(source: string, contracts: readonly RegExp[]) {
  for (const contract of contracts) expect(source).toMatch(contract);
}

const requisitionColumns = [
  "id",
  "tenant_id",
  "request_no",
  "project_id",
  "tenant_supplier_id",
  "supplier_id",
  "status",
  "budget_status",
  "currency",
  "reason",
  "expected_delivery_date",
  "remark",
  "priced_at",
  "subtotal_amount",
  "tax_amount",
  "total_amount",
  "purchase_order_id",
  "version",
  "created_by_employee_id",
  "updated_by_employee_id",
  "submitted_by_employee_id",
  "submitted_at",
  "reviewed_by_employee_id",
  "reviewed_at",
  "review_remark",
  "cancelled_by_employee_id",
  "cancelled_at",
  "cancel_reason",
  "created_at",
  "updated_at",
] as const;

const itemColumns = [
  "id",
  "tenant_id",
  "purchase_requisition_id",
  "line_no",
  "cost_category_id",
  "supplier_product_id",
  "supplier_sku_id",
  "supplier_price_list_id",
  "supplier_price_list_item_id",
  "product_code_snapshot",
  "product_name_snapshot",
  "sku_code_snapshot",
  "sku_name_snapshot",
  "specification_snapshot",
  "model_snapshot",
  "purchase_unit_id",
  "purchase_unit_code_snapshot",
  "purchase_unit_name_snapshot",
  "purchase_unit_symbol_snapshot",
  "base_unit_id",
  "base_unit_code_snapshot",
  "base_unit_name_snapshot",
  "base_unit_symbol_snapshot",
  "base_unit_conversion",
  "price_list_code_snapshot",
  "price_list_version_snapshot",
  "price_effective_from_snapshot",
  "price_effective_until_snapshot",
  "quantity",
  "unit_price",
  "tax_rate",
  "tax_inclusive",
  "line_subtotal_amount",
  "line_tax_amount",
  "line_total_amount",
  "created_at",
] as const;

const commitmentColumns = [
  "id",
  "tenant_id",
  "project_id",
  "cost_category_id",
  "source_type",
  "source_id",
  "amount",
  "status",
  "budget_amount_snapshot",
  "expense_amount_snapshot",
  "other_commitment_amount_snapshot",
  "available_amount_snapshot",
  "created_by_employee_id",
  "released_by_employee_id",
  "released_at",
  "release_reason",
  "created_at",
  "updated_at",
] as const;

describe("supplier purchase requisition migration contract", () => {
  test("creates the complete requisition, item, and commitment facts", () => {
    expect(sql).toContain(
      "CREATE TABLE public.supplier_purchase_requisitions",
    );
    expect(sql).toContain(
      "CREATE TABLE public.supplier_purchase_requisition_items",
    );
    expect(sql).toContain("CREATE TABLE public.project_cost_commitments");
    expect(extractColumnNames("supplier_purchase_requisitions"))
      .toEqual([...requisitionColumns]);
    expect(extractColumnNames("supplier_purchase_requisition_items"))
      .toEqual([...itemColumns]);
    expect(extractColumnNames("project_cost_commitments"))
      .toEqual([...commitmentColumns]);

    expectContracts(extractTable("supplier_purchase_requisitions"), [
      /id uuid PRIMARY KEY DEFAULT gen_random_uuid\(\)/,
      /status text NOT NULL DEFAULT 'draft'/,
      /status IN \(\s*'draft',\s*'pending_approval',\s*'approved',\s*'rejected',\s*'cancelled',\s*'converted'\s*\)/,
      /budget_status text NOT NULL DEFAULT 'unchecked'/,
      /budget_status IN \('unchecked', 'within_budget', 'over_budget'\)/,
      /currency text NOT NULL DEFAULT 'CNY'/,
      /CHECK \(currency = 'CNY'\)/,
      /reason text NOT NULL/,
      /char_length\(reason\) BETWEEN 1 AND 500/,
      /request_no ~ '\^PR-\[0-9\]\{8\}-\[0-9\]\{8\}\$'/,
      /remark IS NULL[\s\S]*char_length\(remark\) BETWEEN 1 AND 500/,
      /priced_at timestamptz NOT NULL/,
      /subtotal_amount numeric\(18, 2\) NOT NULL DEFAULT 0/,
      /tax_amount numeric\(18, 2\) NOT NULL DEFAULT 0/,
      /total_amount numeric\(18, 2\) NOT NULL DEFAULT 0/,
      /subtotal_amount >= 0[\s\S]*tax_amount >= 0[\s\S]*total_amount >= 0[\s\S]*total_amount = subtotal_amount \+ tax_amount/,
      /version integer NOT NULL DEFAULT 1/,
      /CHECK \(version > 0\)/,
      /review_remark IS NULL[\s\S]*char_length\(review_remark\) BETWEEN 1 AND 500/,
      /cancel_reason IS NULL[\s\S]*char_length\(cancel_reason\) BETWEEN 1 AND 500/,
    ]);

    expectContracts(extractTable("supplier_purchase_requisition_items"), [
      /line_no integer NOT NULL/,
      /CHECK \(line_no BETWEEN 1 AND 100\)/,
      /quantity numeric\(18, 4\) NOT NULL/,
      /CHECK \(quantity > 0\)/,
      /unit_price numeric\(14, 2\) NOT NULL/,
      /CHECK \(unit_price >= 0\)/,
      /tax_rate numeric\(7, 6\) NOT NULL/,
      /CHECK \(tax_rate BETWEEN 0 AND 1\)/,
      /base_unit_conversion numeric\(18, 8\) NOT NULL/,
      /CHECK \(base_unit_conversion > 0\)/,
      /product_code_snapshot text NOT NULL/,
      /product_name_snapshot text NOT NULL/,
      /sku_code_snapshot text NOT NULL/,
      /sku_name_snapshot text NOT NULL/,
      /specification_snapshot text NULL/,
      /model_snapshot text NULL/,
      /purchase_unit_code_snapshot text NOT NULL/,
      /purchase_unit_name_snapshot text NOT NULL/,
      /purchase_unit_symbol_snapshot text NOT NULL/,
      /base_unit_code_snapshot text NOT NULL/,
      /base_unit_name_snapshot text NOT NULL/,
      /base_unit_symbol_snapshot text NOT NULL/,
      /price_list_code_snapshot text NOT NULL/,
      /price_list_version_snapshot integer NOT NULL/,
      /CHECK \(price_list_version_snapshot > 0\)/,
      /price_effective_from_snapshot timestamptz NOT NULL/,
      /price_effective_until_snapshot timestamptz NULL/,
      /line_subtotal_amount numeric\(18, 2\) NOT NULL/,
      /line_tax_amount numeric\(18, 2\) NOT NULL/,
      /line_total_amount numeric\(18, 2\) NOT NULL/,
      /line_subtotal_amount >= 0[\s\S]*line_tax_amount >= 0[\s\S]*line_total_amount >= 0[\s\S]*line_total_amount = line_subtotal_amount \+ line_tax_amount/,
      /UNIQUE \(purchase_requisition_id, line_no\)/,
      /UNIQUE \(purchase_requisition_id, supplier_sku_id\)/,
    ]);

    expectContracts(extractTable("project_cost_commitments"), [
      /source_type text NOT NULL DEFAULT 'supplier_purchase_requisition'/,
      /CHECK \(source_type = 'supplier_purchase_requisition'\)/,
      /amount numeric\(18, 2\) NOT NULL/,
      /status IN \('reserved', 'converted', 'released'\)/,
      /budget_amount_snapshot numeric\(18, 2\) NOT NULL/,
      /expense_amount_snapshot numeric\(18, 2\) NOT NULL/,
      /other_commitment_amount_snapshot numeric\(18, 2\) NOT NULL/,
      /available_amount_snapshot numeric\(18, 2\) NOT NULL/,
      /budget_amount_snapshot >= 0[\s\S]*expense_amount_snapshot >= 0[\s\S]*other_commitment_amount_snapshot >= 0/,
      /UNIQUE \(tenant_id, source_type, source_id, cost_category_id\)/,
    ]);
  });

  test("enforces satisfiable lifecycle and audit consistency", () => {
    const requisition = extractTable("supplier_purchase_requisitions");
    expectContracts(requisition, [
      /status = 'draft'[\s\S]*budget_status = 'unchecked'[\s\S]*submitted_by_employee_id IS NULL[\s\S]*reviewed_by_employee_id IS NULL[\s\S]*cancelled_by_employee_id IS NULL[\s\S]*purchase_order_id IS NULL/,
      /status = 'pending_approval'[\s\S]*budget_status IN \('within_budget', 'over_budget'\)[\s\S]*submitted_by_employee_id IS NOT NULL[\s\S]*reviewed_by_employee_id IS NULL[\s\S]*cancelled_by_employee_id IS NULL[\s\S]*purchase_order_id IS NULL/,
      /status IN \('approved', 'rejected'\)[\s\S]*budget_status IN \('within_budget', 'over_budget'\)[\s\S]*submitted_by_employee_id IS NOT NULL[\s\S]*reviewed_by_employee_id IS NOT NULL[\s\S]*cancelled_by_employee_id IS NULL[\s\S]*purchase_order_id IS NULL/,
      /status = 'cancelled'[\s\S]*cancelled_by_employee_id IS NOT NULL[\s\S]*cancelled_at IS NOT NULL[\s\S]*cancel_reason IS NOT NULL[\s\S]*purchase_order_id IS NULL/,
      /status = 'converted'[\s\S]*budget_status IN \('within_budget', 'over_budget'\)[\s\S]*submitted_by_employee_id IS NOT NULL[\s\S]*reviewed_by_employee_id IS NOT NULL[\s\S]*cancelled_by_employee_id IS NULL[\s\S]*purchase_order_id IS NOT NULL/,
      /\(\s*submitted_by_employee_id IS NULL\s+AND submitted_at IS NULL\s*\)[\s\S]*\(\s*submitted_by_employee_id IS NOT NULL\s+AND submitted_at IS NOT NULL\s*\)/,
      /\(\s*reviewed_by_employee_id IS NULL\s+AND reviewed_at IS NULL[\s\S]*\)[\s\S]*\(\s*reviewed_by_employee_id IS NOT NULL\s+AND reviewed_at IS NOT NULL\s+AND submitted_by_employee_id IS NOT NULL\s*\)/,
    ]);
    expect(requisition).not.toContain(
      "supplier_purchase_requisitions_budget_pricing_check",
    );
    expect(requisition).not.toContain("priced_at IS NULL");

    const stateConstraint = extractConstraint(
      "supplier_purchase_requisitions",
      "supplier_purchase_requisitions_state_metadata_check",
    );
    expect(stateConstraint.match(/status = 'cancelled'/g) ?? []).toHaveLength(3);
    expectContracts(stateConstraint, [
      /status = 'cancelled'\s+AND budget_status = 'unchecked'\s+AND submitted_by_employee_id IS NULL\s+AND submitted_at IS NULL\s+AND reviewed_by_employee_id IS NULL\s+AND reviewed_at IS NULL\s+AND review_remark IS NULL\s+AND cancelled_by_employee_id IS NOT NULL\s+AND cancelled_at IS NOT NULL\s+AND cancel_reason IS NOT NULL\s+AND purchase_order_id IS NULL/,
      /status = 'cancelled'\s+AND budget_status IN \('within_budget', 'over_budget'\)\s+AND submitted_by_employee_id IS NOT NULL\s+AND submitted_at IS NOT NULL\s+AND reviewed_by_employee_id IS NULL\s+AND reviewed_at IS NULL\s+AND review_remark IS NULL\s+AND cancelled_by_employee_id IS NOT NULL\s+AND cancelled_at IS NOT NULL\s+AND cancel_reason IS NOT NULL\s+AND purchase_order_id IS NULL/,
      /status = 'cancelled'\s+AND budget_status IN \('within_budget', 'over_budget'\)\s+AND submitted_by_employee_id IS NOT NULL\s+AND submitted_at IS NOT NULL\s+AND reviewed_by_employee_id IS NOT NULL\s+AND reviewed_at IS NOT NULL\s+AND cancelled_by_employee_id IS NOT NULL\s+AND cancelled_at IS NOT NULL\s+AND cancel_reason IS NOT NULL\s+AND purchase_order_id IS NULL/,
    ]);

    const commitments = extractTable("project_cost_commitments");
    expectContracts(commitments, [
      /status IN \('reserved', 'converted'\)[\s\S]*released_by_employee_id IS NULL[\s\S]*released_at IS NULL[\s\S]*release_reason IS NULL/,
      /status = 'released'[\s\S]*released_by_employee_id IS NOT NULL[\s\S]*released_at IS NOT NULL[\s\S]*release_reason IS NOT NULL/,
      /release_reason IS NULL[\s\S]*char_length\(release_reason\) BETWEEN 1 AND 500/,
    ]);
  });

  test("uses only real tenant-safe parent and catalog relationships", () => {
    expectContracts(sql, [
      /ALTER TABLE public\.projects[\s\S]*UNIQUE \(id, tenant_id\)/,
      /ALTER TABLE public\.finance_cost_categories[\s\S]*UNIQUE \(id, tenant_id\)/,
      /ALTER TABLE public\.tenant_suppliers[\s\S]*UNIQUE \(id, tenant_id, supplier_id\)/,
    ]);

    const requisition = extractTable("supplier_purchase_requisitions");
    expectContracts(requisition, [
      /FOREIGN KEY \(project_id, tenant_id\)[\s\S]*REFERENCES public\.projects\(id, tenant_id\)/,
      /FOREIGN KEY \(tenant_supplier_id, tenant_id, supplier_id\)[\s\S]*REFERENCES public\.tenant_suppliers\(id, tenant_id, supplier_id\)/,
      /UNIQUE \(id, tenant_id\)/,
    ]);

    const items = extractTable("supplier_purchase_requisition_items");
    expectContracts(items, [
      /FOREIGN KEY \(purchase_requisition_id, tenant_id\)[\s\S]*REFERENCES public\.supplier_purchase_requisitions\(id, tenant_id\)/,
      /FOREIGN KEY \(cost_category_id, tenant_id\)[\s\S]*REFERENCES public\.finance_cost_categories\(id, tenant_id\)/,
      /supplier_product_id uuid NOT NULL[\s\S]*REFERENCES public\.supplier_products\(id\)/,
      /supplier_sku_id uuid NOT NULL[\s\S]*REFERENCES public\.supplier_skus\(id\)/,
      /supplier_price_list_id uuid NOT NULL[\s\S]*REFERENCES public\.supplier_price_lists\(id\)/,
      /supplier_price_list_item_id uuid NOT NULL[\s\S]*REFERENCES public\.supplier_price_list_items\(id\)/,
    ]);
    expect(sql).toMatch(
      /Task 3 set-based SECURITY DEFINER[\s\S]*supplier -> product -> sku -> price list -> price item[\s\S]*direct writes are revoked/i,
    );
    expect(sql).not.toMatch(
      /CREATE TRIGGER[\s\S]{0,120}supplier_purchase_requisition_items/i,
    );

    const commitments = extractTable("project_cost_commitments");
    expectContracts(commitments, [
      /FOREIGN KEY \(project_id, tenant_id\)[\s\S]*REFERENCES public\.projects\(id, tenant_id\)/,
      /FOREIGN KEY \(cost_category_id, tenant_id\)[\s\S]*REFERENCES public\.finance_cost_categories\(id, tenant_id\)/,
      /FOREIGN KEY \(source_id, tenant_id\)[\s\S]*REFERENCES public\.supplier_purchase_requisitions\(id, tenant_id\)/,
    ]);
  });

  test("links requisitions and purchase orders without losing tenant scope", () => {
    expectContracts(sql, [
      /ALTER TABLE public\.supplier_purchase_orders\s+ADD COLUMN purchase_requisition_id uuid NULL;/,
      /CREATE UNIQUE INDEX supplier_purchase_orders_purchase_requisition_unique_idx[\s\S]*purchase_requisition_id\)[\s\S]*WHERE purchase_requisition_id IS NOT NULL;/,
      /CREATE UNIQUE INDEX supplier_purchase_requisitions_purchase_order_unique_idx[\s\S]*purchase_order_id\)[\s\S]*WHERE purchase_order_id IS NOT NULL;/,
      /ADD CONSTRAINT supplier_purchase_orders_id_tenant_requisition_key\s+UNIQUE \(id, tenant_id, purchase_requisition_id\)/,
      /ADD CONSTRAINT supplier_purchase_requisitions_id_tenant_order_key\s+UNIQUE \(id, tenant_id, purchase_order_id\)/,
      /FOREIGN KEY \(purchase_requisition_id, tenant_id, id\)\s+REFERENCES public\.supplier_purchase_requisitions\(\s*id,\s*tenant_id,\s*purchase_order_id\s*\)\s+ON DELETE RESTRICT\s+DEFERRABLE INITIALLY DEFERRED/,
      /FOREIGN KEY \(purchase_order_id, tenant_id, id\)\s+REFERENCES public\.supplier_purchase_orders\(\s*id,\s*tenant_id,\s*purchase_requisition_id\s*\)\s+ON DELETE RESTRICT\s+DEFERRABLE INITIALLY DEFERRED/,
    ]);
    expect(sql).not.toMatch(
      /ADD CONSTRAINT supplier_purchase_orders_requisition_tenant_fkey\s+FOREIGN KEY \(purchase_requisition_id, tenant_id\)\s/,
    );
    expect(sql).not.toMatch(
      /ADD CONSTRAINT supplier_purchase_requisitions_order_tenant_fkey\s+FOREIGN KEY \(purchase_order_id, tenant_id\)\s/,
    );
  });

  test("generates tenant-unique request numbers and bounded query indexes", () => {
    expectContracts(sql, [
      /CREATE SEQUENCE public\.supplier_purchase_requisition_number_seq[\s\S]*AS bigint[\s\S]*START WITH 1[\s\S]*MAXVALUE 99999999[\s\S]*NO CYCLE/,
      /request_no text NOT NULL DEFAULT \([\s\S]*'PR-' \|\| to_char\(CURRENT_DATE, 'YYYYMMDD'\)[\s\S]*lpad\(\s*nextval\('public\.supplier_purchase_requisition_number_seq'\)::text,\s*8,\s*'0'\s*\)/,
      /UNIQUE \(tenant_id, request_no\)/,
    ]);
    for (const index of [
      "supplier_purchase_requisitions_tenant_status_updated_idx",
      "supplier_purchase_requisitions_tenant_updated_idx",
      "supplier_purchase_requisitions_tenant_budget_updated_idx",
      "supplier_purchase_requisitions_tenant_project_updated_idx",
      "supplier_purchase_requisitions_pending_approval_idx",
      "supplier_purchase_requisitions_tenant_supplier_updated_idx",
      "supplier_purchase_requisition_items_parent_line_idx",
      "project_cost_commitments_active_lookup_idx",
    ]) {
      expect(sql).toContain(`CREATE INDEX ${index}`);
    }
    expectContracts(sql, [
      /supplier_purchase_requisitions_tenant_status_updated_idx[\s\S]*\(\s*tenant_id,\s*status,\s*updated_at DESC,\s*id DESC\s*\)/,
      /supplier_purchase_requisitions_tenant_updated_idx[\s\S]*\(\s*tenant_id,\s*updated_at DESC,\s*id DESC\s*\)/,
      /supplier_purchase_requisitions_tenant_budget_updated_idx[\s\S]*\(\s*tenant_id,\s*budget_status,\s*updated_at DESC,\s*id DESC\s*\)/,
      /supplier_purchase_requisitions_tenant_project_updated_idx[\s\S]*\(\s*tenant_id,\s*project_id,\s*updated_at DESC,\s*id DESC\s*\)/,
      /supplier_purchase_requisitions_pending_approval_idx[\s\S]*\(\s*tenant_id,\s*status,\s*submitted_at,\s*id\s*\)[\s\S]*WHERE status = 'pending_approval'/,
      /supplier_purchase_requisitions_tenant_supplier_updated_idx[\s\S]*\(\s*tenant_id,\s*tenant_supplier_id,\s*updated_at DESC,\s*id DESC\s*\)/,
      /supplier_purchase_requisition_items_parent_line_idx[\s\S]*\(\s*purchase_requisition_id,\s*line_no,\s*id\s*\)/,
      /project_cost_commitments_active_lookup_idx[\s\S]*\(\s*tenant_id,\s*project_id,\s*cost_category_id,\s*status\s*\)[\s\S]*WHERE status IN \('reserved', 'converted'\)/,
    ]);
    expect(sql).not.toContain("project_cost_commitments_source_lookup_idx");
  });

  test("forces RLS and leaves direct writes for later definer commands", () => {
    const tables = [
      "supplier_purchase_requisitions",
      "supplier_purchase_requisition_items",
      "project_cost_commitments",
    ] as const;
    for (const table of tables) {
      expect(sql).toContain(
        `ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;`,
      );
      expect(sql).toContain(
        `ALTER TABLE public.${table} FORCE ROW LEVEL SECURITY;`,
      );
    }
    expect(sql).toMatch(
      /REVOKE ALL ON TABLE[\s\S]*supplier_purchase_requisitions[\s\S]*supplier_purchase_requisition_items[\s\S]*project_cost_commitments[\s\S]*FROM PUBLIC, anon, authenticated, service_role/,
    );
    expect(sql).toMatch(
      /GRANT SELECT ON TABLE[\s\S]*supplier_purchase_requisitions[\s\S]*supplier_purchase_requisition_items[\s\S]*project_cost_commitments[\s\S]*TO service_role/,
    );
    expect(sql).not.toMatch(
      /GRANT[\s\S]{0,80}(INSERT|UPDATE|DELETE)[\s\S]{0,180}(supplier_purchase_requisitions|supplier_purchase_requisition_items|project_cost_commitments)/,
    );
    expect(sql).toMatch(
      /REVOKE ALL ON SEQUENCE public\.supplier_purchase_requisition_number_seq[\s\S]*FROM PUBLIC, anon, authenticated, service_role/,
    );
    expect(sql).not.toMatch(
      /GRANT[^;]*ON SEQUENCE public\.supplier_purchase_requisition_number_seq/i,
    );
    expect(sql).not.toMatch(/^\s*CREATE POLICY\b/im);
  });

  test("seeds only tenant system admins with all three permissions", () => {
    for (const code of [
      "supplier.purchase-requisition.view",
      "supplier.purchase-requisition.manage",
      "supplier.purchase-requisition.approve",
    ]) {
      expect(sql).toContain(`'${code}'`);
    }
    expectContracts(sql, [
      /INSERT INTO public\.permissions[\s\S]*ON CONFLICT \(code\) DO UPDATE SET/,
      /INSERT INTO public\.role_permissions[\s\S]*WHERE roles\.code = 'system_admin'[\s\S]*roles\.tenant_id IS NOT NULL[\s\S]*ON CONFLICT \(role_id, permission_id\) DO UPDATE SET/,
    ]);
    expect(sql).not.toMatch(/roles\.code = 'platform_admin'/);
  });

  test("extends command event resource types without dropping existing values", () => {
    const constraint = extractStatement(
      /ALTER TABLE public\.supplier_command_events\s+ADD CONSTRAINT supplier_command_events_resource_type_check/,
    );
    for (const resourceType of [
      "supplier",
      "supplier_qualification_type",
      "supplier_qualification",
      "supplier_service_region",
      "supplier_address",
      "supplier_contact",
      "catalog_category",
      "catalog_brand",
      "catalog_unit",
      "tenant_supplier",
      "supplier_contract",
      "supplier_product",
      "supplier_sku",
      "supplier_price_list",
      "supplier_purchase_order",
      "supplier_purchase_requisition",
    ]) {
      expect(constraint).toContain(`'${resourceType}'`);
    }
    expect(constraint).toMatch(/NOT VALID;$/);
    expect(sql).toMatch(
      /ALTER TABLE public\.supplier_command_events\s+VALIDATE CONSTRAINT supplier_command_events_resource_type_check;/,
    );
  });

  test("is transactional, adds no commands, and documents forward rollback", () => {
    expect(sql).toMatch(/\bBEGIN;[\s\S]*\bCOMMIT;\s*$/);
    expectContracts(sql, [
      /SET LOCAL lock_timeout = '5s';/,
      /SET LOCAL statement_timeout = '30s';/,
      /maintenance window[\s\S]*existing composite unique index[\s\S]*30 seconds[\s\S]*whole transaction[\s\S]*do not retry[\s\S]*forward preflight migration[\s\S]*CREATE UNIQUE INDEX CONCURRENTLY[\s\S]*ADD CONSTRAINT USING INDEX[\s\S]*rerun/i,
      /Global eight-digit sequence cap[\s\S]*100,000,000[\s\S]*forward migration/i,
    ]);
    expect(sql).toContain(task3Marker);
    expect(schemaFoundationSql).not.toMatch(
      /CREATE (?:OR REPLACE )?FUNCTION public\.(?:save|submit|approve|reject|cancel|convert)_supplier_purchase_requisition/,
    );
    expectContracts(sql, [
      /^-- Rollback:/,
      /forward migration/i,
      /revoke execute/i,
      /audit/i,
      /financial facts/i,
      /destructive rollback/i,
    ]);
  });
});
