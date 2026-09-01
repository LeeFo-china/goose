export const MATERIAL_NOTE_EXPLAIN_CONFIRMATION =
  "development-read-only";
export const MATERIAL_NOTE_EXPLAIN_FIXTURE_TAG =
  "Task10-A-20260902";

export const MATERIAL_NOTE_EXPLAIN_ENV = {
  confirmation: "DOUYIN_MATERIAL_NOTE_EXPLAIN_CONFIRM",
  databaseUrl: "DOUYIN_MATERIAL_NOTE_EXPLAIN_DB_URL",
} as const;

export interface MaterialNoteExplainConfig {
  readonly databaseUrl: string;
}

export class MaterialNoteExplainError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "MaterialNoteExplainError";
  }
}

export function parseMaterialNoteExplainConfig(
  env: Record<string, string | undefined>,
): MaterialNoteExplainConfig {
  if (env[MATERIAL_NOTE_EXPLAIN_ENV.confirmation] !==
    MATERIAL_NOTE_EXPLAIN_CONFIRMATION) {
    fail(
      "CONFIRMATION_REQUIRED",
      "development read-only confirmation is required",
    );
  }

  const databaseUrl = requiredDatabaseUrl(env);
  validateDatabaseUrl(databaseUrl);
  return { databaseUrl };
}

function requiredDatabaseUrl(
  env: Record<string, string | undefined>,
): string {
  const value = env[MATERIAL_NOTE_EXPLAIN_ENV.databaseUrl];
  if (!value || value.trim().length === 0) {
    fail("MISSING_CONFIG", "databaseUrl is required");
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
  throw new MaterialNoteExplainError(code, message);
}
