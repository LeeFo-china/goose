import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const migrationPath = join(
  import.meta.dir,
  "../../../../../supabase/migrations/20260828140000_repair_transferred_douyin_runtime_config.sql",
);
const exportPath = join(
  import.meta.dir,
  "../../../../../scripts/ops/tenant-transfer/export.sql",
);

function compact(path: string): string {
  expect(existsSync(path)).toBe(true);
  return readFileSync(path, "utf8")
    .replace(/--.*$/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

describe("transferred Douyin runtime config repair", () => {
  test("preserves public runtime config while sanitizing installation credentials", () => {
    const source = compact(exportPath);

    expect(source).toContain("''runtime_config'', row.runtime_config");
    expect(source).not.toContain("''runtime_config'', ''{}''::jsonb");
    expect(source).toContain("''authorization_status'', ''revoked''");
    expect(source).toContain("''access_token_ciphertext'', NULL");
    expect(source).toContain("''refresh_token_ciphertext'', NULL");
  });

  test("repairs only the known sanitized production installation", () => {
    const source = compact(migrationPath);

    expect(source).toContain("82061c96-29ac-4426-baff-5efc1061fbc8");
    expect(source).toContain("3eebca47-961f-4899-b976-a3d3208d326b");
    expect(source).toContain(
      "migrated-disabled-82061c96-29ac-4426-baff-5efc1061fbc8",
    );
    expect(source).toContain("authorization_status IS DISTINCT FROM 'revoked'");
    expect(source).toContain("runtime_config IS DISTINCT FROM '{}'::jsonb");
    expect(source).toContain("FOR UPDATE");
    expect(source).toContain("SET runtime_config = v_expected_runtime_config");
    expect(source).toContain("GET DIAGNOSTICS v_updated_count = ROW_COUNT");
    expect(source).toContain("DOUYIN_TRANSFER_RUNTIME_CONFIG_PRECONDITION_FAILED");
    expect(source).toContain("DOUYIN_TRANSFER_RUNTIME_CONFIG_UPDATE_MISMATCH");
  });

  test("keeps the repair idempotent and harmless outside the sanitized target", () => {
    const source = compact(migrationPath);

    expect(source).toContain("IF NOT FOUND THEN RETURN");
    expect(source).toContain(
      "IF v_installation.authorizer_appid IS DISTINCT FROM v_sanitized_authorizer_appid THEN RETURN",
    );
    expect(source).toContain(
      "IF v_installation.runtime_config = v_expected_runtime_config THEN RETURN",
    );
    expect(source).not.toMatch(/SET[^;]*authorization_status\s*=/);
    expect(source).not.toMatch(/SET[^;]*(access_token|refresh_token)/);
  });
});
