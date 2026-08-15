import { redirect } from "next/navigation";

import { PlatformSupplierProducts } from "@/components/platform-supplier-products/platform-supplier-products";
import { getAdminSession } from "@/lib/auth";

export default async function PlatformSupplierProductsPage() {
  const session = await getAdminSession();
  if (!session) redirect("/login");

  const permissions = new Set(session.permissions.map(({ code }) => code));
  if (!permissions.has("platform.supplier-product.manage")) {
    return <div className="p-6">当前账号缺少平台共享商品管理权限</div>;
  }

  return <PlatformSupplierProducts />;
}
