import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const migrationPath = join(
  import.meta.dir,
  "../../../../../supabase/migrations/20260829005000_allow_douyin_release_deployment_environment.sql",
);

describe("douyin release deployment environment table constraint migration", () => {
  test("keeps legacy release ext JSON valid and permits one bounded deployment target", () => {
    expect(existsSync(migrationPath)).toBe(true);
    const source = readFileSync(migrationPath, "utf8")
      .replace(/--.*$/gm, "")
      .replace(/\s+/g, " ")
      .trim();

    expect(source).toContain(
      "DROP CONSTRAINT IF EXISTS douyin_miniapp_releases_ext_json_check",
    );
    expect(source).toContain(
      "ADD CONSTRAINT douyin_miniapp_releases_ext_json_check CHECK",
    );
    expect(source).toMatch(
      /\(ext_json -> 'ext'\) - ARRAY\['deployment_key', 'deployment_environment'\]::text\[\] = '\{\}'::jsonb/,
    );
    expect(source).toContain(
      "NOT (ext_json -> 'ext' ? 'deployment_environment')",
    );
    expect(source).toMatch(/deployment_environment.*development.*production/);
    expect(source).toContain(
      "VALIDATE CONSTRAINT douyin_miniapp_releases_ext_json_check",
    );
    expect(source).not.toContain("jsonb_object_length");
  });
});
