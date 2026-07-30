import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const migrationPath = new URL(
  "../../../../supabase/migrations/20260730150000_create_supplier_purchase_requisitions.sql",
  import.meta.url,
);
const sql = readFileSync(migrationPath, "utf8");

function extractCommitmentSummaryFunction() {
  const start = sql.indexOf(
    "CREATE FUNCTION public.list_project_cost_commitment_totals",
  );
  if (start < 0) return "";
  const end = sql.indexOf("\n$$;", start);
  return end < 0 ? sql.slice(start) : sql.slice(start, end + 4);
}

function extractExpenseSummaryFunction() {
  const start = sql.indexOf(
    "CREATE FUNCTION public.list_project_cost_expense_totals",
  );
  if (start < 0) return "";
  const end = sql.indexOf("\n$$;", start);
  return end < 0 ? sql.slice(start) : sql.slice(start, end + 4);
}

describe("project cost commitment summary migration contract", () => {
  test("returns one JSON aggregate immune to PostgREST row truncation", () => {
    const functionSql = extractCommitmentSummaryFunction();

    expect(functionSql).toContain(
      "CREATE FUNCTION public.list_project_cost_commitment_totals",
    );
    expect(functionSql).toMatch(/RETURNS jsonb/);
    expect(functionSql).toMatch(/COUNT\(\*\)/i);
    expect(functionSql).toContain("'source_row_count'");
    expect(functionSql).toContain("'categories'");
    expect(functionSql).toMatch(/v_source_row_count > 10000/);
  });

  test("aggregates only active requisition commitments and joins category labels", () => {
    const functionSql = extractCommitmentSummaryFunction();

    expect(functionSql).toMatch(
      /source_type = 'supplier_purchase_requisition'/,
    );
    expect(functionSql).toMatch(
      /status IN \('reserved', 'converted'\)/,
    );
    expect(functionSql).toMatch(
      /JOIN public\.finance_cost_categories AS category/,
    );
    expect(functionSql).toMatch(/GROUP BY[\s\S]*cost_category_id/);
    expect(functionSql).toContain("'category_code'");
    expect(functionSql).toContain("'category_name'");
    expect(functionSql).toContain("'commitment_amount'");
  });

  test("keeps execute permission service-role only", () => {
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.list_project_cost_commitment_totals\(uuid, uuid\)[\s\S]*FROM PUBLIC, anon, authenticated/,
    );
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION\s+public\.list_project_cost_commitment_totals\(uuid, uuid\)[\s\S]*TO service_role/,
    );
  });
});

describe("project cost expense summary migration contract", () => {
  test("returns one bounded JSON aggregate for category and unallocated totals", () => {
    const functionSql = extractExpenseSummaryFunction();

    expect(functionSql).toContain(
      "CREATE FUNCTION public.list_project_cost_expense_totals",
    );
    expect(functionSql).toMatch(/RETURNS jsonb/);
    expect(functionSql).toMatch(/COUNT\(\*\)/i);
    expect(functionSql).toMatch(/v_source_row_count > 10000/);
    expect(functionSql).toContain("'source_row_count'");
    expect(functionSql).toContain("'total_expense_amount'");
    expect(functionSql).toContain("'unallocated_expense_amount'");
    expect(functionSql).toContain("'categories'");
  });

  test("scopes outgoing ledger rows and aggregates each category", () => {
    const functionSql = extractExpenseSummaryFunction();

    expect(functionSql).toMatch(
      /FROM public\.finance_ledger_entries AS ledger/,
    );
    expect(functionSql).toMatch(/ledger\.tenant_id = p_tenant_id/);
    expect(functionSql).toMatch(/ledger\.project_id = p_project_id/);
    expect(functionSql).toMatch(/ledger\.direction = 'out'/);
    expect(functionSql).toMatch(/GROUP BY[\s\S]*cost_category_id/);
    expect(functionSql).toMatch(
      /FILTER \(\s*WHERE[\s\S]*cost_category_id IS NULL\s*\)/,
    );
  });

  test("uses fixed search path and service-role-only execute", () => {
    const functionSql = extractExpenseSummaryFunction();

    expect(functionSql).toContain("SET search_path = pg_catalog, public");
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.list_project_cost_expense_totals\(uuid, uuid\)[\s\S]*FROM PUBLIC, anon, authenticated/,
    );
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION\s+public\.list_project_cost_expense_totals\(uuid, uuid\)[\s\S]*TO service_role/,
    );
  });
});
