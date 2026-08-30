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
};

describe("tenant supplier settings UI rollout rules", () => {
  test("only enables the current legal next or previous switch", () => {
    expect(SUPPLIER_ROLLOUT_FLAGS).toEqual([
      "ownership_reads_enabled",
      "private_supplier_writes_enabled",
      "private_catalog_writes_enabled",
      "procurement_snapshot_v1_enabled",
      "purchase_batch_workflow_enabled",
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
