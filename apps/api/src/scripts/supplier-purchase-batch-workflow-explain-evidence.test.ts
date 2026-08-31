import { describe, expect, test } from "bun:test";

import { WorkflowExplainError } from
  "./supplier-purchase-batch-workflow-explain-config";
import {
  WORKFLOW_EXPLAIN_CARDINALITY_LIMIT,
  WORKFLOW_EXPLAIN_ERROR_CODES,
  WORKFLOW_EXPLAIN_MANIFEST,
  WORKFLOW_EXPLAIN_QUERY_NAMES,
  WORKFLOW_EXPLAIN_THRESHOLDS,
  assertWorkflowExplainGate,
  classifyWorkflowCardinality,
  parseWorkflowExplainPlan,
  type WorkflowExplainGateInput,
  type WorkflowExplainIndexMetadata,
  type WorkflowExplainPlanEvidence,
  type WorkflowExplainQueryName,
} from "./supplier-purchase-batch-workflow-explain-evidence";

type Node = Record<string, unknown>;
type RootOverrides = Record<string, unknown>;

const INDEXES = {
  running_instance: "workflow_instances_running_purchase_batch_uidx",
  pending_task: "idx_workflow_tasks_instance_status",
  subject_state: "idx_workflow_subject_states_subject",
} as const;

function expectCode(callback: () => unknown, code: string): void {
  let caught: unknown;
  try {
    callback();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(WorkflowExplainError);
  if (caught instanceof WorkflowExplainError) expect(caught.code).toBe(code);
}

function relation(name: WorkflowExplainQueryName): string {
  return WORKFLOW_EXPLAIN_MANIFEST[name].relation;
}

function seqScan(name: WorkflowExplainQueryName): Node {
  return {
    "Node Type": "Seq Scan",
    "Relation Name": relation(name),
    Schema: "public",
  };
}

function otherScan(name: WorkflowExplainQueryName): Node {
  return {
    "Node Type": "Tid Scan",
    "Relation Name": relation(name),
    Schema: "public",
  };
}

function directScan(
  name: WorkflowExplainQueryName,
  indexName: string = INDEXES[name],
  nodeType: "Index Scan" | "Index Only Scan" = "Index Scan",
): Node {
  return {
    "Node Type": nodeType,
    "Relation Name": relation(name),
    Schema: "public",
    "Index Name": indexName,
  };
}

function bitmapScan(
  name: WorkflowExplainQueryName,
  indexName: string = INDEXES[name],
): Node {
  return {
    "Node Type": "Bitmap Heap Scan",
    "Relation Name": relation(name),
    Schema: "public",
    Plans: [{
      "Node Type": "Bitmap Index Scan",
      "Index Name": indexName,
    }],
  };
}

function rows(node: Node, overrides: RootOverrides = {}): unknown[] {
  return [{
    "QUERY PLAN": [{
      Plan: node,
      "Planning Time": 1.25,
      "Execution Time": 2.5,
      ...overrides,
    }],
  }];
}

function parsed(
  name: WorkflowExplainQueryName,
  node: Node = directScan(name),
  overrides: RootOverrides = {},
): WorkflowExplainPlanEvidence {
  return parseWorkflowExplainPlan(rows(node, overrides), name);
}

function metadata(): WorkflowExplainGateInput["indexMetadata"] {
  return Object.fromEntries(WORKFLOW_EXPLAIN_QUERY_NAMES.map((name) => [
    name,
    WORKFLOW_EXPLAIN_MANIFEST[name].indexes.map((indexName) => ({
      indexName,
      schema: "public",
      relation: relation(name),
      indisvalid: true,
      indisready: true,
    } satisfies WorkflowExplainIndexMetadata)),
  ])) as WorkflowExplainGateInput["indexMetadata"];
}

function passingInput(): WorkflowExplainGateInput {
  return {
    cardinalities: {
      running_instance: 12,
      pending_task: 34,
      subject_state: 56,
    },
    indexMetadata: metadata(),
    plannerSettings: [
      {
        name: "enable_seqscan",
        current: "on",
        bootValue: "on",
        category: "Query Tuning / Planner Method Configuration",
      },
      {
        name: "plan_cache_mode",
        current: "auto",
        bootValue: "auto",
        category: "Query Tuning / Other",
      },
    ],
    plans: WORKFLOW_EXPLAIN_QUERY_NAMES.map((name) => parsed(name)),
  };
}

function replacePlan(
  input: WorkflowExplainGateInput,
  replacement: WorkflowExplainPlanEvidence,
): void {
  input.plans = input.plans.map((plan) =>
    plan.name === replacement.name ? replacement : plan
  );
}

describe("supplier purchase workflow EXPLAIN constants", () => {
  test("locks thresholds, cardinality, queries, indexes, and error vocabulary", () => {
    expect(WORKFLOW_EXPLAIN_THRESHOLDS).toEqual({
      statementTimeoutMs: 5_000,
      planningMs: 50,
      executionMs: 250,
      sharedReadBlocks: 20_000,
      tempBlocks: 0,
    });
    expect(WORKFLOW_EXPLAIN_CARDINALITY_LIMIT).toBe(1_000);
    expect(WORKFLOW_EXPLAIN_QUERY_NAMES).toEqual([
      "running_instance", "pending_task", "subject_state",
    ]);
    expect(WORKFLOW_EXPLAIN_MANIFEST).toEqual({
      running_instance: {
        relation: "workflow_instances",
        indexes: [
          "workflow_instances_running_purchase_batch_uidx",
          "workflow_instances_purchase_batch_lookup_idx",
        ],
      },
      pending_task: {
        relation: "workflow_tasks",
        indexes: ["idx_workflow_tasks_instance_status"],
      },
      subject_state: {
        relation: "workflow_subject_states",
        indexes: ["idx_workflow_subject_states_subject"],
      },
    });
    expect(WORKFLOW_EXPLAIN_ERROR_CODES).toEqual([
      "INVALID_PLAN", "NON_DEFAULT_PLANNER", "INVALID_CARDINALITY",
      "INDEX_RELATION_MISMATCH", "INDEX_METADATA_INVALID", "UNKNOWN_PLAN",
      "DUPLICATE_PLAN", "MISSING_PLAN", "PLANNING_THRESHOLD",
      "EXECUTION_THRESHOLD", "SHARED_READ_THRESHOLD", "TEMP_BLOCKS",
      "LARGE_TABLE_SEQ_SCAN", "LARGE_TABLE_INDEX_REQUIRED",
    ]);
  });
});

describe("workflow EXPLAIN cardinality", () => {
  test("classifies the bounded count boundary", () => {
    expect(classifyWorkflowCardinality(0)).toBe("small");
    expect(classifyWorkflowCardinality(999)).toBe("small");
    expect(classifyWorkflowCardinality(1_000)).toBe("large");
  });

  test("rejects values outside the safe bounded count", () => {
    for (const value of [-1, 1_001, 1.5, NaN, Infinity, 2 ** 53]) {
      expectCode(() => classifyWorkflowCardinality(value), "INVALID_CARDINALITY");
    }
  });
});

describe("workflow EXPLAIN plan parsing", () => {
  test("parses JSON strings, safe settings, target facts, and buffers", () => {
    const value = rows(directScan("subject_state"), {
      Settings: { enable_seqscan: "on", jit: false, workers: 2, note: null },
    }) as Array<Record<string, unknown>>;
    value[0]!["QUERY PLAN"] = JSON.stringify(value[0]!["QUERY PLAN"]);
    expect(parseWorkflowExplainPlan(value, "subject_state")).toEqual({
      name: "subject_state",
      targetNodes: [{
        nodeType: "Index Scan",
        relation: "workflow_subject_states",
        schema: "public",
      }],
      indexNames: ["idx_workflow_subject_states_subject"],
      nodeTypes: ["Index Scan"],
      settings: { enable_seqscan: "on", jit: false, workers: 2, note: null },
      planningMs: 1.25,
      executionMs: 2.5,
      sharedHitBlocks: 0,
      sharedReadBlocks: 0,
      tempReadBlocks: 0,
      tempWrittenBlocks: 0,
    });
  });

  test("uses only top-level Plan buffers and validates their integer shape", () => {
    const node = directScan("subject_state");
    node["Shared Hit Blocks"] = 7;
    node["Shared Read Blocks"] = 8;
    node["Temp Read Blocks"] = 0;
    node["Temp Written Blocks"] = 0;
    node.Plans = [{
      "Node Type": "Result",
      "Shared Read Blocks": 99_999,
      "Temp Read Blocks": 99,
    }];
    const plan = parsed("subject_state", node);
    expect({
      hit: plan.sharedHitBlocks,
      read: plan.sharedReadBlocks,
      tempRead: plan.tempReadBlocks,
      tempWritten: plan.tempWrittenBlocks,
    }).toEqual({ hit: 7, read: 8, tempRead: 0, tempWritten: 0 });

    for (const invalid of [-1, 1.5, Infinity, 2 ** 53]) {
      const invalidNode = directScan("subject_state");
      invalidNode["Shared Read Blocks"] = invalid;
      expectCode(
        () => parsed("subject_state", invalidNode),
        "INVALID_PLAN",
      );
    }
  });

  test("rejects malformed rows, JSON, roots, settings, timings, and nodes", () => {
    const invalid: unknown[] = [
      [], [{ "QUERY PLAN": "{" }], [{ "QUERY PLAN": [] }],
      [{ "QUERY PLAN": [{}, {}] }], [{ "QUERY PLAN": [null] }],
      rows(seqScan("subject_state"), { "Planning Time": -1 }),
      rows(seqScan("subject_state"), { "Execution Time": Infinity }),
      rows(seqScan("subject_state"), { Settings: [] }),
      rows(seqScan("subject_state"), { Settings: { enable_seqscan: {} } }),
      rows(null as unknown as Node),
      rows({ "Node Type": 4 }),
      rows({ "Node Type": "Append", Plans: {} }),
      rows({ "Node Type": "Append", Plans: [null] }),
      rows({
        ...directScan("subject_state"),
        "Index Name": undefined,
      }),
      rows({
        ...bitmapScan("subject_state"),
        Plans: [{ "Node Type": "Bitmap Index Scan" }],
      }),
    ];
    for (const value of invalid) {
      expectCode(
        () => parseWorkflowExplainPlan(value, "subject_state"),
        "INVALID_PLAN",
      );
    }
  });

  test("rejects the wrong target schema and permits Seq Scan without an index", () => {
    const wrongSchema = seqScan("subject_state");
    wrongSchema.Schema = "private";
    expectCode(() => parsed("subject_state", wrongSchema), "INVALID_PLAN");

    const sequential = parsed("subject_state", seqScan("subject_state"));
    expect(sequential.indexNames).toEqual([]);
    expect(sequential.settings).toEqual({});
    expect(sequential.targetNodes).toEqual([{
      nodeType: "Seq Scan",
      relation: "workflow_subject_states",
      schema: "public",
    }]);

    expectCode(() => parsed("subject_state", {
      "Node Type": "Result",
      Plans: [seqScan("pending_task")],
    }), "INVALID_PLAN");
  });
});

describe("workflow EXPLAIN gate", () => {
  test("allows small Seq Scan and approved direct and bitmap large scans", () => {
    const small = passingInput();
    replacePlan(small, parsed("subject_state", seqScan("subject_state")));
    expect(assertWorkflowExplainGate(small)).toBe(true);

    for (const node of [
      directScan("subject_state"),
      directScan("subject_state", INDEXES.subject_state, "Index Only Scan"),
      bitmapScan("subject_state"),
    ]) {
      const large = passingInput();
      large.cardinalities.subject_state = 1_000;
      replacePlan(large, parsed("subject_state", node));
      expect(assertWorkflowExplainGate(large)).toBe(true);
    }
  });

  test("rejects large target Seq Scan, wrong indexes, and unrelated bitmap trees", () => {
    const cases: Array<[Node, string]> = [
      [seqScan("subject_state"), "LARGE_TABLE_SEQ_SCAN"],
      [directScan("subject_state", "unapproved_idx"),
        "LARGE_TABLE_INDEX_REQUIRED"],
      [{
        "Node Type": "Append",
        Plans: [
          otherScan("subject_state"),
          bitmapScan("pending_task", INDEXES.subject_state),
        ],
      }, "LARGE_TABLE_INDEX_REQUIRED"],
    ];
    for (const [node, code] of cases) {
      const input = passingInput();
      input.cardinalities.subject_state = 1_000;
      replacePlan(input, parsed("subject_state", node));
      expectCode(() => assertWorkflowExplainGate(input), code);
    }
  });

  test("enforces current and EXPLAIN planner defaults but allows timeout", () => {
    const current = passingInput();
    current.plannerSettings[0]!.current = "off";
    expectCode(() => assertWorkflowExplainGate(current), "NON_DEFAULT_PLANNER");

    const complete = passingInput().plannerSettings;
    for (const incomplete of [[], [complete[0]!], [complete[1]!]]) {
      const input = passingInput();
      input.plannerSettings = incomplete;
      expectCode(() => assertWorkflowExplainGate(input), "NON_DEFAULT_PLANNER");
    }

    const explained = passingInput();
    replacePlan(explained, parsed("running_instance", directScan(
      "running_instance",
    ), { Settings: { enable_seqscan: "off" } }));
    expectCode(() => assertWorkflowExplainGate(explained), "NON_DEFAULT_PLANNER");

    const allowed = passingInput();
    replacePlan(allowed, parsed("running_instance", directScan(
      "running_instance",
    ), { Settings: { statement_timeout: "5s" } }));
    expect(assertWorkflowExplainGate(allowed)).toBe(true);
  });

  test("passes threshold boundaries and reports each threshold above them", () => {
    const boundary = passingInput();
    boundary.plans[0] = {
      ...boundary.plans[0]!,
      planningMs: 50,
      executionMs: 250,
      sharedReadBlocks: 20_000,
    };
    expect(assertWorkflowExplainGate(boundary)).toBe(true);

    const failures = [
      ["planningMs", 50.01, "PLANNING_THRESHOLD"],
      ["executionMs", 250.01, "EXECUTION_THRESHOLD"],
      ["sharedReadBlocks", 20_001, "SHARED_READ_THRESHOLD"],
      ["tempReadBlocks", 1, "TEMP_BLOCKS"],
      ["tempWrittenBlocks", 1, "TEMP_BLOCKS"],
    ] as const;
    for (const [field, value, code] of failures) {
      const input = passingInput();
      input.plans[0] = { ...input.plans[0]!, [field]: value };
      expectCode(() => assertWorkflowExplainGate(input), code);
    }
  });

  test("requires every expected index exactly once on its declared relation", () => {
    const missing = passingInput();
    missing.indexMetadata.running_instance = missing.indexMetadata
      .running_instance.slice(0, 1);
    expectCode(() => assertWorkflowExplainGate(missing), "INDEX_METADATA_INVALID");

    const duplicate = passingInput();
    duplicate.indexMetadata.pending_task.push({
      ...duplicate.indexMetadata.pending_task[0]!,
    });
    expectCode(() => assertWorkflowExplainGate(duplicate), "INDEX_METADATA_INVALID");

    for (const field of ["indisvalid", "indisready"] as const) {
      const invalid = passingInput();
      invalid.indexMetadata.subject_state[0]![field] = false;
      expectCode(() => assertWorkflowExplainGate(invalid), "INDEX_METADATA_INVALID");
    }

    const nonBoolean = passingInput();
    Object.assign(nonBoolean.indexMetadata.subject_state[0]!, {
      indisvalid: 1,
      indisready: "yes",
    });
    expectCode(() => assertWorkflowExplainGate(nonBoolean),
      "INDEX_METADATA_INVALID");

    for (const [field, value] of [
      ["schema", "private"], ["relation", "workflow_tasks"],
    ] as const) {
      const mismatched = passingInput();
      Object.assign(mismatched.indexMetadata.subject_state[0]!, {
        [field]: value,
        indisvalid: false,
      });
      expectCode(
        () => assertWorkflowExplainGate(mismatched),
        "INDEX_RELATION_MISMATCH",
      );
    }
  });

  test("uses unknown, duplicate, then missing plan-set priority", () => {
    const unknown = passingInput();
    unknown.plans.push({ ...unknown.plans[0]!, name: "unknown" } as never);
    expectCode(() => assertWorkflowExplainGate(unknown), "UNKNOWN_PLAN");

    const duplicate = passingInput();
    duplicate.plans.push(duplicate.plans[0]!);
    duplicate.plans = duplicate.plans.filter((plan) =>
      plan.name !== "subject_state"
    );
    expectCode(() => assertWorkflowExplainGate(duplicate), "DUPLICATE_PLAN");

    const missing = passingInput();
    missing.plans = missing.plans.filter((plan) => plan.name !== "subject_state");
    expectCode(() => assertWorkflowExplainGate(missing), "MISSING_PLAN");
  });

  test("keeps cardinality, metadata, planning, and large-scan priority stable", () => {
    const cardinality = passingInput();
    cardinality.cardinalities.running_instance = -1;
    cardinality.indexMetadata.running_instance = [];
    cardinality.plans.push({ ...cardinality.plans[0]!, name: "unknown" } as never);
    expectCode(() => assertWorkflowExplainGate(cardinality), "INVALID_CARDINALITY");

    const metadataFirst = passingInput();
    metadataFirst.indexMetadata.running_instance = [];
    metadataFirst.plans.push({ ...metadataFirst.plans[0]!, name: "unknown" } as never);
    expectCode(() => assertWorkflowExplainGate(metadataFirst),
      "INDEX_METADATA_INVALID");

    const planningFirst = passingInput();
    planningFirst.cardinalities.subject_state = 1_000;
    replacePlan(planningFirst, {
      ...parsed("subject_state", seqScan("subject_state")),
      planningMs: 50.01,
    });
    expectCode(() => assertWorkflowExplainGate(planningFirst),
      "PLANNING_THRESHOLD");
  });
});
