import { redirect } from "next/navigation";

import { RequisitionWorkspace } from "@/components/supplier-purchase-requisitions/requisition-workspace";
import { getAdminSession } from "@/lib/auth";

export default async function SupplierPurchaseRequisitionsPage() {
  const session = await getAdminSession();
  if (!session) redirect("/login");

  const permissions = new Set(session.permissions.map(({ code }) => code));
  return (
    <RequisitionWorkspace
      canView={permissions.has("supplier.purchase-requisition.view")}
      canManage={permissions.has("supplier.purchase-requisition.manage")}
      canApprove={permissions.has("supplier.purchase-requisition.approve")}
      canManageBudget={permissions.has("finance.budget.manage")}
      canViewPurchaseOrders={permissions.has("supplier.purchase-order.view")}
      currentEmployeeId={session.employee?.id ?? null}
    />
  );
}
