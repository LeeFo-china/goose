import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

const migrationsDir = join(import.meta.dir, "../../../../supabase/migrations");
const routeMigrationFile =
  "20260716093000_seed_project_operational_risk_ai_route.sql";

function readAllMigrationSql() {
  return readdirSync(migrationsDir)
    .filter((fileName) => fileName.endsWith(".sql"))
    .sort()
    .map((fileName) => readFileSync(join(migrationsDir, fileName), "utf8"))
    .join("\n");
}

function readRouteMigrationSql() {
  return readFileSync(join(migrationsDir, routeMigrationFile), "utf8");
}

function includesSql(sql: string, expected: string) {
  return sql.includes(expected);
}

describe("project operational risk AI route migration", () => {
  test("versions the default project operational risk summary scene route", () => {
    const sql = readAllMigrationSql();
    const lowerSql = sql.toLowerCase();

    expect(includesSql(sql, "'project_operational_risk_summary'")).toBe(true);
    expect(includesSql(sql, "'项目运营风险摘要'")).toBe(true);
    expect(includesSql(sql, "'deepseek-chat'")).toBe(true);
    expect(includesSql(sql, "0.200::numeric")).toBe(true);
    expect(includesSql(sql, "'json_object'")).toBe(true);
    expect(includesSql(sql, "30000")).toBe(true);
    expect(includesSql(lowerSql, "on conflict (scene_code) do update")).toBe(true);
  });

  test("does not overwrite existing model choices when backfilling the scene route", () => {
    const lowerSql = readRouteMigrationSql().toLowerCase();

    expect(
      includesSql(
        lowerSql,
        "primary_model_id = coalesce(public.ai_scene_routes.primary_model_id, excluded.primary_model_id)",
      ),
    ).toBe(true);
    expect(
      includesSql(
        lowerSql,
        "fallback_model_id = coalesce(public.ai_scene_routes.fallback_model_id, excluded.fallback_model_id)",
      ),
    ).toBe(true);
  });
});
