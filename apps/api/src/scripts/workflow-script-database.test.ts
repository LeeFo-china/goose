import { describe, expect, test } from "bun:test";
import {
  closeSqlWithTimeout,
  resolveScriptDatabaseUrl,
} from "./workflow-script-database";

describe("resolveScriptDatabaseUrl", () => {
  test("prefers direct database url before pooled url", () => {
    expect(resolveScriptDatabaseUrl({
      SUPABASE_DB_DIRECT_URL: "postgres://direct",
      SUPABASE_DB_URL: "postgres://pooled",
    })).toBe("postgres://direct");
  });

  test("falls back to pooled url", () => {
    expect(resolveScriptDatabaseUrl({
      SUPABASE_DB_URL: "postgres://pooled",
    })).toBe("postgres://pooled");
  });
});

describe("closeSqlWithTimeout", () => {
  test("returns false when sql close does not finish before timeout", async () => {
    const closed = await closeSqlWithTimeout(
      { close: async () => await new Promise(() => undefined) },
      1,
    );

    expect(closed).toBe(false);
  });
});
