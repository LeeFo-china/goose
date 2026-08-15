import { redirect } from "next/navigation";

import { SupplierWorkspace } from "@/components/suppliers/supplier-workspace";
import { getAdminSession } from "@/lib/auth";

export default async function SuppliersPage() {
  const session = await getAdminSession();
  if (!session) redirect("/login");

  const permissions = new Set(session.permissions.map(({ code }) => code));
  const canView = permissions.has("supplier.view");

  return (
    <SupplierWorkspace
      canView={canView}
      canManage={permissions.has("supplier.manage")}
      canManagePrivate={permissions.has("supplier.master.manage")}
      canManageContracts={permissions.has("supplier.contract.manage")}
    />
  );
}
