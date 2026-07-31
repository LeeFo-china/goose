import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  new URL(
    "../../../../supabase/migrations/20260731110000_create_supplier_payment_requests.sql",
    import.meta.url,
  ),
  "utf8",
);
const patch = migration.slice(
  migration.indexOf("DO $supplier_payment_aggregate_patch$"),
  migration.indexOf("$supplier_payment_aggregate_patch$;", 1),
);

describe("supplier payment project-risk cost patch", () => {
  test("patches the latest risk function with supplier cost at project and category level", () => {
    expect(patch).toContain("supplier_cost_totals as (");
    expect(patch).toContain("FROM public.project_cost_events");
    expect(patch).toContain("category_expenses as (");
    expect(patch).toContain("UNION ALL");
    expect(patch).toContain("cost_event.cost_category_id");
    expect(patch).toContain("coalesce(sc.supplier_cost_amount, 0)");
    expect(patch).toContain(
      "left join supplier_cost_totals sc on sc.project_id = bp.id",
    );
    expect(patch.match(/v_occurrences <> 1/g)?.length ?? 0).toBeGreaterThanOrEqual(
      6,
    );
    expect(patch.match(/EXECUTE v_definition;/g)).toHaveLength(4);
    expect(patch).not.toMatch(/\b(?:GRANT|REVOKE)\b/);
    const exclusionEnd = patch.indexOf(
      "-- Re-read the effective definition after the supplier-payment exclusion.",
    );
    expect(patch.slice(patch.indexOf("v_occurrences <> 3"), exclusionEnd))
      .toContain("EXECUTE v_definition;");
  });

  test("makes supplier cost drive danger filters and the paginated total", () => {
    const projects = [
      riskFixture("project-1", 50, 10, 100, 100),
      riskFixture("project-2", 200, 10, 0, 100),
    ];
    const filtered = projects.filter((row) =>
      row.riskLevel === "danger" &&
      row.flags.includes("project_over_budget") &&
      row.flags.includes("negative_actual_profit") &&
      row.budgetUsageRatio >= 1
    );

    expect(filtered.map((row) => row.id)).toEqual(["project-1"]);
    expect(filtered).toHaveLength(1);
  });
});

function riskFixture(
  id: string,
  received: number,
  legacyExpense: number,
  supplierCost: number,
  budget: number,
) {
  const actualCost = legacyExpense + supplierCost;
  const flags = [
    ...(actualCost > budget ? ["project_over_budget"] : []),
    ...(received - actualCost < 0 ? ["negative_actual_profit"] : []),
  ];
  return {
    id,
    flags,
    budgetUsageRatio: actualCost / budget,
    riskLevel: flags.length ? "danger" : "normal",
  };
}
