import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const migrationDir = join(
  import.meta.dir,
  "../../../../supabase/migrations",
);

function readMigration(suffix: string) {
  const file = readdirSync(migrationDir)
    .filter((name) => name.endsWith(suffix))
    .sort()
    .at(-1);
  expect(file).toBeTruthy();
  return readFileSync(join(migrationDir, file as string), "utf8");
}

function readAllMigrations() {
  return readdirSync(migrationDir)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => readFileSync(join(migrationDir, name), "utf8"))
    .join("\n");
}

describe("city partner migrations", () => {
  test("creates partner, revenue, commission, and settlement tables", () => {
    const sql = readMigration("_create_city_partner_mvp.sql");

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

  test("registers platform partner permissions for platform admins", () => {
    const sql = readAllMigrations();

    expect(sql).toContain("'platform.partner.read'");
    expect(sql).toContain("'platform.partner.manage'");
    expect(sql).toContain("'platform.partner.level.manage'");
    expect(sql).toContain("'platform.partner.binding.manage'");
    expect(sql).toContain("'platform.partner.revenue.read'");
    expect(sql).toContain("'platform.partner.revenue.manage'");
    expect(sql).toContain("'platform.partner.commission.read'");
    expect(sql).toContain("'platform.partner.commission.manage'");
    expect(sql).toContain("'platform.partner.settlement.manage'");
    expect(sql).toContain("WHERE roles.code = 'platform_admin'");
    expect(sql).toContain("roles.tenant_id IS NULL");
  });

  test("adds member status remark storage for management actions", () => {
    const sql = readAllMigrations();

    expect(sql).toContain("ALTER TABLE public.platform_partner_members");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS remark text NULL");
  });

  test("enforces district regions without rewriting legacy partner coverage", () => {
    const sql = readMigration(
      "_enforce_platform_partner_district_regions.sql",
    );

    expect(sql).toContain("ADD COLUMN IF NOT EXISTS region_version integer");
    expect(sql).toContain("administrative_areas");
    expect(sql).toContain("area.level = 'district'");
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toContain("other_partner.region_codes && NEW.region_codes");
    expect(sql).toContain("NEW.status = 'active'");
    expect(sql).toContain("NEW.status IS DISTINCT FROM OLD.status");
    expect(sql).toContain("enforce_platform_partner_district_regions");
    expect(sql).toContain("BEFORE INSERT OR UPDATE OF status, region_codes");
    expect(sql).not.toMatch(/UPDATE\s+public\.platform_partners\s+SET\s+region_codes/i);
  });
});
