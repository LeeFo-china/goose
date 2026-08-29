export type SupplierSkuCodeScope = "tenant" | "platform";

const SKU_CODE_PREFIX: Record<SupplierSkuCodeScope, string> = {
  tenant: "TS",
  platform: "PS",
};

export function generateSupplierSkuCode(
  scope: SupplierSkuCodeScope,
  skuId: string,
): string {
  const token = skuId.replaceAll("-", "").toUpperCase();
  return `${SKU_CODE_PREFIX[scope]}-${token}`;
}
