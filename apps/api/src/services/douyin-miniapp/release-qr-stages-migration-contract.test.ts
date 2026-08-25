import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const migrationPath = join(
  import.meta.dir,
  "../../../../../supabase/migrations/20260825102000_split_douyin_release_qr_stages.sql",
);

function sql(): string {
  expect(existsSync(migrationPath)).toBe(true);
  return readFileSync(migrationPath, "utf8")
    .replace(/--.*$/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

describe("douyin release QR stage migration", () => {
  test("adds distinct persisted latest and audit QR URLs without dropping legacy data", () => {
    const source = sql();

    expect(source).toContain("ADD COLUMN IF NOT EXISTS latest_test_qr_url text NULL");
    expect(source).toContain("ADD COLUMN IF NOT EXISTS audit_qr_url text NULL");
    expect(source).toMatch(/latest_test_qr_url = COALESCE\(latest_test_qr_url, test_qr_url\)/);
    expect(source).toContain("douyin_miniapp_releases_latest_test_qr_url_check");
    expect(source).toContain("douyin_miniapp_releases_audit_qr_url_check");
    expect(source).not.toMatch(/DROP COLUMN\s+test_qr_url/i);
  });

  test("extends release operation leases with an audit QR operation", () => {
    const source = sql();

    expect(source).toContain("DROP CONSTRAINT IF EXISTS douyin_miniapp_releases_operation_name_check");
    expect(source).toMatch(/operation_name IN \([^)]*'test_qr'[^)]*'audit_qr'[^)]*\)/);
  });
});
