import { describe, expect, test } from "bun:test";

import { WorkflowExplainError } from
  "./supplier-purchase-batch-workflow-explain-config";
import {
  WORKFLOW_EXPLAIN_MANIFEST,
  WORKFLOW_EXPLAIN_QUERY_NAMES,
  assertWorkflowExplainGate,
  assertWorkflowExplainRawGate,
  parseWorkflowExplainPlan,
  type WorkflowExplainGateInput,
  type WorkflowExplainIndexMetadata,
  type WorkflowExplainPlanEvidence,
  type WorkflowExplainQueryName,
  type WorkflowExplainRawGateInput,
} from "./supplier-purchase-batch-workflow-explain-evidence";

type Node = Record<string, unknown>;

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

function directScan(name: WorkflowExplainQueryName): Node {
  return {
    "Node Type": "Index Scan",
    "Relation Name": relation(name),
    Schema: "public",
    "Index Name": INDEXES[name],
  };
}

function rows(
  node: Node,
  overrides: Record<string, unknown> = {},
): unknown[] {
  return [{
    "QUERY PLAN": [{
      Plan: node,
      "Planning Time": 1,
      "Execution Time": 2,
      ...overrides,
    }],
  }];
}

function parsed(
  name: WorkflowExplainQueryName,
  node: Node = directScan(name),
  overrides: Record<string, unknown> = {},
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
      running_instance: 10,
      pending_task: 20,
      subject_state: 30,
    },
    indexMetadata: metadata(),
    plannerSettings: [
      {
        name: "enable_seqscan",
        current: "on",
        rawValue: "on",
        bootValue: "on",
        category: "Query Tuning / Planner Method Configuration",
        source: "default",
      },
      {
        name: "plan_cache_mode",
        current: "auto",
        rawValue: "auto",
        bootValue: "auto",
        category: "Query Tuning / Other",
        source: "default",
      },
    ],
    plans: WORKFLOW_EXPLAIN_QUERY_NAMES.map((name) => parsed(name)),
  };
}

function catalogPlannerSettings(): WorkflowExplainGateInput["plannerSettings"] {
  return [
    {
      name: "enable_seqscan",
      current: "on",
      rawValue: "on",
      bootValue: "on",
      category: "Query Tuning / Planner Method Configuration",
      source: "default",
    },
    {
      name: "plan_cache_mode",
      current: "auto",
      rawValue: "auto",
      bootValue: "auto",
      category: "Query Tuning / Other",
      source: "default",
    },
  ];
}

function passingRawInput(): WorkflowExplainRawGateInput {
  const parsedInput = passingInput();
  return {
    cardinalities: parsedInput.cardinalities,
    indexMetadata: parsedInput.indexMetadata,
    plannerSettings: catalogPlannerSettings(),
    plans: WORKFLOW_EXPLAIN_QUERY_NAMES.map((name) => ({
      name,
      rows: rows(directScan(name)),
    })),
  };
}

describe("workflow EXPLAIN adversarial bitmap evidence", () => {
  test("does not inherit target bitmap context through an unrelated heap", () => {
    const targetWithUnrelatedHeap: Node = {
      "Node Type": "Bitmap Heap Scan",
      "Relation Name": relation("subject_state"),
      Schema: "public",
      Plans: [{
        "Node Type": "Bitmap Heap Scan",
        "Relation Name": relation("pending_task"),
        Schema: "public",
        Plans: [{
          "Node Type": "Bitmap Index Scan",
          "Index Name": INDEXES.subject_state,
        }],
      }],
    };
    const input = passingInput();
    input.cardinalities.subject_state = 1_000;
    input.plans[2] = parsed("subject_state", targetWithUnrelatedHeap);

    expectCode(
      () => assertWorkflowExplainGate(input),
      "LARGE_TABLE_INDEX_REQUIRED",
    );
  });
});

describe("workflow EXPLAIN adversarial planner evidence", () => {
  test("accepts catalog-derived planner rows with exact categories", () => {
    const input = passingInput();
    input.plannerSettings = catalogPlannerSettings();
    expect(assertWorkflowExplainGate(input)).toBe(true);
  });

  test("accepts only the registered managed effective cache baseline", () => {
    const input = passingInput();
    input.plannerSettings = [{
      name: "effective_cache_size",
      current: "128MB",
      rawValue: "16384",
      bootValue: "524288",
      category: "Query Tuning / Planner Cost Constants",
      source: "configuration file",
    }, catalogPlannerSettings()[1]!] as never;
    input.plans[0] = parsed("running_instance", directScan(
      "running_instance",
    ), { Settings: { effective_cache_size: "128MB" } });

    expect(assertWorkflowExplainGate(input)).toBe(true);
  });

  test("accepts default planner settings with PostgreSQL unit formatting", () => {
    const input = passingInput();
    input.plannerSettings = [
      {
        name: "min_parallel_table_scan_size",
        current: "8MB", rawValue: "1024", bootValue: "1024",
        category: "Query Tuning / Planner Cost Constants",
        source: "default",
      },
      {
        name: "min_parallel_index_scan_size",
        current: "512kB", rawValue: "64", bootValue: "64",
        category: "Query Tuning / Planner Cost Constants",
        source: "default",
      },
      catalogPlannerSettings()[1]!,
    ];

    expect(assertWorkflowExplainGate(input)).toBe(true);
  });

  test("accepts only the exact dev role search path reported by EXPLAIN", () => {
    const input = passingInput();
    input.plannerSettings.push({
      name: "search_path",
      current: "\"\\$user\", public, extensions",
      rawValue: "\"\\$user\", public, extensions",
      bootValue: "\"$user\", public",
      category: "Client Connection Defaults / Statement Behavior",
      source: "user",
    });
    input.plans[0] = parsed("running_instance", directScan(
      "running_instance",
    ), { Settings: { search_path: "\"\\$user\", public, extensions" } });

    expect(assertWorkflowExplainGate(input)).toBe(true);

    const changed = structuredClone(input);
    changed.plannerSettings[2]!.current = "public";
    changed.plannerSettings[2]!.rawValue = "public";
    changed.plans[0] = parsed("running_instance", directScan(
      "running_instance",
    ), { Settings: { search_path: "public" } });
    expectCode(() => assertWorkflowExplainGate(changed), "NON_DEFAULT_PLANNER");
  });

  test("rejects unregistered or transient planner overrides", () => {
    for (const plannerSetting of [
      {
        name: "enable_seqscan",
        current: "off",
        rawValue: "off",
        bootValue: "on",
        category: "Query Tuning / Planner Method Configuration",
        source: "configuration file",
      },
      {
        name: "effective_cache_size",
        current: "128MB",
        rawValue: "16384",
        bootValue: "524288",
        category: "Query Tuning / Planner Cost Constants",
        source: "session",
      },
      {
        name: "effective_cache_size",
        current: "64MB",
        rawValue: "8192",
        bootValue: "524288",
        category: "Query Tuning / Planner Cost Constants",
        source: "configuration file",
      },
    ]) {
      const input = passingInput();
      input.plannerSettings = [
        plannerSetting,
        catalogPlannerSettings()[1]!,
      ] as never;
      expectCode(() => assertWorkflowExplainGate(input), "NON_DEFAULT_PLANNER");
    }
  });

  test("rejects malformed, duplicate, and contradictory planner rows safely", () => {
    const valid = catalogPlannerSettings();
    const malformed: unknown[] = [
      null,
      {},
      [null],
      [{ ...valid[0]!, current: 1 }, valid[1]!],
      [valid[0]!, valid[0]!, valid[1]!],
      [{ ...valid[0]!, bootValue: "off" }, valid[1]!],
      [{ ...valid[0]!, name: " " }, valid[1]!],
      [{ ...valid[0]!, category: "Connections" }, valid[1]!],
    ];
    for (const plannerSettings of malformed) {
      const input = passingInput();
      input.plannerSettings = plannerSettings as never;
      expectCode(() => assertWorkflowExplainGate(input), "NON_DEFAULT_PLANNER");
    }
  });

  test("fails closed for unregistered EXPLAIN settings but allows timeout", () => {
    for (const settings of [
      { enable_hashjoin: "off" },
      { unknown_setting: "custom" },
    ]) {
      const input = passingInput();
      input.plannerSettings = catalogPlannerSettings();
      input.plans[0] = parsed("running_instance", directScan(
        "running_instance",
      ), { Settings: settings });
      expectCode(() => assertWorkflowExplainGate(input), "NON_DEFAULT_PLANNER");
    }

    const allowed = passingInput();
    allowed.plannerSettings = catalogPlannerSettings();
    allowed.plans[0] = parsed("running_instance", directScan(
      "running_instance",
    ), { Settings: { statement_timeout: "5s" } });
    expect(assertWorkflowExplainGate(allowed)).toBe(true);
  });
});

describe("workflow EXPLAIN raw gate ordering", () => {
  test("checks current planner settings before cardinality", () => {
    const input = passingRawInput();
    input.plannerSettings[0]!.current = "off";
    input.plannerSettings[0]!.rawValue = "off";
    input.cardinalities.running_instance = -1;
    expectCode(
      () => assertWorkflowExplainRawGate(input),
      "NON_DEFAULT_PLANNER",
    );
  });

  test("checks an earlier query threshold before parsing a later query", () => {
    const input = passingRawInput();
    input.plans[0]!.rows = rows(directScan("running_instance"), {
      "Planning Time": 50.01,
    });
    input.plans[2]!.rows = [];
    expectCode(
      () => assertWorkflowExplainRawGate(input),
      "PLANNING_THRESHOLD",
    );
  });

  test("rejects malformed JSON for the current query after valid globals", () => {
    const input = passingRawInput();
    input.plans[0]!.rows = [];
    expectCode(() => assertWorkflowExplainRawGate(input), "INVALID_PLAN");
  });

  test("checks raw wrapper names before parsing their rows", () => {
    const unknown = passingRawInput();
    unknown.plans.push({ name: "unknown", rows: [] });
    expectCode(() => assertWorkflowExplainRawGate(unknown), "UNKNOWN_PLAN");

    const duplicate = passingRawInput();
    duplicate.plans.push({ ...duplicate.plans[0]!, rows: [] });
    expectCode(() => assertWorkflowExplainRawGate(duplicate), "DUPLICATE_PLAN");

    const missing = passingRawInput();
    missing.plans.pop();
    expectCode(() => assertWorkflowExplainRawGate(missing), "MISSING_PLAN");
  });
});
