import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("./supplier-purchasable-sku-smoke-fixture.ts", import.meta.url),
  "utf8",
);
const cleanup = source.split(
  "export async function cleanupSupplierPurchasableSkuSmokeFixture",
)[1]?.split("export async function countSupplierPurchasableSkuSmokeResiduals")[0] ?? "";
const residuals = source.split(
  "export async function countSupplierPurchasableSkuSmokeResiduals",
)[1] ?? "";

describe("supplier purchasable SKU cleanup warehouse safeguards", () => {
  test("restores FK enforcement before warehouse and parent deletion", () => {
    const origin = cleanup.indexOf("set local session_replication_role = origin");
    const warehouse = cleanup.indexOf("delete from public.warehouses");
    const employees = cleanup.indexOf("delete from public.employees");

    expect(origin).toBeGreaterThan(cleanup.indexOf("delete from public.catalog_units"));
    expect(warehouse).toBeGreaterThan(origin);
    expect(employees).toBeGreaterThan(warehouse);
    expect(cleanup.slice(origin)).not.toContain("session_replication_role = replica");
  });

  test("only removes the untouched default warehouse owned by the fixture actor", () => {
    const warehouse = cleanup.match(/delete from public\.warehouses[\s\S]*?`;/)?.[0] ?? "";

    for (const predicate of [
      "tenant_id = ${fixture.tenantId}::uuid",
      "name = '公司仓库'",
      "is_default",
      "status = 'active'",
      "version = 1",
      "manager_employee_id is null",
      "created_by_employee_id = ${fixture.actorEmployeeId}::uuid",
      "updated_by_employee_id = ${fixture.actorEmployeeId}::uuid",
    ]) {
      expect(warehouse).toContain(predicate);
    }
    expect(cleanup).not.toMatch(/delete from public\.(inventory_\w+|warehouse_command_events)/);
  });

  test.each(["warehouses", "warehouse_command_events"])(
    "residual count includes %s for both fixture tenants",
    (table) => {
      expect(residuals).toContain(
        `from public.${table} where tenant_id in\n` +
        "        (${fixture.tenantId}::uuid, ${fixture.otherTenantId}::uuid)",
      );
    },
  );
});
