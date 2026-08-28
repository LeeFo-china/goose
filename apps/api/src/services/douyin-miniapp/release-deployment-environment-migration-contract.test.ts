import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const migrationPath = join(
  import.meta.dir,
  "../../../../../supabase/migrations/20260828224100_repair_douyin_release_ext_validation.sql",
);

describe("douyin release deployment environment migration", () => {
  test("accepts legacy extConfig and validates the new deployment target", () => {
    expect(existsSync(migrationPath)).toBe(true);
    const source = readFileSync(migrationPath, "utf8")
      .replace(/--.*$/gm, "")
      .replace(/\s+/g, " ")
      .trim();

    expect(source).toContain(
      "CREATE OR REPLACE FUNCTION public.get_or_create_and_claim_douyin_miniapp_release_upload",
    );
    expect(source).toMatch(/deployment_environment/);
    expect(source).toMatch(/development.*production/);
    expect(source).toMatch(/- ARRAY\['deployment_key', 'deployment_environment'\]::text\[\] <> '\{\}'::jsonb/);
    expect(source).not.toContain("jsonb_object_length");
  });

  test("keeps the upload claim RPC service-role-only", () => {
    const source = readFileSync(migrationPath, "utf8")
      .replace(/--.*$/gm, "")
      .replace(/\s+/g, " ")
      .trim();
    const signature = "public\\.get_or_create_and_claim_douyin_miniapp_release_upload\\( uuid, text, text, text, text, jsonb, uuid, timestamptz, uuid \\)";

    for (const role of ["PUBLIC", "anon", "authenticated"]) {
      expect(source).toMatch(new RegExp(`REVOKE ALL ON FUNCTION ${signature} FROM ${role}`));
    }
    expect(source).toMatch(
      new RegExp(`GRANT EXECUTE ON FUNCTION ${signature} TO service_role`),
    );
  });
});
