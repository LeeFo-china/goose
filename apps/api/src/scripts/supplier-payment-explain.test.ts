import { describe, expect, test } from "bun:test";

import {
  EXPECTED_SUPPLIER_PAYMENT_INDEXES,
  assertExplainUsesIndexes,
  parseExplainPlan,
  runExplainChecks,
  type ParsedExplainPlan,
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
      EXPECTED_SUPPLIER_PAYMENT_INDEXES.payable[0]!,
    ) }]);
    expect(parsed.indexNames).toEqual([
      EXPECTED_SUPPLIER_PAYMENT_INDEXES.payable[0]!,
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
    const indexName = EXPECTED_SUPPLIER_PAYMENT_INDEXES.request[0]!;
    expect(parseExplainPlan([{
      "QUERY PLAN": JSON.stringify(plan(indexName)),
    }]).indexNames).toEqual([indexName]);
  });

  test("requires every named design index and runtime evidence", () => {
    const plans = Object.fromEntries(
      Object.entries(EXPECTED_SUPPLIER_PAYMENT_INDEXES).map(
        ([name, indexNames]) => [
          name,
          parseExplainPlan([{ "QUERY PLAN": plan(indexNames[0]!) }]),
        ],
      ),
    ) as Record<
      keyof typeof EXPECTED_SUPPLIER_PAYMENT_INDEXES,
      ParsedExplainPlan
    >;
    expect(assertExplainUsesIndexes(plans)).toBe(true);
    expect(() => assertExplainUsesIndexes({
      ...plans,
      payable: parseExplainPlan([{ "QUERY PLAN": plan(
        EXPECTED_SUPPLIER_PAYMENT_INDEXES.request[0]!,
      ) }]),
      request: parseExplainPlan([{ "QUERY PLAN": plan(
        EXPECTED_SUPPLIER_PAYMENT_INDEXES.payable[0]!,
      ) }]),
    })).toThrow(EXPECTED_SUPPLIER_PAYMENT_INDEXES.payable[0]!);
    const withoutRuntime = {
      ...plans.payable,
      hasRuntimeEvidence: false,
    };
    expect(() => assertExplainUsesIndexes({
      ...plans,
      payable: withoutRuntime,
    }))
      .toThrow("runtime");
  });

  test("runs explain commands through the real query boundary in order", async () => {
    const calls: string[] = [];
    const plans = await runExplainChecks({
      async explain(name) {
        calls.push(name);
        return [{ "QUERY PLAN": plan(
          EXPECTED_SUPPLIER_PAYMENT_INDEXES[name][0]!,
        ) }];
      },
    });

    expect(calls).toEqual(Object.keys(EXPECTED_SUPPLIER_PAYMENT_INDEXES));
    expect(Object.keys(plans)).toEqual(
      Object.keys(EXPECTED_SUPPLIER_PAYMENT_INDEXES),
    );
    expect(assertExplainUsesIndexes(plans)).toBe(true);
  });
});
