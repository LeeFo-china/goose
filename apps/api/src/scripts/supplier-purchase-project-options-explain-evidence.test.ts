import { describe, expect, test } from "bun:test";

import {
  LARGE_TENANT_PROJECT_CARDINALITY,
  PROJECT_OPTION_EXPLAIN_THRESHOLDS,
  assertProjectOptionExplainThresholds,
  parseProjectOptionExplainPlan,
  type ProjectOptionExplainEvidence,
} from "./supplier-purchase-project-options-explain-evidence";

const COMPOSITE_INDEX = "projects_tenant_updated_id_purchase_batch_idx";
const TRGM_INDEX = "projects_name_purchase_batch_trgm_idx";

function plan(input: {
  indexName?: string;
  nodeType?: string;
  planningMs?: number;
  executionMs?: number;
  sharedHit?: number;
  sharedRead?: number;
  tempRead?: number;
  tempWritten?: number;
} = {}) {
  return [{
    Plan: {
      "Node Type": input.nodeType ?? "Index Scan",
      ...(input.indexName ? { "Index Name": input.indexName } : {}),
      "Shared Hit Blocks": input.sharedHit ?? 11,
      "Shared Read Blocks": input.sharedRead ?? 12,
      "Temp Read Blocks": input.tempRead ?? 0,
      "Temp Written Blocks": input.tempWritten ?? 0,
    },
    "Planning Time": input.planningMs ?? 1.2,
    "Execution Time": input.executionMs ?? 3.4,
  }];
}

function evidence(
  name: ProjectOptionExplainEvidence["name"],
  indexName = COMPOSITE_INDEX,
): ProjectOptionExplainEvidence {
  return {
    name,
    ...parseProjectOptionExplainPlan([{
      "QUERY PLAN": plan({ indexName }),
    }]),
  };
}

function passingEvidence(): ProjectOptionExplainEvidence[] {
  return [
    evidence("tenant_time_page"),
    evidence("tenant_time_count"),
    evidence("tenant_time_keyword_page", TRGM_INDEX),
    evidence("tenant_time_keyword_count", TRGM_INDEX),
    evidence("bounded_visible_page"),
  ];
}

describe("supplier purchase project option EXPLAIN evidence", () => {
  test("parses timings, indexes, node types, and top-level buffer evidence", () => {
    const parsed = parseProjectOptionExplainPlan([{
      "QUERY PLAN": JSON.stringify(plan({
        indexName: COMPOSITE_INDEX,
        planningMs: 2.5,
        executionMs: 4.5,
        sharedHit: 21,
        sharedRead: 22,
        tempRead: 0,
        tempWritten: 0,
      })),
    }]);

    expect(parsed).toEqual({
      planningMs: 2.5,
      executionMs: 4.5,
      indexNames: [COMPOSITE_INDEX],
      nodeTypes: ["Index Scan"],
      sharedHitBlocks: 21,
      sharedReadBlocks: 22,
      tempReadBlocks: 0,
      tempWrittenBlocks: 0,
      hasExplicitSort: false,
    });
  });

  test("strictly rejects incomplete or malformed runtime JSON", () => {
    expect(() => parseProjectOptionExplainPlan([])).toThrow("exactly one row");
    expect(() => parseProjectOptionExplainPlan([{
      "QUERY PLAN": [{ Plan: { "Node Type": "Seq Scan" } }],
    }])).toThrow("Planning Time");
    expect(() => parseProjectOptionExplainPlan([{
      "QUERY PLAN": plan({ nodeType: "Sort" }).concat({} as never),
    }])).toThrow("exactly one plan");
  });

  test("enforces every documented development threshold", () => {
    const fields = [
      ["planningMs", PROJECT_OPTION_EXPLAIN_THRESHOLDS.planningMs + 0.1],
      ["executionMs", PROJECT_OPTION_EXPLAIN_THRESHOLDS.executionMs + 0.1],
      ["sharedReadBlocks",
        PROJECT_OPTION_EXPLAIN_THRESHOLDS.sharedReadBlocks + 1],
      ["tempReadBlocks", 1],
      ["tempWrittenBlocks", 1],
    ] as const;

    for (const [field, value] of fields) {
      const plans = passingEvidence();
      plans[0] = { ...plans[0]!, [field]: value };
      expect(() => assertProjectOptionExplainThresholds(
        plans,
        LARGE_TENANT_PROJECT_CARDINALITY,
      )).toThrow();
    }
  });

  test("requires intended large-cardinality indexes and an index-ordered page", () => {
    const wrongTimeIndex = passingEvidence();
    wrongTimeIndex[0] = evidence("tenant_time_page", TRGM_INDEX);
    expect(() => assertProjectOptionExplainThresholds(
      wrongTimeIndex,
      LARGE_TENANT_PROJECT_CARDINALITY,
    )).toThrow(COMPOSITE_INDEX);

    const sorted = passingEvidence();
    sorted[0] = {
      ...sorted[0]!,
      nodeTypes: ["Sort", "Index Scan"],
      hasExplicitSort: true,
    };
    expect(() => assertProjectOptionExplainThresholds(
      sorted,
      LARGE_TENANT_PROJECT_CARDINALITY,
    )).toThrow("Sort");

    const wrongKeywordIndex = passingEvidence();
    wrongKeywordIndex[2] = evidence("tenant_time_keyword_page", "other_idx");
    expect(() => assertProjectOptionExplainThresholds(
      wrongKeywordIndex,
      LARGE_TENANT_PROJECT_CARDINALITY,
    )).toThrow("keyword");
  });

  test("allows planner-optional indexes only below the large tenant boundary", () => {
    const sequential = passingEvidence().map((item) => ({
      ...item,
      indexNames: [],
      nodeTypes: ["Seq Scan"],
    }));
    expect(assertProjectOptionExplainThresholds(
      sequential,
      LARGE_TENANT_PROJECT_CARDINALITY - 1,
    )).toBe(true);
  });
});
