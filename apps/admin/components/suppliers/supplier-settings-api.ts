import { requestBackendJson } from "@/lib/backend-client";

import type { TenantSupplierSettings } from "./supplier-types";

export type PlatformModuleIntent = {
  moduleEnabled: boolean;
  ownershipReadsEnabled?: boolean;
  privateSupplierWritesEnabled?: boolean;
  privateCatalogWritesEnabled?: boolean;
  procurementSnapshotV1Enabled?: boolean;
  purchaseBatchWorkflowEnabled?: boolean;
  warehouseProcurementEnabled?: boolean;
  warehouseMaterialsEnabled?: boolean;
  warehouseTransfersEnabled?: boolean;
  reason?: string;
};

export async function loadPlatformTenantSupplierSettings(tenantId: string) {
  return requestBackendJson<TenantSupplierSettings | null>(
    `/platform/tenant-supplier-settings/${tenantId}`,
    { fallbackMessage: "供应商模块配置刷新失败" },
  );
}

export type PlatformSupplierSettingsRequest = Readonly<{
  tenantId: string;
  idempotencyKey: string;
  body: string;
}>;

export function createPlatformSupplierSettingsRequest({
  tenantId,
  current,
  intent,
  idempotencyKey,
}: {
  tenantId: string;
  current: TenantSupplierSettings;
  intent: PlatformModuleIntent;
  idempotencyKey: string;
}): PlatformSupplierSettingsRequest {
  return Object.freeze({
      tenantId,
      idempotencyKey,
      body: JSON.stringify({
        module_enabled: intent.moduleEnabled,
        require_active_contract_for_new_order:
          current.require_active_contract_for_new_order,
        ownership_reads_enabled: intent.ownershipReadsEnabled ??
          current.ownership_reads_enabled,
        private_supplier_writes_enabled: intent.privateSupplierWritesEnabled ??
          current.private_supplier_writes_enabled,
        private_catalog_writes_enabled: intent.privateCatalogWritesEnabled ??
          current.private_catalog_writes_enabled,
        procurement_snapshot_v1_enabled:
          intent.procurementSnapshotV1Enabled ??
          current.procurement_snapshot_v1_enabled,
        purchase_batch_workflow_enabled:
          intent.purchaseBatchWorkflowEnabled ??
          current.purchase_batch_workflow_enabled,
        warehouse_procurement_enabled:
          intent.warehouseProcurementEnabled ??
          current.warehouse_procurement_enabled ?? false,
        warehouse_materials_enabled:
          intent.warehouseMaterialsEnabled ?? current.warehouse_materials_enabled ?? false,
        warehouse_transfers_enabled:
          intent.warehouseTransfersEnabled ?? current.warehouse_transfers_enabled ?? false,
        expected_version: current.version,
        ...(intent.reason ? { reason: intent.reason } : {}),
      }),
  });
}

export async function updatePlatformTenantSupplierModule(input:
  PlatformSupplierSettingsRequest | Parameters<typeof createPlatformSupplierSettingsRequest>[0]) {
  const request = "body" in input ? input : createPlatformSupplierSettingsRequest(input);
  return requestBackendJson<TenantSupplierSettings>(
    `/platform/tenant-supplier-settings/${request.tenantId}`,
    { method: "PATCH", headers: { "Idempotency-Key": request.idempotencyKey },
      body: request.body, fallbackMessage: "供应商模块配置保存失败" },
  );
}

export async function loadTenantSupplierSettings() {
  return requestBackendJson<TenantSupplierSettings>("/supplier-settings", {
    fallbackMessage: "供应商模块配置加载失败",
  });
}

export async function updateTenantSupplierContractPolicy({
  requireActiveContract,
  expectedVersion,
}: {
  requireActiveContract: boolean;
  expectedVersion: number;
}) {
  return requestBackendJson<TenantSupplierSettings>(
    "/supplier-settings/contract-policy",
    {
      method: "PATCH",
      body: JSON.stringify({
        require_active_contract_for_new_order: requireActiveContract,
        expected_version: expectedVersion,
      }),
      fallbackMessage: "新订单合同策略保存失败",
    },
  );
}
