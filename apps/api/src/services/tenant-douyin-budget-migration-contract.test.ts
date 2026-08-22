import { describe, expect, test } from "bun:test";

const migration = new URL(
  "../../../../supabase/migrations/20260821104000_create_douyin_budget_pricing_management_commands.sql",
  import.meta.url,
);
const monotonicMigration = new URL(
  "../../../../supabase/migrations/20260821104100_make_douyin_budget_pricing_version_tokens_monotonic.sql",
  import.meta.url,
);
const factorMigration = new URL(
  "../../../../supabase/migrations/20260822180000_add_douyin_budget_pricing_factors.sql",
  import.meta.url,
);

const layoutCodes = [
  "one_bedroom_one_living",
  "two_bedroom_one_living",
  "two_bedroom_two_living",
  "three_bedroom_one_living",
  "three_bedroom_two_living",
  "four_bedroom_two_living",
  "villa_duplex",
  "custom",
] as const;
const styleCodes = [
  "modern_simple",
  "cream",
  "new_chinese",
  "nordic",
  "light_luxury",
  "natural_wood",
  "american",
  "french",
  "wabi_sabi",
  "custom",
] as const;

describe("douyin budget pricing management migration", () => {
  test("creates four service-role-only atomic commands and closes table writes", async () => {
    const sql = await Bun.file(migration).text();
    for (const name of [
      "create_douyin_budget_pricing_draft",
      "replace_douyin_budget_pricing_items",
      "activate_douyin_budget_pricing_version",
      "archive_douyin_budget_pricing_version",
    ]) {
      expect(sql).toContain(`FUNCTION public.${name}`);
      expect(sql).toMatch(new RegExp(
        `GRANT EXECUTE ON FUNCTION public\\.${name}\\([\\s\\S]+?TO service_role`,
        "i",
      ));
    }
    expect(sql).toContain("SECURITY DEFINER");
    expect(sql).toContain("SET search_path = pg_catalog, public");
    expect(sql).toMatch(/REVOKE INSERT, UPDATE, DELETE\s+ON TABLE public\.douyin_budget_pricing_versions\s+FROM service_role/i);
    expect(sql).toMatch(/REVOKE INSERT, UPDATE, DELETE\s+ON TABLE public\.douyin_budget_pricing_items\s+FROM service_role/i);
  });

  test("locks tenant/version, validates calculator coverage and advances item token", async () => {
    const sql = await Bun.file(migration).text();
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toContain("FOR UPDATE");
    expect(sql).toContain("p_expected_updated_at");
    expect(sql).toContain("DOUYIN_BUDGET_PRICING_STALE");
    expect(sql).toContain("DOUYIN_BUDGET_PRICING_BASE_COVERAGE_INVALID");
    expect(sql).toContain("COUNT(DISTINCT item.item_code)");
    expect(sql).toContain("v_base_count <> 6");
    expect(sql).toMatch(/item\.status = 'active'/i);
    expect(sql).toMatch(
      /GREATEST\(\s*clock_timestamp\(\),\s*v_version\.updated_at \+ interval '1 microsecond'\s*\)/i,
    );
    expect(sql).toMatch(
      /jsonb_array_length\(p_items\)\s+NOT BETWEEN 1 AND 100/i,
    );
  });

  test("uses closed envelopes without exposing SQL diagnostics", async () => {
    const sql = await Bun.file(migration).text();
    expect(sql).toContain("status_code");
    expect(sql).toContain("DOUYIN_BUDGET_PRICING_NOT_FOUND");
    expect(sql).not.toMatch(/SQLERRM|PG_EXCEPTION_DETAIL|PG_EXCEPTION_CONTEXT/);
  });

  test("replaces only the pricing-version timestamp trigger with a monotonic token", async () => {
    const sql = await Bun.file(monotonicMigration).text();
    expect(sql).toContain(
      "FUNCTION public.update_douyin_budget_pricing_version_updated_at()",
    );
    expect(sql).toMatch(/DROP TRIGGER tr_douyin_budget_pricing_versions_updated_at/i);
    expect(sql).toMatch(/CREATE TRIGGER tr_douyin_budget_pricing_versions_updated_at/i);
    expect(sql).toMatch(
      /GREATEST\(\s*clock_timestamp\(\),\s*OLD\.updated_at \+ interval '1 microsecond',\s*NEW\.updated_at\s*\)/i,
    );
    expect(sql).not.toMatch(/CREATE OR REPLACE FUNCTION public\.update_updated_at_column/i);
  });

  test("adds exact version-level layout and style factor persistence", async () => {
    const sql = await Bun.file(factorMigration).text();
    expect(sql).toMatch(/ALTER TABLE public\.douyin_budget_pricing_versions\s+ADD COLUMN IF NOT EXISTS factor_payload jsonb/i);
    expect(sql).toMatch(/ALTER TABLE public\.douyin_budget_pricing_versions\s+ALTER COLUMN factor_payload SET NOT NULL/i);
    expect(sql).toContain("CONSTRAINT douyin_budget_pricing_versions_factor_payload_check");
    expect(sql).toContain("public.is_valid_douyin_budget_pricing_factor_payload");
    expect(sql).toContain("'layout_coefficients_bps'");
    expect(sql).toContain("'style_coefficients_bps'");
    for (const code of [...layoutCodes, ...styleCodes]) {
      expect(sql).toContain(`'${code}'`);
    }
    expect(sql).toMatch(
      /douyin_budget_json_integer_in_range\(\s*factor\.value,\s*1,\s*100000\s*\)/i,
    );
    expect(sql).toMatch(/jsonb_typeof\(p_payload->'layout_coefficients_bps'\)\s+<> 'object'/i);
    expect(sql).toMatch(/jsonb_typeof\(p_payload->'style_coefficients_bps'\)\s+<> 'object'/i);
  });

  test("updates pricing payload and exposes a service-role-only factor command", async () => {
    const sql = await Bun.file(factorMigration).text();
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.douyin_budget_pricing_version_payload\(\s*p_tenant_id uuid,\s*p_pricing_version_id uuid\s*\)/i);
    expect(sql).toMatch(/'factor_payload', pricing_version\.factor_payload/i);
    expect(sql).toMatch(/CREATE FUNCTION public\.update_douyin_budget_pricing_factors\(\s*p_tenant_id uuid,\s*p_pricing_version_id uuid,\s*p_expected_updated_at timestamptz,\s*p_factor_payload jsonb\s*\)/i);
    expect(sql).toContain("DOUYIN_BUDGET_PRICING_NOT_DRAFT");
    expect(sql).toContain("DOUYIN_BUDGET_PRICING_STALE");
    expect(sql).toContain("DOUYIN_BUDGET_PRICING_INVALID");
    expect(sql).toMatch(/FOR UPDATE/i);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.update_douyin_budget_pricing_factors\(\s*uuid,\s*uuid,\s*timestamptz,\s*jsonb\s*\)\s+TO service_role/i);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.update_douyin_budget_pricing_factors\(\s*uuid,\s*uuid,\s*timestamptz,\s*jsonb\s*\)\s+FROM PUBLIC, anon, authenticated/i);
    expect(sql).toMatch(/REVOKE INSERT, UPDATE, DELETE\s+ON TABLE public\.douyin_budget_pricing_versions\s+FROM service_role/i);
    expect(sql).not.toMatch(/SQLERRM|PG_EXCEPTION_DETAIL|PG_EXCEPTION_CONTEXT/);
  });
});
