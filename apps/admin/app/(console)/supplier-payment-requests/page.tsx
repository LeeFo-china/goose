import { redirect } from "next/navigation";

import { PaymentRequestWorkspace } from "@/components/supplier-payment-requests/payment-request-workspace";
import { getAdminSession } from "@/lib/auth";

export default async function SupplierPaymentRequestsPage() {
  const session = await getAdminSession();
  if (!session) redirect("/login");

  const permissions = new Set(session.permissions.map(({ code }) => code));
  return (
    <PaymentRequestWorkspace
      canView={permissions.has("supplier.payment-request.view")}
      canManage={permissions.has("supplier.payment-request.manage")}
      canApprove={permissions.has("supplier.payment-request.approve")}
      canPay={permissions.has("supplier.payment-request.pay")}
      canViewPayables={permissions.has("supplier.payable.view")}
    />
  );
}
