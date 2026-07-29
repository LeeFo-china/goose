import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const migrationSql = readFileSync(
  new URL(
    "../../../../supabase/migrations/20260728120000_create_branding_addon_commerce.sql",
    import.meta.url,
  ),
  "utf8",
);

const PLATFORM_LIST_INDEX_NAMES = [
  "tenant_addon_orders_platform_created_idx",
  "tenant_addon_orders_platform_tenant_created_idx",
  "tenant_addon_orders_order_no_trgm_idx",
  "tenant_addon_orders_out_trade_no_trgm_idx",
  "tenant_addon_orders_transaction_id_trgm_idx",
] as const;

function normalizeSql(sql: string): string {
  return sql
    .replace(/\s+/g, " ")
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")")
    .trim()
    .toLowerCase();
}

function expectPlatformListIndexes(sql: string): void {
  const normalized = normalizeSql(sql);
  for (const contract of [
    "create index tenant_addon_orders_platform_created_idx " +
      "on public.tenant_addon_orders(created_at desc, id desc)",
    "create index tenant_addon_orders_platform_tenant_created_idx " +
      "on public.tenant_addon_orders(tenant_id, created_at desc, id desc)",
    "create index tenant_addon_orders_order_no_trgm_idx " +
      "on public.tenant_addon_orders using gin " +
      "(order_no extensions.gin_trgm_ops)",
    "create index tenant_addon_orders_out_trade_no_trgm_idx " +
      "on public.tenant_addon_orders using gin " +
      "(out_trade_no extensions.gin_trgm_ops)",
    "create index tenant_addon_orders_transaction_id_trgm_idx " +
      "on public.tenant_addon_orders using gin " +
      "(transaction_id extensions.gin_trgm_ops)",
  ]) {
    expect(normalized).toContain(contract);
  }
}

describe("branding add-on platform list index migration contract", () => {
  test("supports default, tenant-only, and all contains-search paths", () => {
    expectPlatformListIndexes(migrationSql);
  });

  test("reuses the preinstalled extensions.pg_trgm operator class", () => {
    const normalized = normalizeSql(migrationSql);

    expect(normalized).not.toContain("create extension");
    expect(normalized.match(/extensions\.gin_trgm_ops/g)?.length).toBe(3);
  });

  test("documents each index in the forward rollback instructions", () => {
    const rollback = normalizeSql(
      migrationSql.slice(0, migrationSql.indexOf("BEGIN;")),
    );

    for (const indexName of PLATFORM_LIST_INDEX_NAMES) {
      expect(rollback).toContain(indexName);
    }
  });

  test("mutation fixture rejects every missing platform list index", () => {
    for (const indexName of PLATFORM_LIST_INDEX_NAMES) {
      const mutated = migrationSql.replace(
        `CREATE INDEX ${indexName}`,
        `CREATE INDEX ${indexName}_removed`,
      );
      expect(mutated).not.toBe(migrationSql);
      expect(() => expectPlatformListIndexes(mutated)).toThrow();
    }
  });
});
