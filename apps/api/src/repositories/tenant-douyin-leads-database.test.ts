import { describe, expect, test } from "bun:test";

import {
  TENANT_LEAD_DATABASE_SCENARIOS,
  parseLocalTenantLeadDatabaseUrl,
  runTenantLeadDatabaseIntegration,
} from "./tenant-douyin-leads-database.test-helper";

const runLocalIntegration = process.env.DOUYIN_LEAD_DB_INTEGRATION === "1"
  ? test
  : test.skip;

describe("tenant douyin lead local PostgreSQL integration", () => {
  test("accepts only the fixed local Supabase database boundary", () => {
    expect(parseLocalTenantLeadDatabaseUrl(undefined)).toEqual({
      ok: true,
      databaseUrl: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
    });
    for (const unsafe of [
      "postgresql://postgres:secret@db.example.com:5432/postgres",
      "postgresql://postgres:postgres@127.0.0.1:5432/postgres",
      "postgresql://postgres:postgres@127.0.0.1:54322/other",
    ]) expect(parseLocalTenantLeadDatabaseUrl(unsafe)).toEqual({ ok: false });
  });

  test("keeps the database proof surface explicit", () => {
    expect(TENANT_LEAD_DATABASE_SCENARIOS).toEqual([
      "function_acl_catalog",
      "latest_of_twenty_one",
      "detail_page_twenty_of_twenty_one",
      "keyword_bitmap_or_indexes",
      "assignee_scope_conflict_zero_writes",
      "preflight_conflict_zero_writes",
      "existing_customer_conversion_shape",
      "unassigned_customer_owner",
      "stale_create_preflight_rejected",
      "repeated_conversion_conflict_zero_writes",
      "latest_index_plan",
      "fixture_cleanup",
    ]);
  });

  runLocalIntegration("proves bounded lead reads and coherent conversion", async () => {
    const summary = await runTenantLeadDatabaseIntegration();
    for (const scenario of TENANT_LEAD_DATABASE_SCENARIOS) {
      expect(summary[scenario]).toBe(true);
    }
  }, 30_000);
});
