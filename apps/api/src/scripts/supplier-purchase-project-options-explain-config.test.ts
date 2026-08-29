import { describe, expect, test } from "bun:test";

import {
  PROJECT_OPTION_EXPLAIN_CONFIRMATION,
  PROJECT_OPTION_EXPLAIN_ENV,
  parseProjectOptionExplainConfig,
} from "./supplier-purchase-project-options-explain-config";

const TENANT_ID = "72000000-0000-4000-8000-000000000001";
const PROJECT_IDS = [
  "72000000-0000-4000-8000-000000000002",
  "72000000-0000-4000-8000-000000000003",
];

function validEnv(): Record<string, string> {
  return {
    [PROJECT_OPTION_EXPLAIN_ENV.confirmation]:
      PROJECT_OPTION_EXPLAIN_CONFIRMATION,
    [PROJECT_OPTION_EXPLAIN_ENV.databaseUrl]:
      "postgresql://dev-reader:secret@db.example.test:5432/gooes",
    [PROJECT_OPTION_EXPLAIN_ENV.tenantId]: TENANT_ID,
    [PROJECT_OPTION_EXPLAIN_ENV.updatedAtFrom]:
      "2026-08-22T03:04:05.000Z",
    [PROJECT_OPTION_EXPLAIN_ENV.updatedAtTo]:
      "2026-08-29T03:04:05.000Z",
    [PROJECT_OPTION_EXPLAIN_ENV.keyword]: " 脱敏项目 ",
    [PROJECT_OPTION_EXPLAIN_ENV.visibleProjectIds]: PROJECT_IDS.join(","),
    [PROJECT_OPTION_EXPLAIN_ENV.pageSize]: "100",
  };
}

describe("supplier purchase project option EXPLAIN config", () => {
  test("strictly parses the explicit read-only development configuration", () => {
    expect(parseProjectOptionExplainConfig(validEnv())).toEqual({
      databaseUrl:
        "postgresql://dev-reader:secret@db.example.test:5432/gooes",
      tenantId: TENANT_ID,
      window: {
        updatedAtFrom: "2026-08-22T03:04:05.000Z",
        updatedAtTo: "2026-08-29T03:04:05.000Z",
      },
      keyword: "脱敏项目",
      visibleProjectIds: PROJECT_IDS,
      pageSize: 100,
    });
  });

  test("accepts a half-open boundary and omitted visible scope", () => {
    const env = validEnv();
    delete env[PROJECT_OPTION_EXPLAIN_ENV.updatedAtTo];
    env[PROJECT_OPTION_EXPLAIN_ENV.updatedAtBefore] =
      "2026-08-31T16:00:00.000Z";
    delete env[PROJECT_OPTION_EXPLAIN_ENV.visibleProjectIds];
    delete env[PROJECT_OPTION_EXPLAIN_ENV.pageSize];

    expect(parseProjectOptionExplainConfig(env)).toMatchObject({
      window: {
        updatedAtFrom: "2026-08-22T03:04:05.000Z",
        updatedAtBefore: "2026-08-31T16:00:00.000Z",
      },
      visibleProjectIds: null,
      pageSize: 20,
    });
  });

  test("rejects missing confirmation, implicit URLs, and invalid boundaries", () => {
    const cases = [
      [PROJECT_OPTION_EXPLAIN_ENV.confirmation, "wrong"],
      [PROJECT_OPTION_EXPLAIN_ENV.databaseUrl, "https://secret.invalid/db"],
      [PROJECT_OPTION_EXPLAIN_ENV.tenantId, "tenant-secret"],
      [PROJECT_OPTION_EXPLAIN_ENV.updatedAtFrom, "2026-08-22"],
      [PROJECT_OPTION_EXPLAIN_ENV.updatedAtTo,
        "2026-08-01T00:00:00.000Z"],
      [PROJECT_OPTION_EXPLAIN_ENV.keyword, "   "],
      [PROJECT_OPTION_EXPLAIN_ENV.keyword, "x".repeat(101)],
      [PROJECT_OPTION_EXPLAIN_ENV.pageSize, "101"],
    ] as const;

    for (const [name, value] of cases) {
      const env = validEnv();
      env[name] = value;
      expect(() => parseProjectOptionExplainConfig(env)).toThrow();
      try {
        parseProjectOptionExplainConfig(env);
      } catch (error) {
        expect(String(error)).not.toContain(value);
      }
    }

    const bothUpperBounds = validEnv();
    bothUpperBounds[PROJECT_OPTION_EXPLAIN_ENV.updatedAtBefore] =
      "2026-08-31T16:00:00.000Z";
    expect(() => parseProjectOptionExplainConfig(bothUpperBounds)).toThrow();

    const noUpperBound = validEnv();
    delete noUpperBound[PROJECT_OPTION_EXPLAIN_ENV.updatedAtTo];
    expect(() => parseProjectOptionExplainConfig(noUpperBound)).toThrow();
  });

  test("bounds and de-duplicates the optional visible project UUID list", () => {
    const tooMany = validEnv();
    tooMany[PROJECT_OPTION_EXPLAIN_ENV.visibleProjectIds] = Array.from(
      { length: 101 },
      (_, index) => `72000000-0000-4000-8000-${index.toString().padStart(12, "0")}`,
    ).join(",");
    expect(() => parseProjectOptionExplainConfig(tooMany)).toThrow();

    const duplicate = validEnv();
    duplicate[PROJECT_OPTION_EXPLAIN_ENV.visibleProjectIds] =
      `${PROJECT_IDS[0]},${PROJECT_IDS[0]}`;
    expect(() => parseProjectOptionExplainConfig(duplicate)).toThrow();
  });
});
