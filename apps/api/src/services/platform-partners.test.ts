import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

const migrationDir = join(
  import.meta.dir,
  "../../../../supabase/migrations",
);

function readCityPartnerMigration() {
  const file = readdirSync(migrationDir)
    .filter((name) => name.endsWith("_create_city_partner_mvp.sql"))
    .sort()
    .at(-1);
  expect(file).toBeTruthy();
  return readFileSync(join(migrationDir, file as string), "utf8");
}

describe("city partner MVP migration", () => {
  test("creates partner, revenue, commission, and settlement tables", () => {
    const sql = readCityPartnerMigration();

    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.platform_partner_levels");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.platform_partners");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.platform_partner_invite_codes");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.tenant_partner_bindings");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.platform_revenue_events");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.partner_commission_ledger");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.partner_settlement_batches");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.partner_settlement_items");
    expect(sql).toContain("lead_service_fee_default_rate_bps integer NOT NULL DEFAULT 250");
    expect(sql).toContain("settlement_cycle text NOT NULL DEFAULT 'monthly'");
    expect(sql).toContain("settlement_method text NOT NULL DEFAULT 'manual'");
    expect(sql).toContain("tenant_partner_bindings_one_active_idx");
    expect(sql).toContain("platform_revenue_events_source_unique_idx");
    expect(sql).toContain("partner_commission_ledger_settlement_batch_fk");
    expect(sql).toContain("'certified_partner'");
    expect(sql).toContain("'city_partner'");
    expect(sql).toContain("'city_operation_center'");
  });
});
