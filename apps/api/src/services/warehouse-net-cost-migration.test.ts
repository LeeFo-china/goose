import { expect, test } from "bun:test";

test("warehouse net-cost migration guards the effective budget and risk functions", async () => {
  const sql = await Bun.file(new URL("../../../../supabase/migrations/20260908015649_warehouse_net_project_costs.sql", import.meta.url)).text();
  for (const name of ["search_finance_project_risk_ids", "__gooes_submit_supplier_purchase_batch_destinations_v2", "__gooes_review_supplier_purchase_batch_destinations_v2", "__gooes_supplier_purchase_batch_budget_preflight"]) {
    expect(sql).toContain(name);
  }
  expect(sql).toContain("event_direction = 'decrease'");
  expect(sql).toContain("WAREHOUSE_COST_AGGREGATE_SOURCE_MISMATCH");
  expect(sql).not.toMatch(/UPDATE\s+public\.project_cost_events/i);
  expect(sql).not.toContain("DISABLE TRIGGER");
});
