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

describe("partner applications migration", () => {
  test("creates official website partner application table and indexes", () => {
    const sql = readMigration("_create_partner_applications.sql");

    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.platform_partner_applications");
    expect(sql).toContain("application_no text NOT NULL UNIQUE");
    expect(sql).toContain("converted_partner_id uuid NULL REFERENCES public.platform_partners(id)");
    expect(sql).toContain("status IN ('submitted', 'reviewing', 'approved', 'rejected')");
    expect(sql).toContain("platform_partner_applications_status_created_idx");
    expect(sql).toContain("platform_partner_applications_phone_created_idx");
    expect(sql).toContain("platform_partner_applications_region_codes_idx");
  });

  test("extends SMS verification storage for partner applications", () => {
    const sql = readMigration("_partner_application_phone_verification.sql");

    expect(sql).toContain("ADD COLUMN IF NOT EXISTS request_device text NULL");
    expect(sql).toContain("'partner_application'::text");
    expect(sql).toContain("sms_verification_codes_scene_device_created_idx");
  });
});
