import { describe, expect, test } from "bun:test";

import {
  EXPECTED_SUPPLIER_PAYMENT_INDEXES,
  assertExplainUsesIndexes,
  parseExplainPlan,
  runExplainChecks,
} from "./supplier-payment-explain";

function plan(indexName: string) {
  return [{
    Plan: {
      "Node Type": "Aggregate",
      Plans: [{
        "Node Type": "Index Scan",
        "Index Name": indexName,
      }],
    },
    "Planning Time": 0.1,
    "Execution Time": 0.2,
  }];
}

describe("supplier payment EXPLAIN helpers", () => {
  test("strictly parses PostgreSQL JSON plans", () => {
    const parsed = parseExplainPlan([{ "QUERY PLAN": plan(
      EXPECTED_SUPPLIER_PAYMENT_INDEXES.payable,
    ) }]);
    expect(parsed.indexNames).toEqual([
      EXPECTED_SUPPLIER_PAYMENT_INDEXES.payable,
    ]);
    expect(parsed.hasRuntimeEvidence).toBe(true);

    expect(() => parseExplainPlan([])).toThrow("exactly one row");
    expect(() => parseExplainPlan([{ "QUERY PLAN": [] }]))
      .toThrow("one plan");
    expect(() => parseExplainPlan([{
      "QUERY PLAN": [{ Plan: { "Node Type": 1 } }],
    }])).toThrow("Node Type");
  });

  test("accepts stringified JSON without weakening validation", () => {
    const indexName = EXPECTED_SUPPLIER_PAYMENT_INDEXES.request;
    expect(parseExplainPlan([{
      "QUERY PLAN": JSON.stringify(plan(indexName)),
    }]).indexNames).toEqual([indexName]);
  });

  test("requires every named design index and runtime evidence", () => {
    const plans = Object.values(EXPECTED_SUPPLIER_PAYMENT_INDEXES).map(
      (indexName) => parseExplainPlan([{ "QUERY PLAN": plan(indexName) }]),
    );
    expect(assertExplainUsesIndexes(plans)).toBe(true);
    expect(() => assertExplainUsesIndexes(plans.slice(1)))
      .toThrow(EXPECTED_SUPPLIER_PAYMENT_INDEXES.payable);
    const withoutRuntime = {
      ...plans[0]!,
      hasRuntimeEvidence: false,
    };
    expect(() => assertExplainUsesIndexes([withoutRuntime, ...plans.slice(1)]))
      .toThrow("runtime");
  });

  test("runs explain commands through the real query boundary in order", async () => {
    const calls: string[] = [];
    const plans = await runExplainChecks({
      async explain(name) {
        calls.push(name);
        return [{ "QUERY PLAN": plan(
          EXPECTED_SUPPLIER_PAYMENT_INDEXES[name],
        ) }];
      },
    });

    expect(calls).toEqual(Object.keys(EXPECTED_SUPPLIER_PAYMENT_INDEXES));
    expect(plans).toHaveLength(Object.keys(EXPECTED_SUPPLIER_PAYMENT_INDEXES)
      .length);
    expect(assertExplainUsesIndexes(plans)).toBe(true);
  });
});
