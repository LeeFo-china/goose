import type { PlatformTenantSupplierSettingsCommand } from "@/schema/platform-suppliers";

export function supplierSettingsCommandArgs(input: PlatformTenantSupplierSettingsCommand): Record<string, unknown> {
  if (input.warehouse_materials_enabled !== undefined) {
    const { actor_user_id, idempotency_key, ...request } = input;
    return {
      p_request: Object.fromEntries(Object.entries({ ...request, reason: input.reason ?? null })
        .filter(([, value]) => value !== undefined)),
      p_actor_user_id: actor_user_id,
      p_idempotency_key: idempotency_key,
    };
  }
  // Preserve historical typed RPC request fields and fingerprints verbatim.
  return {
    p_tenant_id: input.tenant_id, p_module_enabled: input.module_enabled,
    p_require_active_contract_for_new_order: input.require_active_contract_for_new_order,
    p_ownership_reads_enabled: input.ownership_reads_enabled,
    p_private_supplier_writes_enabled: input.private_supplier_writes_enabled,
    p_private_catalog_writes_enabled: input.private_catalog_writes_enabled,
    p_procurement_snapshot_v1_enabled: input.procurement_snapshot_v1_enabled,
    p_purchase_batch_workflow_enabled: input.purchase_batch_workflow_enabled,
    ...(input.warehouse_procurement_enabled === undefined ? {} : {
      p_warehouse_procurement_enabled: input.warehouse_procurement_enabled,
    }),
    p_expected_version: input.expected_version, p_actor_user_id: input.actor_user_id,
    p_actor_employee_id: input.actor_employee_id,
    p_idempotency_key: input.idempotency_key,
    p_reason: input.reason ?? null,
  };
}
