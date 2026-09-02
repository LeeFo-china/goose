import { redirect } from "next/navigation";

import { SupplierProductWorkspace } from "@/components/supplier-products/supplier-product-workspace";
import { getAdminSession } from "@/lib/auth";

export default async function SupplierProductsPage() {
  const session = await getAdminSession();
  if (!session) redirect("/login");

  const permissions = new Set(session.permissions.map(({ code }) => code));

  return (
    <SupplierProductWorkspace
      canViewProducts={permissions.has("supplier.product.view")}
      canManageProducts={permissions.has("supplier.product.manage")}
      canManageCatalog={permissions.has("supplier.catalog.manage")}
      canViewCostPrice={permissions.has("supplier.cost-price.view")}
      canManageCostPrice={permissions.has("supplier.cost-price.manage")}
    />
  );
}
