import { redirect } from "next/navigation";

import { PurchaseOrderWorkspace } from "@/components/supplier-purchase-orders/purchase-order-workspace";
import { getAdminSession } from "@/lib/auth";

export default async function SupplierPurchaseOrdersPage() {
  const session = await getAdminSession();
  if (!session) redirect("/login");

  const permissions = new Set(session.permissions.map(({ code }) => code));
  const canViewPurchaseOrders = permissions.has("supplier.purchase-order.view");
  const canManagePurchaseOrders = permissions.has("supplier.purchase-order.manage");
  const canManagePurchaseRequisitions = permissions.has(
    "supplier.purchase-requisition.manage",
  );
  return (
    <PurchaseOrderWorkspace
      canViewPurchaseOrders={canViewPurchaseOrders}
      canManagePurchaseOrders={canManagePurchaseOrders}
      canManagePurchaseRequisitions={canManagePurchaseRequisitions}
    />
  );
}
