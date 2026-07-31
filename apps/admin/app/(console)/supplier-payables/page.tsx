import { redirect } from "next/navigation";

import { PayableWorkspace } from "@/components/supplier-payables/payable-workspace";
import { getAdminSession } from "@/lib/auth";

export default async function SupplierPayablesPage() {
  const session = await getAdminSession();
  if (!session) redirect("/login");

  const permissions = new Set(session.permissions.map(({ code }) => code));
  return (
    <PayableWorkspace
      canView={permissions.has("supplier.payable.view")}
      canCreate={permissions.has("supplier.payment-request.manage")}
      canReadSettings={permissions.has("supplier.view")}
    />
  );
}
