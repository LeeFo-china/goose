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
const EVIDENCE = WORKFLOW_EXPLAIN_SOURCE;
const QUERY_NAMES = [
  "running_instance",
  "pending_task",
  "subject_state",
] as const;
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
  | `explain:${typeof QUERY_NAMES[number]}`;

type HarnessOptions = {
  responses?: Partial<Record<EventName, unknown>>;
  failures?: Partial<Record<EventName, unknown>>;
  closeFailure?: unknown;
};

function plan(relation: string, overrides: Record<string, unknown> = {}) {
  return [{
    "QUERY PLAN": [{
      Plan: {
        "Node Type": "Seq Scan",
        "Relation Name": relation,
        Schema: "public",
        "Shared Hit Blocks": 11,
        "Shared Read Blocks": 12,
        "Temp Read Blocks": 0,
        "Temp Written Blocks": 0,
      },
      Settings: {},
      "Planning Time": 1.25,
      "Execution Time": 2.5,
      ...overrides,
    }],
  }];
}

const PLANNER_ROWS = [
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
    category: "Query Tuning / Other Planner Options",
  },
];

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
  if (event === "role") return [{ rolsuper: false, rolbypassrl: true }];
  if (event === "planner") return PLANNER_ROWS;
  if (event === "preflight") return [{ id: EVIDENCE.instanceId }];
  if (event.startsWith("count:")) return [{ count: 7 }];
  if (event === "metadata") return METADATA_ROWS;
  if (event === "explain:running_instance") {
    return plan("workflow_instances");
  }
  if (event === "explain:pending_task") return plan("workflow_tasks");
  return plan("workflow_subject_states");
}

function makeHarness(options: HarnessOptions = {}) {
  const events: string[] = [];
  const calls: Array<{ event: EventName; text: string; values?: unknown[] }> = [];
  let guardCount = 0;
  let beginCount = 0;
  const transaction: WorkflowExplainSql = {
    async unsafe(text, values) {
      const event = classify(text, guardCount);
      if (event.startsWith("guard-")) guardCount += 1;
      events.push(event);
      calls.push({ event, text, values });
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
      beginCount += 1;
      events.push("begin");
      return callback(transaction);
    },
    async close() {
      events.push("close");
      if (options.closeFailure !== undefined) throw options.closeFailure;
    },
  };
  const dependencies: WorkflowExplainDependencies = {
    createDatabase(databaseUrl) {
      expect(databaseUrl).toBe(CONFIG.databaseUrl);
      return database;
    },
  };
  return { beginCount: () => beginCount, calls, dependencies, events, transaction };
}

async function captureFailure(
  options: HarnessOptions,
): Promise<{ error: WorkflowExplainError; events: string[] }> {
  const harness = makeHarness(options);
  let error: unknown;
  try {
    await runWorkflowExplainGate(CONFIG, EVIDENCE, harness.dependencies);
  } catch (caught) {
    error = caught;
  }
  expect(error).toBeInstanceOf(WorkflowExplainError);
  return { error: error as WorkflowExplainError, events: harness.events };
}

describe("supplier purchase workflow EXPLAIN SQL", () => {
  test("exports the exact three bounded read plans in manifest order", () => {
    const explain = "explain (analyze, buffers, settings, verbose, format json)";
    expect(WORKFLOW_EXPLAIN_QUERIES).toEqual({
      running_instance: `${explain}\nselect id from public.workflow_instances\nwhere tenant_id = $1::uuid and subject_type = 'supplier_purchase_batch'\n  and subject_id = $2::text and status = 'running'\norder by created_at desc, id desc\nlimit 2`,
      pending_task: `${explain}\nselect id from public.workflow_tasks\nwhere tenant_id = $1::uuid and instance_id = $2::uuid and status = 'pending'\norder by created_at asc, id asc\nlimit 2`,
      subject_state: `${explain}\nselect subject_id from public.workflow_subject_states\nwhere tenant_id = $1::uuid and subject_type = 'supplier_purchase_batch'\n  and subject_id = $2::text\nlimit 2`,
    });
    for (const text of Object.values(WORKFLOW_EXPLAIN_QUERIES)) {
      expect(text).not.toMatch(
        /^\s*(?:insert|update|delete|merge|create|alter|drop|truncate|analyze)\b/i,
      );
    }
  });

  test("runs one read-only transaction with fixed SQL and exact bindings", async () => {
    const harness = makeHarness();
    await runWorkflowExplainGate(CONFIG, EVIDENCE, harness.dependencies);

    expect(harness.beginCount()).toBe(1);
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
    expect(harness.calls[0]!.text).toBe(
      "set transaction isolation level repeatable read, read only",
    );
    expect(harness.calls[1]!.text).toBe(
      "set local statement_timeout = '5000ms'",
    );
    expect(harness.calls.find((call) => call.event === "preflight")!.values)
      .toEqual([EVIDENCE.instanceId, EVIDENCE.tenantId, EVIDENCE.batchId]);
    expect(harness.calls.filter((call) => call.event.startsWith("count:"))
      .map((call) => call.values)).toEqual([undefined, undefined, undefined]);
    expect(harness.calls.filter((call) => call.event.startsWith("explain:"))
      .map((call) => call.values)).toEqual([
        [EVIDENCE.tenantId, EVIDENCE.batchId],
        [EVIDENCE.tenantId, EVIDENCE.instanceId],
        [EVIDENCE.tenantId, EVIDENCE.batchId],
      ]);
  });

  test("uses the fixed complete planner and index catalog predicates", async () => {
    const harness = makeHarness();
    await runWorkflowExplainGate(CONFIG, EVIDENCE, harness.dependencies);
    const role = harness.calls.find((call) => call.event === "role")!.text;
    expect(role).toContain('roles.rolbypassrls AS "rolbypassrl"');
    expect(role).not.toMatch(/roles\.rolbypassrl(?!s)/);
    const planner = harness.calls.find((call) => call.event === "planner")!.text;
    expect(planner).toContain('setting AS "current"');
    expect(planner).toContain('boot_val AS "bootValue"');
    expect(planner).toContain("category LIKE 'Query Tuning /%'");
    expect(planner).toContain("OR name = 'plan_cache_mode'");
    expect(planner.toLowerCase()).toContain("order by name");

    const metadata = harness.calls.find((call) => call.event === "metadata")!.text;
    for (const row of METADATA_ROWS) expect(metadata).toContain(row.indexName);
    expect(metadata).toContain('AS "indexName"');
    expect(metadata).toMatch(/join\s+pg_namespace\s+as\s+\w+/gi);
    expect(metadata).toContain("= 'public'");

    for (const relation of Object.values(WORKFLOW_EXPLAIN_MANIFEST)
      .map((item) => item.relation)) {
      const count = harness.calls.find(
        (call) => call.event === `count:${relation}`,
      )!.text.toLowerCase().replaceAll(/\s+/g, " ").trim();
      expect(count).toBe(
        `select count(*)::integer as count from (select 1 from public.${relation} limit 1000) as bounded_rows`,
      );
    }
  });
});

describe("supplier purchase workflow EXPLAIN guards", () => {
  test.each([
    ["read-only", { responses: { "guard-start": [{ backendPid: 1, readOnly: "off", isolation: "repeatable read" }] } }],
    ["isolation", { responses: { "guard-start": [{ backendPid: 1, readOnly: "on", isolation: "read committed" }] } }],
    ["malformed", { responses: { "guard-start": [{ backendPid: "1", readOnly: "on", isolation: "repeatable read" }] } }],
    ["backend", { responses: { "guard-start": [{ backendPid: 1, readOnly: "on", isolation: "repeatable read" }], "guard-end": [{ backendPid: 2, readOnly: "on", isolation: "repeatable read" }] } }],
  ])("rejects an invalid %s transaction guard", async (_label, options) => {
    const { error } = await captureFailure(options);
    expect(error.code).toBe("TRANSACTION_GUARD_INVALID");
  });

  test("accepts only one privileged role row", async () => {
    for (const roleRows of [
      [{ rolsuper: false, rolbypassrl: false }],
      [{ rolsuper: "true", rolbypassrl: false }],
      [],
      [{ rolsuper: true, rolbypassrl: false }, { rolsuper: true, rolbypassrl: false }],
    ]) {
      const { error } = await captureFailure({ responses: { role: roleRows } });
      expect(error.code).toBe("INVALID_DEV_TARGET");
      expect(String(error)).not.toContain("privileged");
    }
  });

  test("rejects invalid fixed-instance preflight evidence", async () => {
    for (const rows of [
      [],
      [{ id: EVIDENCE.instanceId }, { id: EVIDENCE.instanceId }],
      [{ id: "00000000-0000-4000-8000-000000000000" }],
      [{ instanceId: EVIDENCE.instanceId }],
    ]) {
      const { error } = await captureFailure({ responses: { preflight: rows } });
      expect(error.code).toBe("INVALID_EVIDENCE_INPUT");
    }
  });

  test.each([-1, 1.5, 1_001, Number.MAX_SAFE_INTEGER + 1, "7"])(
    "rejects an invalid bounded cardinality %p",
    async (count) => {
      const { error } = await captureFailure({
        responses: { "count:workflow_tasks": [{ count }] },
      });
      expect(error.code).toBe("INVALID_CARDINALITY");
    },
  );
});

describe("supplier purchase workflow EXPLAIN evidence gate", () => {
  test("passes every planner row unchanged to the raw gate", async () => {
    const plannerRows = [...PLANNER_ROWS, {
      name: "enable_hashjoin",
      current: "off",
      bootValue: "on",
      category: "Query Tuning / Planner Method Configuration",
    }];
    const { error } = await captureFailure({ responses: { planner: plannerRows } });
    expect(error.code).toBe("NON_DEFAULT_PLANNER");
  });

  test("groups metadata for the raw gate without hiding missing indexes", async () => {
    const { error } = await captureFailure({
      responses: { metadata: METADATA_ROWS.slice(1) },
    });
    expect(error.code).toBe("INDEX_METADATA_INVALID");
  });

  test("preserves raw gate failures and cross-query parse order", async () => {
    const { error } = await captureFailure({
      responses: {
        "explain:running_instance": plan("workflow_instances", {
          "Execution Time": WORKFLOW_EXPLAIN_THRESHOLDS.executionMs + 1,
        }),
        "explain:pending_task": [{ "QUERY PLAN": "not-json" }],
      },
    });
    expect(error.code).toBe("EXECUTION_THRESHOLD");
  });
});

describe("supplier purchase workflow EXPLAIN errors and summary", () => {
  test("redacts a database construction failure", async () => {
    let error: unknown;
    try {
      await runWorkflowExplainGate(CONFIG, EVIDENCE, {
        createDatabase() {
          throw new Error(`${CONFIG.databaseUrl}|${EVIDENCE.instanceId}`);
        },
      });
    } catch (caught) {
      error = caught;
    }
    expect(error).toMatchObject({
      code: "DATABASE_FAILURE",
      message: "database query failed",
    });
    expect(String(error)).not.toContain(CONFIG.databaseUrl);
  });

  test("maps PostgreSQL cancellation and redacts generic database failures", async () => {
    const timedOut = await captureFailure({
      failures: { planner: { code: "57014", message: CONFIG.databaseUrl } },
    });
    expect(timedOut.error).toMatchObject({
      code: "STATEMENT_TIMEOUT",
      message: "database statement timed out",
    });

    const generic = await captureFailure({
      failures: {
        planner: new Error([
          CONFIG.databaseUrl,
          EVIDENCE.tenantId,
          EVIDENCE.instanceId,
          "select secret",
        ].join("|")),
      },
    });
    expect(generic.error).toMatchObject({
      code: "DATABASE_FAILURE",
      message: "database query failed",
    });
    expect(String(generic.error)).not.toContain(CONFIG.databaseUrl);
    expect(String(generic.error)).not.toContain(EVIDENCE.tenantId);
  });

  test("preserves a primary failure when close also fails", async () => {
    const { error, events } = await captureFailure({
      failures: { planner: new Error("primary secret") },
      closeFailure: new Error("close secret"),
    });
    expect(error.code).toBe("DATABASE_FAILURE");
    expect(events.at(-1)).toBe("close");
  });

  test("maps a close-only failure safely", async () => {
    const { error } = await captureFailure({
      closeFailure: new Error("close secret"),
    });
    expect(error).toMatchObject({
      code: "DATABASE_CLOSE_FAILED",
      message: "database close failed",
    });
  });

  test("returns only the stable aggregate summary", async () => {
    const harness = makeHarness();
    const summary = await runWorkflowExplainGate(
      CONFIG,
      EVIDENCE,
      harness.dependencies,
    );
    expect(summary).toEqual({
      gate: "supplier_purchase_batch_workflow",
      queryCount: 3,
      thresholds: WORKFLOW_EXPLAIN_THRESHOLDS,
      queries: {
        running_instance: {
          cardinality: 7,
          cardinalityClass: "small",
          nodeTypes: ["Seq Scan"],
          indexNames: [],
          planningMs: 1.25,
          executionMs: 2.5,
          sharedHitBlocks: 11,
          sharedReadBlocks: 12,
          tempReadBlocks: 0,
          tempWrittenBlocks: 0,
        },
        pending_task: {
          cardinality: 7,
          cardinalityClass: "small",
          nodeTypes: ["Seq Scan"],
          indexNames: [],
          planningMs: 1.25,
          executionMs: 2.5,
          sharedHitBlocks: 11,
          sharedReadBlocks: 12,
          tempReadBlocks: 0,
          tempWrittenBlocks: 0,
        },
        subject_state: {
          cardinality: 7,
          cardinalityClass: "small",
          nodeTypes: ["Seq Scan"],
          indexNames: [],
          planningMs: 1.25,
          executionMs: 2.5,
          sharedHitBlocks: 11,
          sharedReadBlocks: 12,
          tempReadBlocks: 0,
          tempWrittenBlocks: 0,
        },
      },
    });
    const serialized = JSON.stringify(summary);
    for (const secret of [
      CONFIG.databaseUrl,
      EVIDENCE.tenantId,
      EVIDENCE.batchId,
      EVIDENCE.instanceId,
      "privileged",
      "select id",
      "enable_seqscan",
    ]) expect(serialized).not.toContain(secret);
  });

  test("can be imported by the CLI runtime without side effects", () => {
    const result = Bun.spawnSync([
      process.execPath,
      "-e",
      "await import('./src/scripts/supplier-purchase-batch-workflow-explain.ts')",
    ], { cwd: process.cwd(), env: process.env });
    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString()).toBe("");
    expect(result.stderr.toString()).toBe("");
  });
});
