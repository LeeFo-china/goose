import { redirect } from "next/navigation";

import { WarehouseWorkspace } from "@/components/warehouses/warehouse-workspace";
import { getAdminSession } from "@/lib/auth";

export default async function WarehousesPage() {
  const session = await getAdminSession();
  if (!session) redirect("/login");

  const permissions = new Set(session.permissions.map(({ code }) => code));
  return (
    <WarehouseWorkspace
      canView={permissions.has("inventory.warehouse.view")}
      canManage={permissions.has("inventory.warehouse.manage")}
    />
  );
}
