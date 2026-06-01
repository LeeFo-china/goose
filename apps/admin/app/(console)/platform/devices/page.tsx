import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth";
import {
  getPlatformDevices,
  getPlatformTencentDevices,
  readBoolean,
  readPositiveInteger,
  readStatus,
  readTab,
  readVendor,
  type SearchParams,
} from "./page-data";
import { PlatformDevicesContent } from "./page-sections";

export default async function PlatformDevicesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await getAdminSession();
  if (!session) {
    redirect("/login");
  }

  const hasPlatformAccess = session.roles.includes("platform_admin");
  const params = await searchParams;
  const activeTab = readTab(params.tab);
  const page = readPositiveInteger(params.page, 1);
  const vendor = readVendor(params.vendor);
  const status = readStatus(params.status);
  const onlyUnbound = readBoolean(params.only_unbound);
  const keyword = (params.keyword || "").trim().slice(0, 100);

  const ownershipData = activeTab === "ownership" && hasPlatformAccess
    ? await getPlatformDevices({ page, vendor, status, onlyUnbound, keyword })
    : {
      list: [],
      pagination: { page, pageSize: 20, total: 0, totalPages: 0 },
      error: hasPlatformAccess ? null : "当前账号不是平台超管，无法访问设备资产",
    };
  const tencentData = activeTab === "tencent" && hasPlatformAccess
    ? await getPlatformTencentDevices({ page, status, keyword })
    : {
      list: [],
      pagination: { page, pageSize: 20, total: 0, totalPages: 0 },
      error: hasPlatformAccess ? null : "当前账号不是平台超管，无法访问腾讯云设备",
    };

  return (
    <PlatformDevicesContent
      activeTab={activeTab}
      ownershipData={ownershipData}
      tencentData={tencentData}
      vendor={vendor}
      status={status}
      onlyUnbound={onlyUnbound}
      keyword={keyword}
    />
  );
}
