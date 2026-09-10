import { describe, expect, test } from "bun:test";

import {
  canToggleSupplierRolloutFlag,
  hasEnabledSupplierRolloutFlags,
  SUPPLIER_ROLLOUT_FLAGS,
} from "./tenant-supplier-settings-rules";

const settings = {
  module_enabled: true,
  ownership_reads_enabled: false,
  private_supplier_writes_enabled: false,
  private_catalog_writes_enabled: false,
  procurement_snapshot_v1_enabled: false,
  purchase_batch_workflow_enabled: false,
  warehouse_procurement_enabled: false,
};

describe("tenant supplier settings UI rollout rules", () => {
  test("stocktake is independent and prevents parent disable", () => {
    const stocktakes = { ...settings, warehouse_stocktakes_enabled: true };
    expect(hasEnabledSupplierRolloutFlags(stocktakes)).toBe(true);
    expect(canToggleSupplierRolloutFlag(settings, "warehouse_stocktakes_enabled")).toBe(true);
    expect(canToggleSupplierRolloutFlag({ ...stocktakes, module_enabled: false }, "warehouse_stocktakes_enabled")).toBe(false);
    expect(canToggleSupplierRolloutFlag(stocktakes, "warehouse_transfers_enabled")).toBe(true);
  });
  test("transfers is independent of procurement and materials but blocks module disable", () => {
    const transfers = { ...settings, warehouse_transfers_enabled: true };
    expect(hasEnabledSupplierRolloutFlags(transfers)).toBe(true);
    expect(canToggleSupplierRolloutFlag(settings, "warehouse_transfers_enabled")).toBe(true);
    expect(canToggleSupplierRolloutFlag({ ...transfers, module_enabled: false }, "warehouse_transfers_enabled")).toBe(false);
    expect(canToggleSupplierRolloutFlag(transfers, "warehouse_materials_enabled")).toBe(true);
    expect(canToggleSupplierRolloutFlag(transfers, "ownership_reads_enabled")).toBe(true);
  });
  test("materials is independent of purchase rollout but prevents module disable", () => {
    const materials = { ...settings, warehouse_materials_enabled: true };
    expect(hasEnabledSupplierRolloutFlags(materials)).toBe(true);
    expect(canToggleSupplierRolloutFlag(settings, "warehouse_materials_enabled")).toBe(true);
    expect(canToggleSupplierRolloutFlag({ ...materials, module_enabled: false }, "warehouse_materials_enabled")).toBe(false);
  });
  test("only enables the current legal next or previous switch", () => {
    expect(SUPPLIER_ROLLOUT_FLAGS).toEqual([
      "ownership_reads_enabled",
      "private_supplier_writes_enabled",
      "private_catalog_writes_enabled",
      "procurement_snapshot_v1_enabled",
      "purchase_batch_workflow_enabled",
      "warehouse_procurement_enabled",
    ]);
    expect(canToggleSupplierRolloutFlag(
      settings,
      "ownership_reads_enabled",
    )).toBe(true);
    expect(canToggleSupplierRolloutFlag(
      settings,
      "private_supplier_writes_enabled",
    )).toBe(false);

    const levelThree = {
      ...settings,
      ownership_reads_enabled: true,
      private_supplier_writes_enabled: true,
    };
    expect(canToggleSupplierRolloutFlag(
      levelThree,
      "ownership_reads_enabled",
    )).toBe(false);
    expect(canToggleSupplierRolloutFlag(
      levelThree,
      "private_supplier_writes_enabled",
    )).toBe(true);
    expect(canToggleSupplierRolloutFlag(
      levelThree,
      "private_catalog_writes_enabled",
    )).toBe(true);
    expect(canToggleSupplierRolloutFlag(
      levelThree,
      "procurement_snapshot_v1_enabled",
    )).toBe(false);

    const levelFive = {
      ...levelThree,
      private_catalog_writes_enabled: true,
      procurement_snapshot_v1_enabled: true,
    };
    expect(canToggleSupplierRolloutFlag(
      levelFive,
      "procurement_snapshot_v1_enabled",
    )).toBe(true);
    expect(canToggleSupplierRolloutFlag(
      levelFive,
      "purchase_batch_workflow_enabled",
    )).toBe(true);

    const levelSix = {
      ...levelFive,
      purchase_batch_workflow_enabled: true,
    };
    expect(canToggleSupplierRolloutFlag(
      levelSix,
      "procurement_snapshot_v1_enabled",
    )).toBe(false);
    expect(canToggleSupplierRolloutFlag(
      levelSix,
      "purchase_batch_workflow_enabled",
    )).toBe(true);
    expect(canToggleSupplierRolloutFlag(levelSix, "warehouse_procurement_enabled")).toBe(true);
    expect(canToggleSupplierRolloutFlag({ ...levelSix, warehouse_procurement_enabled: true },
      "purchase_batch_workflow_enabled")).toBe(false);
  });

  test("disables all child switches while the module is off", () => {
    for (const flag of SUPPLIER_ROLLOUT_FLAGS) {
      expect(canToggleSupplierRolloutFlag(
        { ...settings, module_enabled: false },
        flag,
      )).toBe(false);
    }
  });

  test("detects child flags that must be closed before module disable", () => {
    expect(hasEnabledSupplierRolloutFlags(settings)).toBe(false);
    expect(hasEnabledSupplierRolloutFlags({
      ...settings,
      ownership_reads_enabled: true,
    })).toBe(true);
  });
});
