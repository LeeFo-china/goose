import type { TenantSupplierSettings } from "../suppliers/supplier-types";

export const SUPPLIER_ROLLOUT_FLAGS = [
  "ownership_reads_enabled",
  "private_supplier_writes_enabled",
  "private_catalog_writes_enabled",
  "procurement_snapshot_v1_enabled",
  "purchase_batch_workflow_enabled",
] as const;

export type SupplierRolloutFlag = typeof SUPPLIER_ROLLOUT_FLAGS[number];
type SupplierRolloutSettings = Pick<
  TenantSupplierSettings,
  "module_enabled" | SupplierRolloutFlag
>;

export function canToggleSupplierRolloutFlag(
  settings: SupplierRolloutSettings,
  flag: SupplierRolloutFlag,
): boolean {
  if (!settings.module_enabled) return false;
  const index = SUPPLIER_ROLLOUT_FLAGS.indexOf(flag);
  const previousEnabled = SUPPLIER_ROLLOUT_FLAGS
    .slice(0, index)
    .every((candidate) => settings[candidate]);
  const followingDisabled = SUPPLIER_ROLLOUT_FLAGS
    .slice(index + 1)
    .every((candidate) => !settings[candidate]);
  return previousEnabled && followingDisabled;
}

export function hasEnabledSupplierRolloutFlags(
  settings: Pick<TenantSupplierSettings, SupplierRolloutFlag>,
): boolean {
  return SUPPLIER_ROLLOUT_FLAGS.some((flag) => settings[flag]);
}
