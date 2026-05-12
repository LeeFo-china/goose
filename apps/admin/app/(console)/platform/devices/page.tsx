import { redirect } from "next/navigation";
import {
  PlatformDeviceFilters,
  PlatformDevicePagination,
} from "@/components/platform-devices/platform-device-list-actions";
import { PlatformDevicesTable } from "@/components/platform-devices/platform-devices-table";
import {
  getPlatformDeviceStatusMeta,
  getPlatformDeviceVendorLabel,
  platformDeviceStatusOptions,
  platformDeviceVendorOptions,
  type PlatformDeviceListData,
  type PlatformDeviceRecord,
} from "@/components/platform-devices/platform-device-types";
import { StatusAlert } from "@/components/admin/status-alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getAdminSession, getAdminToken } from "@/lib/auth";
import { buildBackendUrl, parseBackendJson } from "@/lib/backend";

const DEVICE_VENDORS = platformDeviceVendorOptions.map((item) => item.value);
const DEVICE_STATUSES = platformDeviceStatusOptions.map((item) => item.value);

type SearchParams = Promise<{
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

function buildDeviceQuery(params: {
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
    const response = await fetch(buildBackendUrl(`/platform/tenant-devices?${buildDeviceQuery(input)}`), {
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

function summarizeCurrentPage(list: PlatformDeviceRecord[]) {
  return {
    online: list.filter((item) => item.status === "online").length,
    offline: list.filter((item) => item.status === "offline").length,
    unbound: list.filter((item) => !item.bound_camera_id && !item.bound_project_id).length,
    bound: list.filter((item) => item.bound_camera_id || item.bound_project_id).length,
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
  const page = readPositiveInteger(params.page, 1);
  const vendor = readVendor(params.vendor);
  const status = readStatus(params.status);
  const onlyUnbound = readBoolean(params.only_unbound);
  const keyword = (params.keyword || "").trim().slice(0, 100);
  const { list, pagination, error } = hasPlatformAccess
    ? await getPlatformDevices({ page, vendor, status, onlyUnbound, keyword })
    : {
      list: [],
      pagination: { page, pageSize: 20, total: 0, totalPages: 0 },
      error: "当前账号不是平台超管，无法访问设备资产",
    };
  const summary = summarizeCurrentPage(list);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-normal">设备资产</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          查看第三方设备通道的租户归属、绑定状态和最近同步结果。
        </p>
      </div>

      {error ? <StatusAlert>{error}</StatusAlert> : null}

      <div className="grid gap-3 md:grid-cols-5">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>设备总数</CardDescription>
            <CardTitle>{pagination.total}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>本页在线</CardDescription>
            <CardTitle>{summary.online}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>本页离线</CardDescription>
            <CardTitle>{summary.offline}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>本页已绑定</CardDescription>
            <CardTitle>{summary.bound}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>本页未绑定</CardDescription>
            <CardTitle>{summary.unbound}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3">
          <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
            <div>
              <CardTitle>设备归属列表</CardTitle>
              <CardDescription className="flex flex-wrap items-center gap-2">
                {vendor ? <Badge variant="outline">{getPlatformDeviceVendorLabel(vendor)}</Badge> : <Badge variant="outline">全部厂商</Badge>}
                {status ? <Badge variant={getPlatformDeviceStatusMeta(status).variant}>{getPlatformDeviceStatusMeta(status).label}</Badge> : <Badge variant="outline">全部状态</Badge>}
                {onlyUnbound ? <Badge variant="secondary">仅未绑定</Badge> : <Badge variant="outline">全部绑定</Badge>}
              </CardDescription>
            </div>
            <Badge variant="outline">共 {pagination.total} 个</Badge>
          </div>
          <PlatformDeviceFilters
            vendor={vendor}
            status={status}
            onlyUnbound={onlyUnbound}
            keyword={keyword}
          />
        </CardHeader>
        <CardContent className="flex flex-col gap-4 p-0">
          <PlatformDevicesTable devices={list} />
          <div className="px-4 pb-4">
            <PlatformDevicePagination
              pagination={pagination}
              vendor={vendor}
              status={status}
              onlyUnbound={onlyUnbound}
              keyword={keyword}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
