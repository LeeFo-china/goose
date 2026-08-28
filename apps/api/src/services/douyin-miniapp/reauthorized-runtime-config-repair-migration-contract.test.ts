import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const migrationPath = join(
  import.meta.dir,
  "../../../../../supabase/migrations/20260828193000_repair_reauthorized_douyin_runtime_config.sql",
);

function compactSql(): string {
  expect(existsSync(migrationPath)).toBe(true);
  return readFileSync(migrationPath, "utf8")
    .replace(/--.*$/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

describe("reauthorized Douyin runtime config repair migration", () => {
  test("copies only the known tenant runtime config with strict installation checks", () => {
    const sql = compactSql();

    expect(sql).toContain("3eebca47-961f-4899-b976-a3d3208d326b");
    expect(sql).toContain("2452739c-1683-4a57-a0af-b5e973e349a0");
    expect(sql).toContain("82061c96-29ac-4426-baff-5efc1061fbc8");
    expect(sql).toContain("FOR UPDATE");
    expect(sql).toContain("authorization_status IS DISTINCT FROM 'active'");
    expect(sql).toContain("authorization_status IS DISTINCT FROM 'revoked'");
    expect(sql).toContain("SET runtime_config = v_merged_runtime");
    expect(sql).toContain("DOUYIN_REAUTHORIZED_RUNTIME_CONFIG_PRECONDITION_FAILED");
    expect(sql).toContain("DOUYIN_REAUTHORIZED_RUNTIME_CONFIG_UPDATE_MISMATCH");
  });

  test("is idempotent after the active installation has inherited the source config", () => {
    const sql = compactSql();

    expect(sql).toContain(
      "IF v_target.runtime_config = v_merged_runtime THEN RETURN",
    );
    expect(sql).not.toMatch(/SET[^;]*(access_token|refresh_token)/);
  });

  test("is harmless in environments without the production target", () => {
    const sql = compactSql();

    expect(sql).toContain("IF v_target.id IS NULL THEN RETURN");
  });
});
