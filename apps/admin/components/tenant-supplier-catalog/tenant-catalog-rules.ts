import type { CatalogOwnershipScope } from "./tenant-catalog-types";

export function getTenantCatalogCapabilities(record: {
  ownership_scope: CatalogOwnershipScope;
  mapped_platform_category_id?: string | null;
}) {
  const isTenantOwned = record.ownership_scope === "tenant";
  return {
    canEdit: isTenantOwned,
    canChangeStatus: isTenantOwned,
    canCopySpecs: isTenantOwned && Boolean(record.mapped_platform_category_id),
  };
}

export function newTenantCatalogCommandKey(resource: string) {
  return `tenant-${resource}:${crypto.randomUUID()}`;
}
