import { redirect } from "next/navigation";

import { PlatformSupplierProductWorkspace } from "@/components/platform-supplier-products/platform-supplier-product-workspace";
import { canManagePlatformSupplierProducts } from "@/components/platform-supplier-products/platform-supplier-product-rules";
import { StatusAlert } from "@/components/admin/status-alert";
import { getAdminSession } from "@/lib/auth";

export default async function PlatformSupplierProductsPage() {
  const session = await getAdminSession();
  if (!session) redirect("/login");

  const canManage = canManagePlatformSupplierProducts(
    session.roles,
    session.permissions.map(({ code }) => code),
  );
  if (!canManage) {
    return <StatusAlert>当前账号缺少平台共享商品管理权限。</StatusAlert>;
  }
  return <PlatformSupplierProductWorkspace />;
}
