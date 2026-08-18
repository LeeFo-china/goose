export function canManagePlatformSupplierProducts(
  roles: string[],
  permissions: string[],
) {
  if (roles.includes("platform_admin")) return true;
  return roles.includes("platform_staff") &&
    permissions.includes("platform.supplier-product.manage");
}

export function platformSupplierProductScope(supplierId: string) {
  return { kind: "platform" as const, supplierId };
}
