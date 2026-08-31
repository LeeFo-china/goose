export const WORKFLOW_EXPLAIN_CONFIRMATION = "development-read-only";

export const WORKFLOW_EXPLAIN_SOURCE = Object.freeze({
  sourceRunId: "33359680214",
  artifactName:
    "supplier-purchase-workflow-acceptance-9d02854a88d5ca83a2f883b923de1ffcd7d49bd3",
  tenantId: "3eebca47-961f-4899-b976-a3d3208d326b",
  batchId: "53298aa5-a3f6-45c3-8820-4cbfa15abfdb",
  instanceId: "158649b4-c356-4b04-abb4-d1d1b65f08d5",
} as const);

export const WORKFLOW_EXPLAIN_ENV = {
  confirmation: "SUPPLIER_PURCHASE_WORKFLOW_EXPLAIN_CONFIRM",
  databaseUrl: "SUPPLIER_PURCHASE_WORKFLOW_EXPLAIN_DB_URL",
  evidenceFile: "SUPPLIER_PURCHASE_WORKFLOW_EXPLAIN_EVIDENCE_FILE",
} as const;

export class WorkflowExplainError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "WorkflowExplainError";
  }
}

export type WorkflowExplainEvidenceInput = typeof WORKFLOW_EXPLAIN_SOURCE;

export type WorkflowExplainConfig = {
  databaseUrl: string;
  evidenceFile: string;
};

export function parseWorkflowExplainEvidenceInput(
  value: unknown,
): WorkflowExplainEvidenceInput {
  if (!isRecord(value)) {
    fail("INVALID_EVIDENCE_INPUT", "evidence input must match the locked source");
  }

  const expectedEntries = Object.entries(WORKFLOW_EXPLAIN_SOURCE);
  const actualKeys = Reflect.ownKeys(value);
  if (actualKeys.length !== expectedEntries.length) {
    fail("INVALID_EVIDENCE_INPUT", "evidence input must match the locked source");
  }

  for (const [key, expectedValue] of expectedEntries) {
    if (!Object.hasOwn(value, key) || value[key] !== expectedValue) {
      fail("INVALID_EVIDENCE_INPUT", "evidence input must match the locked source");
    }
  }

  return WORKFLOW_EXPLAIN_SOURCE;
}

export function parseWorkflowExplainConfig(
  env: Record<string, string | undefined>,
): WorkflowExplainConfig {
  if (env[WORKFLOW_EXPLAIN_ENV.confirmation] !==
    WORKFLOW_EXPLAIN_CONFIRMATION) {
    fail(
      "CONFIRMATION_REQUIRED",
      "development read-only confirmation is required",
    );
  }

  const databaseUrl = requiredConfig(env, "databaseUrl");
  validateDatabaseUrl(databaseUrl);

  return {
    databaseUrl,
    evidenceFile: requiredConfig(env, "evidenceFile"),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredConfig(
  env: Record<string, string | undefined>,
  key: "databaseUrl" | "evidenceFile",
): string {
  const value = env[WORKFLOW_EXPLAIN_ENV[key]];
  if (!value || value.trim().length === 0) {
    fail("MISSING_CONFIG", `${key} is required`);
  }
  return value;
}

function validateDatabaseUrl(value: string): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    fail("INVALID_DATABASE_URL", "database URL must be valid");
  }

  if ((url.protocol !== "postgres:" && url.protocol !== "postgresql:") ||
    !url.hostname || url.pathname.length <= 1) {
    fail(
      "INVALID_DATABASE_URL",
      "database URL must include a PostgreSQL host and database",
    );
  }
}

function fail(code: string, message: string): never {
  throw new WorkflowExplainError(code, message);
}
