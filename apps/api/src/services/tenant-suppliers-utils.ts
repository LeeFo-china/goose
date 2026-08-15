import type { TenantSupplierMutationResult } from "@/repositories/tenant-suppliers";

export function mutationErrorCode(
  status: TenantSupplierMutationResult["status"],
) {
  return {
    supplier_not_found: "SUPPLIER_NOT_FOUND",
    tenant_supplier_not_found: "TENANT_SUPPLIER_NOT_FOUND",
    state_conflict: "TENANT_SUPPLIER_STATE_CONFLICT",
    version_conflict: "SUPPLIER_VERSION_CONFLICT",
    idempotency_conflict: "SUPPLIER_IDEMPOTENCY_CONFLICT",
    created: "TENANT_SUPPLIER_STATE_CONFLICT",
    updated: "TENANT_SUPPLIER_STATE_CONFLICT",
  }[status];
}

export function omitTenantId<T extends object>(input: T): Omit<T, "tenant_id"> {
  const { tenant_id: _tenantId, ...rest } = input as T & { tenant_id?: unknown };
  return rest;
}

export function containsDatabaseCode(error: unknown, code: string): boolean {
  if (typeof error === "string") return error.includes(code);
  if (Array.isArray(error)) {
    return error.some((item) => containsDatabaseCode(item, code));
  }
  if (typeof error !== "object" || error === null) return false;
  return Object.values(error).some((value) =>
    containsDatabaseCode(value, code)
  );
}
