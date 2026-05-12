import { redirect } from "next/navigation";
import { buildPlatformDevicesHref } from "@/components/platform-devices/platform-device-href";
import { PlatformDeviceTabsNav } from "@/components/platform-devices/platform-device-tabs-nav";
import {
  PlatformDeviceFilters,
  PlatformDevicePagination,
} from "@/components/platform-devices/platform-device-list-actions";
import { PlatformDevicesTable } from "@/components/platform-devices/platform-devices-table";
import {
  PlatformTencentDeviceFilters,
  PlatformTencentDevicePagination,
} from "@/components/platform-devices/platform-tencent-device-list-actions";
import { PlatformTencentDevicesTable } from "@/components/platform-devices/platform-tencent-devices-table";
import {
  getPlatformDeviceStatusMeta,
  getPlatformDeviceVendorLabel,
  platformDeviceStatusOptions,
  platformDeviceVendorOptions,
  type PlatformDeviceListData,
  type PlatformDeviceRecord,
  type PlatformDevicesTabValue,
  type PlatformTencentDeviceListData,
  type PlatformTencentDeviceRecord,
} from "@/components/platform-devices/platform-device-types";
import { StatusAlert } from "@/components/admin/status-alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs } from "@/components/ui/tabs";
import { getAdminSession, getAdminToken } from "@/lib/auth";
import { buildBackendUrl, parseBackendJson } from "@/lib/backend";

const DEVICE_VENDORS = platformDeviceVendorOptions.map((item) => item.value);
const DEVICE_STATUSES = platformDeviceStatusOptions.map((item) => item.value);

type SearchParams = Promise<{
  tab?: string;
  page?: string;
  vendor?: string;
  status?: string;
  only_unbound?: string;
  keyword?: string;
}>;

function readPositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function readVendor(value: string | undefined) {
  return DEVICE_VENDORS.includes(value as (typeof DEVICE_VENDORS)[number]) ? value || "" : "";
}

function readStatus(value: string | undefined) {
  return DEVICE_STATUSES.includes(value as (typeof DEVICE_STATUSES)[number]) ? value || "" : "";
}

function readBoolean(value: string | undefined) {
  return value === "true" || value === "1";
}

function readTab(value: string | undefined): PlatformDevicesTabValue {
  return value === "tencent" ? "tencent" : "ownership";
}

function buildOwnershipQuery(params: {
  page: number;
  vendor: string;
  status: string;
  onlyUnbound: boolean;
  keyword: string;
}) {
  const query = new URLSearchParams();
  query.set("page", String(params.page));
  query.set("pageSize", "20");
  if (params.vendor) query.set("vendor", params.vendor);
  if (params.status) query.set("status", params.status);
  if (params.onlyUnbound) query.set("only_unbound", "true");
  if (params.keyword) query.set("keyword", params.keyword);
  return query.toString();
}

function buildTencentQuery(params: {
  page: number;
  status: string;
  keyword: string;
}) {
  const query = new URLSearchParams();
  query.set("page", String(params.page));
  query.set("pageSize", "20");
  if (params.status) query.set("status", params.status);
  if (params.keyword) query.set("keyword", params.keyword);
  return query.toString();
}

async function getPlatformDevices(input: {
  page: number;
  vendor: string;
  status: string;
  onlyUnbound: boolean;
  keyword: string;
}) {
  const token = await getAdminToken();
  if (!token) {
    return {
      list: [],
      pagination: { page: input.page, pageSize: 20, total: 0, totalPages: 0 },
      error: "缺少登录凭证",
    };
  }

  try {
    const response = await fetch(buildBackendUrl(`/platform/tenant-devices?${buildOwnershipQuery(input)}`), {
      headers: {
        authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });
    const payload = await parseBackendJson<PlatformDeviceListData>(response);
    return {
      ...(payload.data || {
        list: [],
        pagination: { page: input.page, pageSize: 20, total: 0, totalPages: 0 },
      }),
      error: null,
    };
  } catch (error) {
    return {
      list: [],
      pagination: { page: input.page, pageSize: 20, total: 0, totalPages: 0 },
      error: error instanceof Error ? error.message : "平台设备资产列表加载失败",
    };
  }
}

async function getPlatformTencentDevices(input: {
  page: number;
  status: string;
  keyword: string;
}) {
  const token = await getAdminToken();
  if (!token) {
    return {
      list: [],
      pagination: { page: input.page, pageSize: 20, total: 0, totalPages: 0 },
      error: "缺少登录凭证",
    };
  }

  try {
    const response = await fetch(buildBackendUrl(`/platform/tencent-devices?${buildTencentQuery(input)}`), {
      headers: {
        authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });
    const payload = await parseBackendJson<PlatformTencentDeviceListData>(response);
    return {
      ...(payload.data || {
        list: [],
        pagination: { page: input.page, pageSize: 20, total: 0, totalPages: 0 },
      }),
      error: null,
    };
  } catch (error) {
    return {
      list: [],
      pagination: { page: input.page, pageSize: 20, total: 0, totalPages: 0 },
      error: error instanceof Error ? error.message : "腾讯云设备列表加载失败",
    };
  }
}

function summarizeOwnershipPage(list: PlatformDeviceRecord[]) {
  return {
    online: list.filter((item) => item.status === "online").length,
    offline: list.filter((item) => item.status === "offline").length,
    unbound: list.filter((item) => !item.bound_camera_id && !item.bound_project_id).length,
    bound: list.filter((item) => item.bound_camera_id || item.bound_project_id).length,
  };
}

function summarizeTencentPage(list: PlatformTencentDeviceRecord[]) {
  return {
    online: list.filter((item) => item.status === "online").length,
    offline: list.filter((item) => item.status === "offline").length,
    claimedChannels: list.reduce((count, item) => count + item.claimed_channel_count, 0),
    unclaimedChannels: list.reduce((count, item) => count + item.unclaimed_channel_count, 0),
  };
}

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

  const error = activeTab === "ownership" ? ownershipData.error : tencentData.error;
  const ownershipSummary = summarizeOwnershipPage(ownershipData.list);
  const tencentSummary = summarizeTencentPage(tencentData.list);
  const currentTotal = activeTab === "ownership"
    ? ownershipData.pagination.total
    : tencentData.pagination.total;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-normal">设备资产</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          平台分别从资产归属和腾讯云原始设备两个视角查看设备接入状态。
        </p>
      </div>

      {error ? <StatusAlert>{error}</StatusAlert> : null}

      <Tabs value={activeTab} className="flex flex-col gap-4">
        {activeTab === "ownership" ? (
          <div className="grid gap-3 md:grid-cols-5">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>设备总数</CardDescription>
                <CardTitle>{ownershipData.pagination.total}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>本页在线</CardDescription>
                <CardTitle>{ownershipSummary.online}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>本页离线</CardDescription>
                <CardTitle>{ownershipSummary.offline}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>本页已绑定</CardDescription>
                <CardTitle>{ownershipSummary.bound}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>本页未绑定</CardDescription>
                <CardTitle>{ownershipSummary.unbound}</CardTitle>
              </CardHeader>
            </Card>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-5">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>设备总数</CardDescription>
                <CardTitle>{tencentData.pagination.total}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>本页在线</CardDescription>
                <CardTitle>{tencentSummary.online}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>本页离线</CardDescription>
                <CardTitle>{tencentSummary.offline}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>本页已纳入通道</CardDescription>
                <CardTitle>{tencentSummary.claimedChannels}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>本页未纳入通道</CardDescription>
                <CardTitle>{tencentSummary.unclaimedChannels}</CardTitle>
              </CardHeader>
            </Card>
          </div>
        )}

        <Card>
          <CardHeader className="flex flex-col gap-4">
            <PlatformDeviceTabsNav
              activeTab={activeTab}
              hrefs={{
                ownership: buildPlatformDevicesHref({
                  tab: "ownership",
                  vendor,
                  status,
                  onlyUnbound: onlyUnbound ? "true" : "__all",
                  keyword,
                }),
                tencent: buildPlatformDevicesHref({
                  tab: "tencent",
                  status,
                  keyword,
                }),
              }}
              counts={{
                ownership: activeTab === "ownership" ? ownershipData.pagination.total : undefined,
                tencent: activeTab === "tencent" ? tencentData.pagination.total : undefined,
              }}
            />
            <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
              <div>
                <CardTitle>{activeTab === "ownership" ? "设备归属列表" : "腾讯云设备列表"}</CardTitle>
                <CardDescription className="flex flex-wrap items-center gap-2">
                  {activeTab === "ownership" ? (
                    <>
                      {vendor ? <Badge variant="outline">{getPlatformDeviceVendorLabel(vendor)}</Badge> : <Badge variant="outline">全部厂商</Badge>}
                      {status ? <Badge variant={getPlatformDeviceStatusMeta(status).variant}>{getPlatformDeviceStatusMeta(status).label}</Badge> : <Badge variant="outline">全部状态</Badge>}
                      {onlyUnbound ? <Badge variant="secondary">仅未绑定</Badge> : <Badge variant="outline">全部绑定</Badge>}
                    </>
                  ) : (
                    <>
                      {status ? <Badge variant={getPlatformDeviceStatusMeta(status).variant}>{getPlatformDeviceStatusMeta(status).label}</Badge> : <Badge variant="outline">全部状态</Badge>}
                      <Badge variant="outline">包含设备基本信息与通道归属</Badge>
                    </>
                  )}
                </CardDescription>
              </div>
              <Badge variant="outline">共 {currentTotal} {activeTab === "ownership" ? "个" : "台"}</Badge>
            </div>
            {activeTab === "ownership" ? (
              <PlatformDeviceFilters
                vendor={vendor}
                status={status}
                onlyUnbound={onlyUnbound}
                keyword={keyword}
              />
            ) : (
              <PlatformTencentDeviceFilters status={status} keyword={keyword} />
            )}
          </CardHeader>
          <CardContent className="flex flex-col gap-4 p-0">
            {activeTab === "ownership" ? (
              <>
                <PlatformDevicesTable devices={ownershipData.list} />
                <div className="px-4 pb-4">
                  <PlatformDevicePagination
                    pagination={ownershipData.pagination}
                    vendor={vendor}
                    status={status}
                    onlyUnbound={onlyUnbound}
                    keyword={keyword}
                  />
                </div>
              </>
            ) : (
              <>
                <PlatformTencentDevicesTable devices={tencentData.list} />
                <div className="px-4 pb-4">
                  <PlatformTencentDevicePagination
                    pagination={tencentData.pagination}
                    status={status}
                    keyword={keyword}
                  />
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </Tabs>
    </div>
  );
}
