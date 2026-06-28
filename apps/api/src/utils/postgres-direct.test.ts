import { describe, expect, test } from "bun:test";

import {
  DIRECT_POSTGRES_SQL_OPTIONS,
  resolveDirectPostgresUrl,
} from "./postgres-direct";

describe("resolveDirectPostgresUrl", () => {
  test("prefers direct database url over the pooler url", () => {
    expect(resolveDirectPostgresUrl({
      SUPABASE_DB_DIRECT_URL: "postgres://direct",
      SUPABASE_DB_URL: "postgres://pooler",
    })).toBe("postgres://direct");
  });

  test("falls back to pooler url when direct database url is missing", () => {
    expect(resolveDirectPostgresUrl({
      SUPABASE_DB_DIRECT_URL: "",
      SUPABASE_DB_URL: "postgres://pooler",
    })).toBe("postgres://pooler");
  });

  test("uses a small non-prepared direct SQL pool", () => {
    expect(DIRECT_POSTGRES_SQL_OPTIONS.max).toBeLessThanOrEqual(2);
    expect(DIRECT_POSTGRES_SQL_OPTIONS.prepare).toBe(false);
  });
});
