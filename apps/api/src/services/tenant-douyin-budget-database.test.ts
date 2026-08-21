import { describe, expect, test } from "bun:test";

import {
  PRICING_DATABASE_SCENARIOS,
  parseLocalPricingDatabaseUrl,
  runTenantDouyinBudgetDatabaseIntegration,
} from "./tenant-douyin-budget-database.test-helper";

const runLocalIntegration = process.env.DOUYIN_BUDGET_DB_INTEGRATION === "1"
  ? test
  : test.skip;

describe("tenant douyin budget pricing PostgreSQL integration", () => {
  test("accepts only the fixed local Supabase database boundary", () => {
    expect(parseLocalPricingDatabaseUrl(undefined)).toEqual({
      ok: true,
      databaseUrl: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
    });
    for (const unsafe of [
      "postgresql://postgres:secret@db.example.com:5432/postgres",
      "postgresql://postgres:postgres@127.0.0.1:5432/postgres",
      "postgresql://postgres:postgres@127.0.0.1:54322/other",
    ]) {
      expect(parseLocalPricingDatabaseUrl(unsafe)).toEqual({ ok: false });
    }
  });

  test("keeps the database proof surface explicit", () => {
    expect(PRICING_DATABASE_SCENARIOS).toEqual([
      "service_command_acl",
      "direct_write_closed",
      "empty_activation_rejected",
      "replace_token_advanced",
      "stale_replace_rejected",
      "six_base_activation_atomic",
      "archive_command",
      "same_transaction_tokens_monotonic",
      "concurrent_replace_activate_serialized",
      "fixture_cleanup",
    ]);
  });

  runLocalIntegration("proves commands, ACL and optimistic locking", async () => {
    const summary = await runTenantDouyinBudgetDatabaseIntegration();
    for (const scenario of PRICING_DATABASE_SCENARIOS) {
      expect(summary[scenario]).toBe(true);
    }
  }, 30_000);
});
