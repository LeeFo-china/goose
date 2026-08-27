import { describe, expect, test } from "bun:test";

import { assertLocalSupplierPurchaseBatchDatabaseUrl } from
  "./supplier-purchase-batch-local-db";

describe("supplier purchase batch local database guard", () => {
  test("rejects remote hosts including userinfo hostname tricks", () => {
    expect(() => assertLocalSupplierPurchaseBatchDatabaseUrl(
      "postgresql://postgres:secret@db.example.com:54322/postgres",
    )).toThrow("SUPPLIER_PURCHASE_BATCH_LOCAL_DATABASE_REQUIRED");
    expect(() => assertLocalSupplierPurchaseBatchDatabaseUrl(
      "postgresql://localhost@db.example.com:54322/postgres",
    )).toThrow("SUPPLIER_PURCHASE_BATCH_LOCAL_DATABASE_REQUIRED");
  });

  test("rejects a wrong port or database", () => {
    expect(() => assertLocalSupplierPurchaseBatchDatabaseUrl(
      "postgresql://postgres:postgres@127.0.0.1:5432/postgres",
    )).toThrow("SUPPLIER_PURCHASE_BATCH_LOCAL_DATABASE_REQUIRED");
    expect(() => assertLocalSupplierPurchaseBatchDatabaseUrl(
      "postgresql://postgres:postgres@127.0.0.1:54322/production",
    )).toThrow("SUPPLIER_PURCHASE_BATCH_LOCAL_DATABASE_REQUIRED");
  });

  test("accepts only the configured local Supabase database target", () => {
    expect(String(assertLocalSupplierPurchaseBatchDatabaseUrl(
      "postgresql://postgres:postgres@localhost:54322/postgres",
    ))).toBe("postgresql://postgres:postgres@localhost:54322/postgres");
    expect(String(assertLocalSupplierPurchaseBatchDatabaseUrl(
      "postgresql://postgres:postgres@[::1]:54322/postgres",
    ))).toBe("postgresql://postgres:postgres@[::1]:54322/postgres");
  });
});
