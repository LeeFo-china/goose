import { expect, test } from "bun:test";
import { assertSupplierRolloutDependencies, assertSupplierRolloutTransition, effectiveSupplierRolloutSettings } from "./supplier-rollout-settings";

const enabled = {
  module_enabled: true, ownership_reads_enabled: false,
  private_supplier_writes_enabled: false, private_catalog_writes_enabled: false,
  procurement_snapshot_v1_enabled: false, purchase_batch_workflow_enabled: false,
  warehouse_procurement_enabled: false, warehouse_materials_enabled: true,
};

test("warehouse materials require only the supplier module and do not advance procurement rollout", () => {
  expect(() => assertSupplierRolloutDependencies(enabled)).not.toThrow();
  expect(effectiveSupplierRolloutSettings(enabled).warehouse_materials_enabled).toBe(true);
  expect(() => assertSupplierRolloutTransition({ ...enabled, warehouse_materials_enabled: false }, enabled)).not.toThrow();
});

test("turning the module off cannot leave warehouse materials enabled", () => {
  const invalid = { ...enabled, module_enabled: false };
  expect(() => assertSupplierRolloutDependencies(invalid)).toThrow();
  expect(effectiveSupplierRolloutSettings(invalid).warehouse_materials_enabled).toBe(false);
});
