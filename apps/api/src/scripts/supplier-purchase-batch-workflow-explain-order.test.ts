import { describe, expect, test } from "bun:test";

import {
  WORKFLOW_EXPLAIN_SOURCE,
  WorkflowExplainError,
  type WorkflowExplainConfig,
} from "./supplier-purchase-batch-workflow-explain-config";
import {
  WORKFLOW_EXPLAIN_MANIFEST,
  WORKFLOW_EXPLAIN_THRESHOLDS,
} from "./supplier-purchase-batch-workflow-explain-evidence";
import {
  WORKFLOW_EXPLAIN_QUERIES,
  runWorkflowExplainGate,
  type WorkflowExplainDatabase,
  type WorkflowExplainDependencies,
  type WorkflowExplainSql,
} from "./supplier-purchase-batch-workflow-explain";

const CONFIG: WorkflowExplainConfig = {
  databaseUrl: "postgresql://privileged:secret@dev.example.test/gooes",
  evidenceFile: "/tmp/supplier-purchase-workflow-evidence.json",
};

type EventName =
  | "set-transaction"
  | "statement-timeout"
  | "guard-start"
  | "guard-end"
  | "role"
  | "planner"
  | "preflight"
  | "count:workflow_instances"
  | "count:workflow_tasks"
  | "count:workflow_subject_states"
  | "metadata"
  | "explain:running_instance"
  | "explain:pending_task"
  | "explain:subject_state";

type HarnessOptions = {
  responses?: Partial<Record<EventName, unknown>>;
  failures?: Partial<Record<EventName, unknown>>;
  onEvent?: (event: EventName) => void;
};

function plan(
  relation: string,
  rootOverrides: Record<string, unknown> = {},
): unknown {
  return [{
    "QUERY PLAN": [{
      Plan: {
        "Node Type": "Seq Scan",
        "Relation Name": relation,
        Schema: "public",
        "Shared Hit Blocks": 1,
        "Shared Read Blocks": 2,
        "Temp Read Blocks": 0,
        "Temp Written Blocks": 0,
      },
      Settings: {},
      "Planning Time": 1,
      "Execution Time": 2,
      ...rootOverrides,
    }],
  }];
}

function plannerRows() {
  return [
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
      category: "Connections / Other Defaults",
    },
  ];
}

const METADATA_ROWS = Object.values(WORKFLOW_EXPLAIN_MANIFEST).flatMap(
  (entry) => entry.indexes.map((indexName) => ({
    indexName,
    schema: "public",
    relation: entry.relation,
    indisvalid: true,
    indisready: true,
  })),
);

function classify(text: string, guardCount: number): EventName {
  const normalized = text.toLowerCase().replaceAll(/\s+/g, " ").trim();
  if (normalized ===
    "set transaction isolation level repeatable read, read only") {
    return "set-transaction";
  }
  if (normalized === "set local statement_timeout = '5000ms'") {
    return "statement-timeout";
  }
  if (normalized.includes("pg_backend_pid()")) {
    return guardCount === 0 ? "guard-start" : "guard-end";
  }
  if (normalized.includes("from pg_roles")) return "role";
  if (normalized.includes("from pg_settings")) return "planner";
  if (normalized.includes("from pg_index")) return "metadata";
  if (normalized.startsWith("explain ")) {
    if (normalized.includes("from public.workflow_tasks")) {
      return "explain:pending_task";
    }
    if (normalized.includes("from public.workflow_subject_states")) {
      return "explain:subject_state";
    }
    return "explain:running_instance";
  }
  const bounded = normalized.match(
    /from \(select 1 from public\.(workflow_[a-z_]+) limit 1000\)/,
  );
  if (bounded) return `count:${bounded[1]}` as EventName;
  return "preflight";
}

function defaultResponse(event: EventName): unknown {
  if (event.startsWith("set-")) return [];
  if (event.startsWith("guard-")) {
    return [{ backendPid: 4242, readOnly: "on", isolation: "repeatable read" }];
  }
  if (event === "role") return [{ rolsuper: true, rolbypassrl: false }];
  if (event === "planner") return plannerRows();
  if (event === "preflight") {
    return [{ id: WORKFLOW_EXPLAIN_SOURCE.instanceId }];
  }
  if (event.startsWith("count:")) return [{ count: 7 }];
  if (event === "metadata") return METADATA_ROWS;
  if (event === "explain:running_instance") return plan("workflow_instances");
  if (event === "explain:pending_task") return plan("workflow_tasks");
  return plan("workflow_subject_states");
}

function makeHarness(options: HarnessOptions = {}) {
  const events: string[] = [];
  let guardCount = 0;
  const transaction: WorkflowExplainSql = {
    async unsafe(text) {
      const event = classify(text, guardCount);
      if (event.startsWith("guard-")) guardCount += 1;
      events.push(event);
      options.onEvent?.(event);
      if (Object.hasOwn(options.failures ?? {}, event)) {
        throw options.failures![event];
      }
      return Object.hasOwn(options.responses ?? {}, event)
        ? options.responses![event]
        : defaultResponse(event);
    },
  };
  const database: WorkflowExplainDatabase = {
    async begin<Result>(callback: (sql: WorkflowExplainSql) => Promise<Result>) {
      events.push("begin");
      return callback(transaction);
    },
    async close() {
      events.push("close");
    },
  };
  const dependencies: WorkflowExplainDependencies = {
    createDatabase: () => database,
  };
  return { dependencies, events };
}

async function failGate(options: HarnessOptions) {
  const harness = makeHarness(options);
  let error: unknown;
  try {
    await runWorkflowExplainGate(
      CONFIG,
      WORKFLOW_EXPLAIN_SOURCE,
      harness.dependencies,
    );
  } catch (caught) {
    error = caught;
  }
  expect(error).toBeInstanceOf(WorkflowExplainError);
  return { error: error as WorkflowExplainError, events: harness.events };
}

describe("supplier purchase workflow EXPLAIN phase ordering", () => {
  test("rejects planner drift before preflight or later failures", async () => {
    const nonDefaultPlanner = plannerRows();
    nonDefaultPlanner[0]!.current = "off";
    const { error, events } = await failGate({
      responses: {
        planner: nonDefaultPlanner,
        preflight: [],
      },
      failures: {
        "explain:running_instance": { code: "57014" },
      },
    });

    expect(error.code).toBe("NON_DEFAULT_PLANNER");
    expect(events).not.toContain("preflight");
    expect(events.some((event) => event.startsWith("explain:"))).toBe(false);
  });

  test("rejects metadata before any EXPLAIN statement", async () => {
    const { error, events } = await failGate({
      responses: { metadata: METADATA_ROWS.slice(1) },
      failures: { "explain:running_instance": { code: "57014" } },
    });

    expect(error.code).toBe("INDEX_METADATA_INVALID");
    expect(events.some((event) => event.startsWith("explain:"))).toBe(false);
  });

  test("rejects a malformed running plan before fetching pending", async () => {
    const { error, events } = await failGate({
      responses: {
        "explain:running_instance": [{ "QUERY PLAN": "not-json" }],
      },
      failures: { "explain:pending_task": { code: "57014" } },
    });

    expect(error.code).toBe("INVALID_PLAN");
    expect(events).not.toContain("explain:pending_task");
  });

  test("rejects a running threshold before fetching pending", async () => {
    const { error, events } = await failGate({
      responses: {
        "explain:running_instance": plan("workflow_instances", {
          "Planning Time": WORKFLOW_EXPLAIN_THRESHOLDS.planningMs + 1,
        }),
      },
      failures: { "explain:pending_task": { code: "57014" } },
    });

    expect(error.code).toBe("PLANNING_THRESHOLD");
    expect(events).not.toContain("explain:pending_task");
  });

  test("keeps the successful database event order unchanged", async () => {
    const harness = makeHarness();
    await runWorkflowExplainGate(
      CONFIG,
      WORKFLOW_EXPLAIN_SOURCE,
      harness.dependencies,
    );
    expect(harness.events).toEqual([
      "begin",
      "set-transaction",
      "statement-timeout",
      "guard-start",
      "role",
      "planner",
      "preflight",
      "count:workflow_instances",
      "count:workflow_tasks",
      "count:workflow_subject_states",
      "metadata",
      "explain:running_instance",
      "explain:pending_task",
      "explain:subject_state",
      "guard-end",
      "close",
    ]);
  });

  test("still applies the final raw gate after the ending guard", async () => {
    const settings = plannerRows();
    const { error, events } = await failGate({
      responses: { planner: settings },
      onEvent(event) {
        if (event === "guard-end") settings[0]!.current = "off";
      },
    });
    expect(error.code).toBe("NON_DEFAULT_PLANNER");
    expect(events.slice(-2)).toEqual(["guard-end", "close"]);
  });
});

test("workflow EXPLAIN query registry is runtime immutable", () => {
  const original = WORKFLOW_EXPLAIN_QUERIES.running_instance;
  try {
    expect(Object.isFrozen(WORKFLOW_EXPLAIN_QUERIES)).toBe(true);
    expect(Reflect.set(
      WORKFLOW_EXPLAIN_QUERIES,
      "running_instance",
      "select sensitive mutation",
    )).toBe(false);
    expect(WORKFLOW_EXPLAIN_QUERIES.running_instance).toBe(original);
  } finally {
    if (WORKFLOW_EXPLAIN_QUERIES.running_instance !== original) {
      Reflect.set(WORKFLOW_EXPLAIN_QUERIES, "running_instance", original);
    }
  }
});
