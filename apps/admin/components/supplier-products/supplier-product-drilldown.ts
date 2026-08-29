export function buildSupplierProductDrilldownHref(
  pathname: string,
  search: string | URLSearchParams,
  productId: string | null,
  scope?: { kind: "tenant"; tenantSupplierId: string }
    | { kind: "platform"; supplierId: string },
) {
  const params = new URLSearchParams(search);

  if (scope?.kind === "tenant") {
    params.set("tenantSupplierId", scope.tenantSupplierId);
    params.delete("supplierId");
  } else if (scope?.kind === "platform") {
    params.set("supplierId", scope.supplierId);
    params.delete("tenantSupplierId");
  }

  if (productId) params.set("productId", productId);
  else params.delete("productId");

  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export function buildSupplierProductScopeHref(
  pathname: string,
  search: string | URLSearchParams,
  scope: { kind: "tenant"; tenantSupplierId: string }
    | { kind: "platform"; supplierId: string },
) {
  return buildSupplierProductDrilldownHref(pathname, search, null, scope);
}

export function buildSupplierProductClearedScopeHref(
  pathname: string,
  search: string | URLSearchParams,
  scopeKind: "tenant" | "platform",
) {
  const params = new URLSearchParams(search);
  params.delete("productId");
  params.delete(scopeKind === "tenant" ? "tenantSupplierId" : "supplierId");
  params.delete(scopeKind === "tenant" ? "supplierId" : "tenantSupplierId");
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}
