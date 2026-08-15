import { redirect } from "next/navigation";

import { TenantCatalogWorkspace } from "@/components/tenant-supplier-catalog/tenant-supplier-catalog";
import { getAdminSession } from "@/lib/auth";

export default async function SupplierCatalogPage() {
  const session = await getAdminSession();
  if (!session) redirect("/login");

  const permissions = new Set(session.permissions.map(({ code }) => code));
  return (
    <TenantCatalogWorkspace
      canManage={permissions.has("supplier.catalog.manage")}
    />
  );
}
