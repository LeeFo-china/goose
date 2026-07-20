import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

describe("wechat pay secret bundle revision migration contract", () => {
  test("binds platform validation to an opaque secret bundle revision", () => {
    const migrationSource = readFileSync(
      new URL(
        "../../../../supabase/migrations/20260720224000_platform_payment_secret_bundle_revision.sql",
        import.meta.url,
      ),
      "utf8",
    );
    const normalizedMigrationSource = migrationSource.replace(/\s+/g, " ")
      .trim();

    expect(migrationSource).toContain(
      "ADD COLUMN IF NOT EXISTS secret_bundle_revision text NULL",
    );
    expect(normalizedMigrationSource).toContain(
      "ADD CONSTRAINT platform_payment_configs_secret_bundle_revision_not_blank CHECK (secret_bundle_revision IS NULL OR btrim(secret_bundle_revision) <> '')",
    );
    expect(migrationSource).toContain(
      "COMMENT ON COLUMN public.platform_payment_configs.secret_bundle_revision",
    );
    expect(migrationSource).toContain("opaque revision");
    expect(migrationSource).toContain("never secret material");
  });
});
