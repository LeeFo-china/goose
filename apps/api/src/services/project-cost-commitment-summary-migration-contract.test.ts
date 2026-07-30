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
