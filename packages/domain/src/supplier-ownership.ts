export const SUPPLIER_OWNERSHIP_SCOPE_VALUES = [
  "platform",
  "tenant",
] as const;

export type SupplierOwnershipRef =
  | { ownershipScope: "platform"; ownerTenantId: null }
  | { ownershipScope: "tenant"; ownerTenantId: string };
