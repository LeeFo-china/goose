import { Errors } from "@/errors/error-factory";

export type SupplierRolloutState = {
  module_enabled: boolean;
  ownership_reads_enabled: boolean;
  private_supplier_writes_enabled: boolean;
  private_catalog_writes_enabled: boolean;
  procurement_snapshot_v1_enabled: boolean;
};

const DISABLED_FLAGS = {
  ownership_reads_enabled: false,
  private_supplier_writes_enabled: false,
  private_catalog_writes_enabled: false,
  procurement_snapshot_v1_enabled: false,
} as const;

export function effectiveSupplierRolloutSettings<
  Settings extends SupplierRolloutState,
>(settings: Settings): Omit<Settings, keyof SupplierRolloutState> &
  SupplierRolloutState {
  const ownershipReadsEnabled = settings.module_enabled &&
    settings.ownership_reads_enabled;
  const privateSupplierWritesEnabled = ownershipReadsEnabled &&
    settings.private_supplier_writes_enabled;
  const privateCatalogWritesEnabled = privateSupplierWritesEnabled &&
    settings.private_catalog_writes_enabled;
  const procurementSnapshotEnabled = privateCatalogWritesEnabled &&
    settings.procurement_snapshot_v1_enabled;

  return {
    ...settings,
    ...(!settings.module_enabled ? DISABLED_FLAGS : {
      ownership_reads_enabled: ownershipReadsEnabled,
      private_supplier_writes_enabled: privateSupplierWritesEnabled,
      private_catalog_writes_enabled: privateCatalogWritesEnabled,
      procurement_snapshot_v1_enabled: procurementSnapshotEnabled,
    }),
  };
}

export function assertSupplierRolloutTransition(
  current: SupplierRolloutState,
  target: SupplierRolloutState,
): void {
  const effectiveTarget = effectiveSupplierRolloutSettings(target);
  const hasInvalidDependency = Object.keys(DISABLED_FLAGS).some((key) =>
    target[key as keyof typeof DISABLED_FLAGS] !==
      effectiveTarget[key as keyof typeof DISABLED_FLAGS]
  );
  const currentLevel = rolloutLevel(effectiveSupplierRolloutSettings(current));
  const targetLevel = rolloutLevel(effectiveTarget);

  if (hasInvalidDependency || Math.abs(targetLevel - currentLevel) > 1) {
    throw Errors.business(
      409,
      "供应商灰度开关必须按顺序逐步调整",
      "SUPPLIER_ROLLOUT_ORDER_INVALID",
    );
  }
}

function rolloutLevel(settings: SupplierRolloutState): number {
  if (!settings.module_enabled) return 0;
  if (settings.procurement_snapshot_v1_enabled) return 5;
  if (settings.private_catalog_writes_enabled) return 4;
  if (settings.private_supplier_writes_enabled) return 3;
  if (settings.ownership_reads_enabled) return 2;
  return 1;
}
