import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

describe("platform partner portal migration", () => {
  test("creates partner members table and indexes", () => {
    const migrationsDir = join(import.meta.dir, "../../../../supabase/migrations");
    const migrationName = readdirSync(migrationsDir)
      .find((name) => name.endsWith("_create_platform_partner_members.sql"));

    expect(migrationName).toBeTruthy();
    const migrationPath = join(migrationsDir, migrationName!);
    expect(existsSync(migrationPath)).toBe(true);

    const sql = readFileSync(migrationPath, "utf8");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.platform_partner_members");
    expect(sql).toContain("partner_id uuid NOT NULL REFERENCES public.platform_partners(id)");
    expect(sql).toContain("auth_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL");
    expect(sql).toContain("DROP CONSTRAINT IF EXISTS sms_verification_codes_scene_check");
    expect(sql).toContain("'bind_customer'::text");
    expect(sql).toContain("'bind_employee'::text");
    expect(sql).toContain("'admin_login'::text");
    expect(sql).toContain("'rebind_wechat'::text");
    expect(sql).toContain("'bind_platform_partner'::text");
    expect(sql).toContain("tr_platform_partner_members_updated_at");
    expect(sql).toContain("platform_partner_members_partner_phone_idx");
    expect(sql).toContain("platform_partner_members_auth_user_status_idx");
    expect(sql).toContain("platform_partner_members_partner_status_idx");
  });
});
