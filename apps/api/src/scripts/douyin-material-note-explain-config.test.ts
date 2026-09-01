import { describe, expect, test } from "bun:test";

import {
  MATERIAL_NOTE_EXPLAIN_CONFIRMATION,
  MATERIAL_NOTE_EXPLAIN_ENV,
  MATERIAL_NOTE_EXPLAIN_FIXTURE_TAG,
  MaterialNoteExplainError,
  parseMaterialNoteExplainConfig,
} from "./douyin-material-note-explain-config";

const DATABASE_URL =
  "postgresql://dev-reader:secret@db.example.test:5432/gooes";

function validEnv(): Record<string, string> {
  return {
    [MATERIAL_NOTE_EXPLAIN_ENV.confirmation]:
      MATERIAL_NOTE_EXPLAIN_CONFIRMATION,
    [MATERIAL_NOTE_EXPLAIN_ENV.databaseUrl]: DATABASE_URL,
  };
}

function expectFailure(
  env: Record<string, string | undefined>,
  code: string,
  sensitiveValues: readonly string[] = [],
): void {
  let caught: unknown;
  try {
    parseMaterialNoteExplainConfig(env);
  } catch (error) {
    caught = error;
  }

  expect(caught).toBeInstanceOf(MaterialNoteExplainError);
  if (!(caught instanceof MaterialNoteExplainError)) return;
  expect(caught.code).toBe(code);
  for (const value of sensitiveValues) {
    expect(caught.message).not.toContain(value);
  }
}

describe("douyin material note EXPLAIN config", () => {
  test("locks the explicit dev confirmation, environment names, and fixture", () => {
    expect(MATERIAL_NOTE_EXPLAIN_CONFIRMATION).toBe(
      "development-read-only",
    );
    expect(MATERIAL_NOTE_EXPLAIN_ENV).toEqual({
      confirmation: "DOUYIN_MATERIAL_NOTE_EXPLAIN_CONFIRM",
      databaseUrl: "DOUYIN_MATERIAL_NOTE_EXPLAIN_DB_URL",
    });
    expect(MATERIAL_NOTE_EXPLAIN_FIXTURE_TAG).toBe(
      "Task10-A-20260902",
    );
  });

  test("accepts only an explicit PostgreSQL database target", () => {
    expect(parseMaterialNoteExplainConfig(validEnv())).toEqual({
      databaseUrl: DATABASE_URL,
    });

    const postgresEnv = validEnv();
    postgresEnv[MATERIAL_NOTE_EXPLAIN_ENV.databaseUrl] =
      "postgres://dev-reader@db.example.test/gooes";
    expect(parseMaterialNoteExplainConfig(postgresEnv)).toEqual({
      databaseUrl: "postgres://dev-reader@db.example.test/gooes",
    });
  });

  test("requires the exact confirmation before reading config", () => {
    for (const confirmation of [
      undefined,
      "",
      "production",
      " DEVELOPMENT-READ-ONLY ",
    ]) {
      const env: Record<string, string | undefined> = validEnv();
      env[MATERIAL_NOTE_EXPLAIN_ENV.confirmation] = confirmation;
      expectFailure(
        env,
        "CONFIRMATION_REQUIRED",
        confirmation ? [confirmation, DATABASE_URL] : [DATABASE_URL],
      );
    }
  });

  test("requires a non-empty database URL", () => {
    for (const databaseUrl of [undefined, "", "   "]) {
      const env: Record<string, string | undefined> = validEnv();
      env[MATERIAL_NOTE_EXPLAIN_ENV.databaseUrl] = databaseUrl;
      expectFailure(
        env,
        "MISSING_CONFIG",
        databaseUrl ? [databaseUrl] : [],
      );
    }
  });

  test("rejects malformed and non-PostgreSQL URLs without echoing them", () => {
    const invalidUrls = [
      "not-a-url-with-secret",
      "https://dev-reader:secret@db.example.test/gooes",
      "postgresql:///gooes",
      "postgresql://db.example.test",
      "postgresql://db.example.test/",
      "postgres:gooes",
    ];

    for (const databaseUrl of invalidUrls) {
      const env = validEnv();
      env[MATERIAL_NOTE_EXPLAIN_ENV.databaseUrl] = databaseUrl;
      expectFailure(
        env,
        "INVALID_DATABASE_URL",
        [databaseUrl, "secret", MATERIAL_NOTE_EXPLAIN_FIXTURE_TAG],
      );
    }
  });
});
