import { describe, expect, test } from "bun:test";

import {
  WORKFLOW_EXPLAIN_CONFIRMATION,
  WORKFLOW_EXPLAIN_ENV,
  WORKFLOW_EXPLAIN_SOURCE,
  WorkflowExplainError,
  parseWorkflowExplainConfig,
  parseWorkflowExplainEvidenceInput,
} from "./supplier-purchase-batch-workflow-explain-config";

const DATABASE_URL =
  "postgresql://dev-reader:secret@db.example.test:5432/gooes";
const EVIDENCE_FILE = "/tmp/supplier-purchase-workflow-evidence.json";

function validEnv(): Record<string, string> {
  return {
    [WORKFLOW_EXPLAIN_ENV.confirmation]: WORKFLOW_EXPLAIN_CONFIRMATION,
    [WORKFLOW_EXPLAIN_ENV.databaseUrl]: DATABASE_URL,
    [WORKFLOW_EXPLAIN_ENV.evidenceFile]: EVIDENCE_FILE,
  };
}

function expectWorkflowExplainError(
  callback: () => unknown,
  code: string,
  secretValues: readonly string[] = [],
): void {
  let caught: unknown;
  try {
    callback();
  } catch (error) {
    caught = error;
  }

  expect(caught).toBeInstanceOf(WorkflowExplainError);
  if (!(caught instanceof WorkflowExplainError)) return;
  expect(caught.code).toBe(code);
  for (const secretValue of secretValues) {
    expect(caught.message).not.toContain(secretValue);
  }
}

describe("supplier purchase batch workflow EXPLAIN evidence input", () => {
  test("locks the exact accepted source evidence", () => {
    expect(WORKFLOW_EXPLAIN_SOURCE).toEqual({
      sourceRunId: "33359680214",
      artifactName:
        "supplier-purchase-workflow-acceptance-9d02854a88d5ca83a2f883b923de1ffcd7d49bd3",
      tenantId: "3eebca47-961f-4899-b976-a3d3208d326b",
      batchId: "53298aa5-a3f6-45c3-8820-4cbfa15abfdb",
      instanceId: "158649b4-c356-4b04-abb4-d1d1b65f08d5",
    });
    expect(parseWorkflowExplainEvidenceInput({
      ...WORKFLOW_EXPLAIN_SOURCE,
    })).toBe(WORKFLOW_EXPLAIN_SOURCE);
  });

  test("rejects every changed fixed source value with a safe stable error", () => {
    const fixedValues = Object.values(WORKFLOW_EXPLAIN_SOURCE);

    for (const key of Object.keys(WORKFLOW_EXPLAIN_SOURCE)) {
      const changedValue = `changed-${key}`;
      expectWorkflowExplainError(
        () => parseWorkflowExplainEvidenceInput({
          ...WORKFLOW_EXPLAIN_SOURCE,
          [key]: changedValue,
        }),
        "INVALID_EVIDENCE_INPUT",
        [...fixedValues, changedValue],
      );
    }
  });

  test("rejects non-objects and arrays", () => {
    const invalidValues: readonly unknown[] = [
      undefined,
      null,
      false,
      0,
      "evidence",
      [],
    ];

    for (const value of invalidValues) {
      expectWorkflowExplainError(
        () => parseWorkflowExplainEvidenceInput(value),
        "INVALID_EVIDENCE_INPUT",
      );
    }
  });

  test("rejects missing, extra, and snake_case evidence keys", () => {
    for (const key of Object.keys(WORKFLOW_EXPLAIN_SOURCE)) {
      const missing: Record<string, unknown> = {
        ...WORKFLOW_EXPLAIN_SOURCE,
      };
      delete missing[key];
      expectWorkflowExplainError(
        () => parseWorkflowExplainEvidenceInput(missing),
        "INVALID_EVIDENCE_INPUT",
      );
    }

    expectWorkflowExplainError(
      () => parseWorkflowExplainEvidenceInput({
        ...WORKFLOW_EXPLAIN_SOURCE,
        extra: "not-allowed",
      }),
      "INVALID_EVIDENCE_INPUT",
    );
    expectWorkflowExplainError(
      () => parseWorkflowExplainEvidenceInput({
        source_run_id: WORKFLOW_EXPLAIN_SOURCE.sourceRunId,
        artifact_name: WORKFLOW_EXPLAIN_SOURCE.artifactName,
        tenant_id: WORKFLOW_EXPLAIN_SOURCE.tenantId,
        batch_id: WORKFLOW_EXPLAIN_SOURCE.batchId,
        instance_id: WORKFLOW_EXPLAIN_SOURCE.instanceId,
      }),
      "INVALID_EVIDENCE_INPUT",
      Object.values(WORKFLOW_EXPLAIN_SOURCE),
    );
  });
});

describe("supplier purchase batch workflow EXPLAIN config", () => {
  test("accepts only explicit read-only config and PostgreSQL URL forms", () => {
    expect(parseWorkflowExplainConfig(validEnv())).toEqual({
      databaseUrl: DATABASE_URL,
      evidenceFile: EVIDENCE_FILE,
    });

    const postgresEnv = validEnv();
    postgresEnv[WORKFLOW_EXPLAIN_ENV.databaseUrl] =
      "postgres://dev-reader@db.example.test/gooes";
    expect(parseWorkflowExplainConfig(postgresEnv)).toEqual({
      databaseUrl: "postgres://dev-reader@db.example.test/gooes",
      evidenceFile: EVIDENCE_FILE,
    });
  });

  test("requires explicit confirmation and both config values", () => {
    const confirmations = [undefined, "", "production", " DEVELOPMENT-READ-ONLY "];
    for (const confirmation of confirmations) {
      const env: Record<string, string | undefined> = validEnv();
      env[WORKFLOW_EXPLAIN_ENV.confirmation] = confirmation;
      expectWorkflowExplainError(
        () => parseWorkflowExplainConfig(env),
        "CONFIRMATION_REQUIRED",
        confirmation ? [confirmation] : [],
      );
    }

    for (const configName of [
      WORKFLOW_EXPLAIN_ENV.databaseUrl,
      WORKFLOW_EXPLAIN_ENV.evidenceFile,
    ]) {
      for (const missingValue of [undefined, ""]) {
        const env: Record<string, string | undefined> = validEnv();
        env[configName] = missingValue;
        expectWorkflowExplainError(
          () => parseWorkflowExplainConfig(env),
          "MISSING_CONFIG",
          Object.values(WORKFLOW_EXPLAIN_SOURCE),
        );
      }
    }

    const whitespaceEvidenceFile = validEnv();
    whitespaceEvidenceFile[WORKFLOW_EXPLAIN_ENV.evidenceFile] = "   ";
    expectWorkflowExplainError(
      () => parseWorkflowExplainConfig(whitespaceEvidenceFile),
      "MISSING_CONFIG",
    );
  });

  test("rejects malformed or non-explicit database URLs without echoing them", () => {
    const invalidUrls = [
      "not-a-url-with-secret",
      "https://dev-reader:secret@db.example.test/gooes",
      "postgresql:///gooes",
      "postgresql://db.example.test",
      "postgresql://db.example.test/",
      "postgres:gooes",
    ];

    for (const invalidUrl of invalidUrls) {
      const env = validEnv();
      env[WORKFLOW_EXPLAIN_ENV.databaseUrl] = invalidUrl;
      expectWorkflowExplainError(
        () => parseWorkflowExplainConfig(env),
        "INVALID_DATABASE_URL",
        [invalidUrl, ...Object.values(WORKFLOW_EXPLAIN_SOURCE)],
      );
    }
  });
});
