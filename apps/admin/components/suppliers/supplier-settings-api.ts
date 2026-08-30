import { requestBackendJson } from "@/lib/backend-client";

import type { TenantSupplierSettings } from "./supplier-types";

export type PlatformModuleIntent = {
  moduleEnabled: boolean;
  ownershipReadsEnabled?: boolean;
  privateSupplierWritesEnabled?: boolean;
  privateCatalogWritesEnabled?: boolean;
  procurementSnapshotV1Enabled?: boolean;
  purchaseBatchWorkflowEnabled?: boolean;
  reason?: string;
};

export async function loadPlatformTenantSupplierSettings(tenantId: string) {
  return requestBackendJson<TenantSupplierSettings | null>(
    `/platform/tenant-supplier-settings/${tenantId}`,
    { fallbackMessage: "供应商模块配置刷新失败" },
  );
}

export async function updatePlatformTenantSupplierModule({
  tenantId,
  current,
  intent,
  idempotencyKey,
}: {
  tenantId: string;
  current: TenantSupplierSettings;
  intent: PlatformModuleIntent;
  idempotencyKey: string;
}) {
  return requestBackendJson<TenantSupplierSettings>(
    `/platform/tenant-supplier-settings/${tenantId}`,
    {
      method: "PATCH",
      headers: { "Idempotency-Key": idempotencyKey },
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
        expected_version: current.version,
        ...(intent.reason ? { reason: intent.reason } : {}),
      }),
      fallbackMessage: "供应商模块配置保存失败",
    },
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
