import { describe, expect, test } from "bun:test";

import {
  WORKFLOW_EXPLAIN_CONFIRMATION,
  WORKFLOW_EXPLAIN_ENV,
  WORKFLOW_EXPLAIN_SOURCE,
  WorkflowExplainError,
  type WorkflowExplainConfig,
  type WorkflowExplainEvidenceInput,
} from "./supplier-purchase-batch-workflow-explain-config";
import { WORKFLOW_EXPLAIN_THRESHOLDS } from
  "./supplier-purchase-batch-workflow-explain-evidence";
import {
  runWorkflowExplainCli,
  type WorkflowExplainCliDependencies,
  type WorkflowExplainSummary,
} from "./supplier-purchase-batch-workflow-explain";

const VALID_ENV = {
  [WORKFLOW_EXPLAIN_ENV.confirmation]: WORKFLOW_EXPLAIN_CONFIRMATION,
  [WORKFLOW_EXPLAIN_ENV.databaseUrl]:
    "postgresql://privileged:secret@dev.example.test/gooes",
  [WORKFLOW_EXPLAIN_ENV.evidenceFile]:
    "/private/supplier-purchase-workflow-evidence.json",
};

const QUERY_SUMMARY: WorkflowExplainSummary["queries"]["running_instance"] = {
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
};

const SUMMARY: WorkflowExplainSummary = {
  gate: "supplier_purchase_batch_workflow",
  queryCount: 3,
  thresholds: WORKFLOW_EXPLAIN_THRESHOLDS,
  queries: {
    running_instance: { ...QUERY_SUMMARY },
    pending_task: { ...QUERY_SUMMARY },
    subject_state: { ...QUERY_SUMMARY },
  },
};

type CliHarnessOptions = {
  env?: Record<string, string | undefined>;
  readEvidence?: (path: string) => Promise<unknown>;
  runGate?: (
    config: WorkflowExplainConfig,
    evidence: WorkflowExplainEvidenceInput,
  ) => Promise<WorkflowExplainSummary>;
};

function makeHarness(options: CliHarnessOptions = {}) {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const exitCodes: number[] = [];
  const evidencePaths: string[] = [];
  const gateCalls: Array<{
    config: WorkflowExplainConfig;
    evidence: WorkflowExplainEvidenceInput;
  }> = [];
  const dependencies: WorkflowExplainCliDependencies = {
    env: options.env ?? VALID_ENV,
    async readEvidence(path) {
      evidencePaths.push(path);
      return options.readEvidence
        ? options.readEvidence(path)
        : WORKFLOW_EXPLAIN_SOURCE;
    },
    async runGate(config, evidence) {
      gateCalls.push({ config, evidence });
      return options.runGate
        ? options.runGate(config, evidence)
        : SUMMARY;
    },
    writeStdout(line) {
      stdout.push(line);
    },
    writeStderr(line) {
      stderr.push(line);
    },
    setExitCode(code) {
      exitCodes.push(code);
    },
  };
  return {
    dependencies,
    evidencePaths,
    exitCodes,
    gateCalls,
    stderr,
    stdout,
  };
}

describe("supplier purchase workflow EXPLAIN CLI", () => {
  test("uses strict environment config before reading evidence", async () => {
    const invalidCases: Array<[
      Record<string, string | undefined>,
      string,
    ]> = [
      [{}, "CONFIRMATION_REQUIRED"],
      [{
        [WORKFLOW_EXPLAIN_ENV.confirmation]: WORKFLOW_EXPLAIN_CONFIRMATION,
      }, "MISSING_CONFIG"],
      [{
        ...VALID_ENV,
        [WORKFLOW_EXPLAIN_ENV.databaseUrl]: "https://not-postgres.test/db",
      }, "INVALID_DATABASE_URL"],
    ];

    for (const [env, code] of invalidCases) {
      const harness = makeHarness({ env });
      await runWorkflowExplainCli(harness.dependencies);
      expect(harness.stdout).toEqual([]);
      expect(harness.stderr).toEqual([
        `SUPPLIER_PURCHASE_WORKFLOW_EXPLAIN_FAILED:${code}`,
      ]);
      expect(harness.exitCodes).toEqual([1]);
      expect(harness.evidencePaths).toEqual([]);
      expect(harness.gateCalls).toEqual([]);
    }
  });

  test("redacts evidence read and JSON parse failures", async () => {
    const rawFailure = [
      VALID_ENV[WORKFLOW_EXPLAIN_ENV.evidenceFile],
      "malformed:{secret-json}",
      WORKFLOW_EXPLAIN_SOURCE.tenantId,
    ].join("|");
    const harness = makeHarness({
      readEvidence: async () => {
        throw new Error(rawFailure);
      },
    });

    await runWorkflowExplainCli(harness.dependencies);

    expect(harness.evidencePaths).toEqual([
      VALID_ENV[WORKFLOW_EXPLAIN_ENV.evidenceFile],
    ]);
    expect(harness.stdout).toEqual([]);
    expect(harness.stderr).toEqual([
      "SUPPLIER_PURCHASE_WORKFLOW_EXPLAIN_FAILED:DATABASE_FAILURE",
    ]);
    expect(harness.exitCodes).toEqual([1]);
    expect(harness.gateCalls).toEqual([]);
    expect(harness.stderr.join("|")).not.toContain(rawFailure);
  });

  test("rejects mismatched fixed evidence without invoking the gate", async () => {
    const harness = makeHarness({
      readEvidence: async () => ({
        ...WORKFLOW_EXPLAIN_SOURCE,
        batchId: "00000000-0000-4000-8000-000000000000",
      }),
    });

    await runWorkflowExplainCli(harness.dependencies);

    expect(harness.stdout).toEqual([]);
    expect(harness.stderr).toEqual([
      "SUPPLIER_PURCHASE_WORKFLOW_EXPLAIN_FAILED:INVALID_EVIDENCE_INPUT",
    ]);
    expect(harness.exitCodes).toEqual([1]);
    expect(harness.gateCalls).toEqual([]);
  });

  test("runs the gate once and writes one secret-free JSON summary", async () => {
    const harness = makeHarness();

    await runWorkflowExplainCli(harness.dependencies);

    expect(harness.evidencePaths).toEqual([
      VALID_ENV[WORKFLOW_EXPLAIN_ENV.evidenceFile],
    ]);
    expect(harness.gateCalls).toEqual([{
      config: {
        databaseUrl: VALID_ENV[WORKFLOW_EXPLAIN_ENV.databaseUrl],
        evidenceFile: VALID_ENV[WORKFLOW_EXPLAIN_ENV.evidenceFile],
      },
      evidence: WORKFLOW_EXPLAIN_SOURCE,
    }]);
    expect(harness.stdout).toEqual([JSON.stringify(SUMMARY)]);
    expect(harness.stderr).toEqual([]);
    expect(harness.exitCodes).toEqual([]);
    for (const secret of [
      VALID_ENV[WORKFLOW_EXPLAIN_ENV.databaseUrl],
      ...Object.values(WORKFLOW_EXPLAIN_SOURCE),
      "privileged",
      "select id from public.workflow_instances",
    ]) {
      expect(harness.stdout[0]!).not.toContain(secret);
    }
  });

  test("preserves safe gate codes and normalizes generic gate failures", async () => {
    const cases: Array<[unknown, string]> = [
      [
        new WorkflowExplainError(
          "EXECUTION_THRESHOLD",
          `secret:${WORKFLOW_EXPLAIN_SOURCE.instanceId}`,
        ),
        "EXECUTION_THRESHOLD",
      ],
      [new Error(VALID_ENV[WORKFLOW_EXPLAIN_ENV.databaseUrl]), "DATABASE_FAILURE"],
      [
        new WorkflowExplainError("SENSITIVE_CODE", "sensitive injected code"),
        "DATABASE_FAILURE",
      ],
    ];

    for (const [failure, code] of cases) {
      const harness = makeHarness({
        runGate: async () => {
          throw failure;
        },
      });
      await runWorkflowExplainCli(harness.dependencies);
      expect(harness.gateCalls).toHaveLength(1);
      expect(harness.stdout).toEqual([]);
      expect(harness.stderr).toEqual([
        `SUPPLIER_PURCHASE_WORKFLOW_EXPLAIN_FAILED:${code}`,
      ]);
      expect(harness.exitCodes).toEqual([1]);
      expect(harness.stderr[0]!).not.toContain("secret");
    }
  });
});
