import { describe, expect, test } from "bun:test";

import {
  assertSupplierRolloutDependencies,
  assertSupplierRolloutTransition,
  effectiveSupplierRolloutSettings,
} from "./supplier-rollout-settings";

const disabled = {
  module_enabled: false,
  ownership_reads_enabled: false,
  private_supplier_writes_enabled: false,
  private_catalog_writes_enabled: false,
  procurement_snapshot_v1_enabled: false,
};

describe("supplier rollout settings", () => {
  test("allows every adjacent enable and reverse disable step", () => {
    const states = [
      disabled,
      { ...disabled, module_enabled: true },
      { ...disabled, module_enabled: true, ownership_reads_enabled: true },
      {
        ...disabled,
        module_enabled: true,
        ownership_reads_enabled: true,
        private_supplier_writes_enabled: true,
      },
      {
        ...disabled,
        module_enabled: true,
        ownership_reads_enabled: true,
        private_supplier_writes_enabled: true,
        private_catalog_writes_enabled: true,
      },
      {
        module_enabled: true,
        ownership_reads_enabled: true,
        private_supplier_writes_enabled: true,
        private_catalog_writes_enabled: true,
        procurement_snapshot_v1_enabled: true,
      },
    ];

    for (let index = 1; index < states.length; index += 1) {
      expect(() => assertSupplierRolloutTransition(
        states[index - 1]!,
        states[index]!,
      )).not.toThrow();
      expect(() => assertSupplierRolloutTransition(
        states[index]!,
        states[index - 1]!,
      )).not.toThrow();
    }
  });

  test("rejects skipped transitions", () => {
    expect(() => assertSupplierRolloutTransition(disabled, {
      ...disabled,
      module_enabled: true,
      ownership_reads_enabled: true,
      private_supplier_writes_enabled: true,
    })).toThrow("供应商灰度开关必须按顺序逐步调整");
  });

  test("rejects dependency-invalid targets", () => {
    for (const target of [
      { ...disabled, module_enabled: true, private_supplier_writes_enabled: true },
      { ...disabled, ownership_reads_enabled: true },
    ]) {
      expect(() => assertSupplierRolloutDependencies(target))
        .toThrow("供应商灰度开关必须按顺序逐步调整");
    }
  });

  test("validates target dependencies independently from current state", () => {
    expect(() => assertSupplierRolloutDependencies({
      ...disabled,
      module_enabled: true,
      private_supplier_writes_enabled: true,
    })).toThrow("供应商灰度开关必须按顺序逐步调整");

    expect(() => assertSupplierRolloutDependencies({
      ...disabled,
      module_enabled: true,
      ownership_reads_enabled: true,
    })).not.toThrow();
  });

  test("normalizes invalid tenant-visible combinations fail closed", () => {
    expect(effectiveSupplierRolloutSettings({
      ...disabled,
      module_enabled: false,
      ownership_reads_enabled: true,
      private_supplier_writes_enabled: true,
      private_catalog_writes_enabled: true,
      procurement_snapshot_v1_enabled: true,
    })).toEqual(disabled);

    expect(effectiveSupplierRolloutSettings({
      ...disabled,
      module_enabled: true,
      ownership_reads_enabled: true,
      private_supplier_writes_enabled: false,
      private_catalog_writes_enabled: true,
      procurement_snapshot_v1_enabled: true,
    })).toEqual({
      ...disabled,
      module_enabled: true,
      ownership_reads_enabled: true,
    });
  });
});
