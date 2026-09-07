import { describe, expect, test } from "bun:test";

import { assertInventoryScanBound, parseInventoryPlanNotices } from "./warehouse-inventory-plan-notices";

const query = "WITH filtered AS NOT MATERIALIZED (SELECT id FROM public.inventory_transactions) SELECT * FROM filtered";
const plan = { "Node Type": "Aggregate", "Actual Rows": 1, "Actual Loops": 1, "Temp Written Blocks": 0 };

function notice(queryText = query): string {
  return `NOTICE:  duration: 1.234 ms  plan:\n${JSON.stringify({ "Query Text": queryText, Plan: plan }, null, 2)}\nCONTEXT:  SQL statement \"caller\"\n`;
}

describe("isolated inventory auto_explain notices", () => {
  test("associates actual nested statements with markers, ignoring outer and helper queries", () => {
    const output = "NOTICE:  STAGE_B_RPC_PLAN_CASE auto-1\n" + notice("SELECT 1") + notice() +
      "NOTICE:  STAGE_B_RPC_PLAN_END auto-1\nNOTICE:  STAGE_B_RPC_PLAN_CASE auto-2\n" + notice() +
      "NOTICE:  STAGE_B_RPC_PLAN_END auto-2\n" + notice("SELECT public.list_inventory_transactions(...) ");
    const result = parseInventoryPlanNotices(output, ["auto-1", "auto-2"]);
    expect(result.map((entry) => entry.label)).toEqual(["auto-1", "auto-2"]);
    expect(result[0]?.durationMs).toBe(1.234);
    expect(result[0]?.plan).toEqual({ "Query Text": query, Plan: plan });
  });

  test("rejects a missing expected nested plan", () => {
    expect(() => parseInventoryPlanNotices("NOTICE:  STAGE_B_RPC_PLAN_CASE auto-1\n", ["auto-1"]))
      .toThrow("Missing inventory plan");
  });

  test("rejects duplicate nested plans and unmarked inventory statements", () => {
    expect(() => parseInventoryPlanNotices("NOTICE:  STAGE_B_RPC_PLAN_CASE auto-1\n" + notice() + notice(), ["auto-1"]))
      .toThrow("Duplicate inventory plan");
    expect(() => parseInventoryPlanNotices(notice(), ["auto-1"]))
      .toThrow("Unmarked inventory plan");
  });

  test("rejects malformed or truncated plan JSON rather than silently dropping evidence", () => {
    const prefix = "NOTICE:  STAGE_B_RPC_PLAN_CASE auto-1\nNOTICE:  duration: 1 ms  plan:\n";
    expect(() => parseInventoryPlanNotices(prefix + "{broken\n}\n", ["auto-1"])).toThrow();
    expect(() => parseInventoryPlanNotices(prefix + "{\n", ["auto-1"])).toThrow("Truncated auto_explain");
  });

  test("rejects unknown case markers and an invalid JSON plan shape", () => {
    expect(() => parseInventoryPlanNotices("NOTICE:  STAGE_B_RPC_PLAN_CASE other\n" + notice(), ["auto-1"]))
      .toThrow("Unexpected inventory plan case");
    const invalid = notice().replace('"Node Type": "Aggregate"', '"Node Type": null');
    expect(() => parseInventoryPlanNotices("NOTICE:  STAGE_B_RPC_PLAN_CASE auto-1\n" + invalid, ["auto-1"]))
      .toThrow("Invalid inventory plan");
  });

  test("rejects a plan outside its closed case and an incorrect end marker", () => {
    const start = "NOTICE:  STAGE_B_RPC_PLAN_CASE auto-1\n";
    expect(() => parseInventoryPlanNotices(start + notice() + "NOTICE:  STAGE_B_RPC_PLAN_END auto-1\n" + notice(), ["auto-1"]))
      .toThrow("Unmarked inventory plan");
    expect(() => parseInventoryPlanNotices(start + notice() + "NOTICE:  STAGE_B_RPC_PLAN_END other\n", ["auto-1"]))
      .toThrow("Inventory plan end mismatch");
  });

  test("rejects real RPC temporary writes", () => {
    const output = "NOTICE:  STAGE_B_RPC_PLAN_CASE auto-1\n" +
      notice().replace('"Temp Written Blocks": 0', '"Temp Written Blocks": 5') +
      "NOTICE:  STAGE_B_RPC_PLAN_END auto-1\n";
    expect(() => parseInventoryPlanNotices(output, ["auto-1"])).toThrow("Inventory RPC plan spills");
  });

  test("counts filtered rows and loops when bounding inventory scans", () => {
    const entry = { label: "auto-6", durationMs: 1, plan: { Plan: { "Node Type": "Aggregate", Plans: [
      { "Node Type": "Seq Scan", "Relation Name": "inventory_transactions", "Actual Rows": 100,
        "Actual Loops": 1, "Rows Removed by Filter": 99903 },
    ] } } };
    expect(() => assertInventoryScanBound(entry, 100)).toThrow("Inventory selective scan exceeds bound");
    entry.plan.Plan.Plans[0]!["Rows Removed by Filter"] = 0;
    expect(() => assertInventoryScanBound(entry, 100)).not.toThrow();
    entry.plan.Plan.Plans[0]!["Actual Loops"] = 2;
    expect(() => assertInventoryScanBound(entry, 100)).toThrow("Inventory selective scan exceeds bound");
  });

  test("rejects duplicate empty marker pairs and an empty closed case", () => {
    const start = "NOTICE:  STAGE_B_RPC_PLAN_CASE auto-1\n";
    const end = "NOTICE:  STAGE_B_RPC_PLAN_END auto-1\n";
    expect(() => parseInventoryPlanNotices(start + notice() + end + start + end, ["auto-1"]))
      .toThrow("Duplicate inventory plan case");
    expect(() => parseInventoryPlanNotices(start + end, ["auto-1"]))
      .toThrow("Missing inventory plan in case");
  });
});
