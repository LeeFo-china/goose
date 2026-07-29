import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";

const MIGRATION = new URL(
  "../../../../../supabase/migrations/20260729120000_add_tenant_onboarding_visitor_ocr.sql",
  import.meta.url,
);

function extractFunction(sql: string): string {
  const start = sql.search(
    /CREATE OR REPLACE FUNCTION public\.ocr_claim_visitor_recognition\s*\(/,
  );
  if (start < 0) return "";
  const end = sql.indexOf("\n$$;", start);
  return end < 0 ? sql.slice(start) : sql.slice(start, end + 4);
}

describe("tenant onboarding visitor OCR migration contract", () => {
  test("adds an explicit visitor recognition scope without weakening existing scopes", async () => {
    expect(existsSync(MIGRATION)).toBe(true);
    const sql = await Bun.file(MIGRATION).text();

    expect(sql).toMatch(/^-- Rollback:/);
    expect(sql).toMatch(/\bBEGIN;[\s\S]*\bCOMMIT;\s*$/);
    expect(sql).toContain("ADD COLUMN actor_visitor_id text");
    expect(sql).toContain("ADD COLUMN request_ip_hash text");
    expect(sql).toContain("ADD COLUMN provider_started_at timestamptz");
    expect(sql).toContain("ADD COLUMN processing_deadline_at timestamptz");
    expect(sql).toContain("scope_type IN ('tenant', 'platform', 'visitor')");
    expect(sql).toMatch(
      /scope_type = 'tenant'\s+AND tenant_id IS NOT NULL/,
    );
    expect(sql).toMatch(
      /scope_type = 'platform'\s+AND tenant_id IS NULL/,
    );
    expect(sql).toMatch(
      /scope_type = 'visitor'\s+AND tenant_id IS NULL/,
    );
    expect(sql).toContain("actor_employee_id IS NULL");
    expect(sql).toContain("btrim(actor_visitor_id) <> ''");
    expect(sql).toContain("'tenant_onboarding_license'");
  });

  test("indexes visitor ownership, idempotency, quota, processing and expiry paths", async () => {
    const sql = await Bun.file(MIGRATION).text();

    expect(sql).toContain("ocr_recognitions_visitor_idempotency_idx");
    expect(sql).toContain("(actor_visitor_id, idempotency_key)");
    expect(sql).toContain("ocr_recognitions_visitor_daily_usage_idx");
    expect(sql).toContain("ocr_recognitions_visitor_ip_usage_idx");
    expect(sql).toContain("ocr_recognitions_visitor_processing_idx");
    expect(sql).toContain("ocr_recognitions_expiry_idx");
    expect(sql).not.toContain("ocr_recognitions_visitor_active_dedupe");
  });

  test("creates one service-role atomic visitor claim command", async () => {
    const sql = await Bun.file(MIGRATION).text();
    const fn = extractFunction(sql);

    expect(fn).toContain("SECURITY DEFINER");
    expect(fn).toContain("SET search_path = pg_catalog, public");
    expect(fn).toContain("pg_advisory_xact_lock");
    expect(fn).toContain("FOR UPDATE");
    expect(fn).toContain("provider_started_at IS NOT NULL");
    expect(fn).toContain("processing_deadline_at > p_now");
    expect(fn).toContain("EXTRACT(EPOCH FROM");
    expect(fn).not.toContain("pg_catalog.extract");
    expect(fn).toContain("'created'");
    expect(fn).toContain("'existing'");
    expect(fn).toContain("'in_progress'");
    expect(fn).toContain("'expired'");
    expect(fn).toContain("'idempotency_conflict'");
    expect(fn).toContain("'daily_limited'");
    expect(fn).toContain("'rate_limited'");
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.ocr_claim_visitor_recognition\([^;]+FROM PUBLIC, anon, authenticated;/,
    );
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.ocr_claim_visitor_recognition\([^;]+TO service_role;/,
    );
  });

  test("seeds disabled-by-default visitor OCR controls", async () => {
    const sql = await Bun.file(MIGRATION).text();

    expect(sql).toContain("TENCENT_OCR_TENANT_ONBOARDING_ENABLED");
    expect(sql).toContain("TENCENT_OCR_VISITOR_DAILY_LIMIT");
    expect(sql).toContain("TENCENT_OCR_VISITOR_IP_WINDOW_SECONDS");
    expect(sql).toContain("TENCENT_OCR_VISITOR_IP_WINDOW_LIMIT");
    expect(sql).toContain("TENCENT_OCR_VISITOR_PROCESSING_LEASE_SECONDS");
    expect(sql).toContain("TENCENT_OCR_VISITOR_CONCURRENCY_LIMIT");
    expect(sql).toContain("TENCENT_OCR_VISITOR_GLOBAL_CONCURRENCY_LIMIT");
    expect(sql).toContain("'false'");
  });
});
