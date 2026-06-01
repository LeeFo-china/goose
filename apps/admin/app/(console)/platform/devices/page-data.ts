import {
  platformDeviceStatusOptions,
  platformDeviceVendorOptions,
  type PlatformDeviceListData,
  type PlatformDeviceRecord,
  type PlatformDevicesTabValue,
  type PlatformTencentDeviceListData,
  type PlatformTencentDeviceRecord,
} from "@/components/platform-devices/platform-device-types";
import { getAdminToken } from "@/lib/auth";
import { buildBackendUrl, parseBackendJson } from "@/lib/backend";

const DEVICE_VENDORS = platformDeviceVendorOptions.map((item) => item.value);
const DEVICE_STATUSES = platformDeviceStatusOptions.map((item) => item.value);

export type SearchParams = Promise<{
  tab?: string;
  page?: string;
  vendor?: string;
  status?: string;
  only_unbound?: string;
  keyword?: string;
}>;

export function readPositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function readVendor(value: string | undefined) {
  return DEVICE_VENDORS.includes(value as (typeof DEVICE_VENDORS)[number]) ? value || "" : "";
}

export function readStatus(value: string | undefined) {
  return DEVICE_STATUSES.includes(value as (typeof DEVICE_STATUSES)[number]) ? value || "" : "";
}

export function readBoolean(value: string | undefined) {
  return value === "true" || value === "1";
}

export function readTab(value: string | undefined): PlatformDevicesTabValue {
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

export async function getPlatformDevices(input: {
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

export async function getPlatformTencentDevices(input: {
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

export function summarizeOwnershipPage(list: PlatformDeviceRecord[]) {
  return {
    online: list.filter((item) => item.status === "online").length,
    offline: list.filter((item) => item.status === "offline").length,
    unbound: list.filter((item) => !item.bound_camera_id && !item.bound_project_id).length,
    bound: list.filter((item) => item.bound_camera_id || item.bound_project_id).length,
  };
}

export function summarizeTencentPage(list: PlatformTencentDeviceRecord[]) {
  return {
    online: list.filter((item) => item.status === "online").length,
    offline: list.filter((item) => item.status === "offline").length,
    claimedChannels: list.reduce((count, item) => count + item.claimed_channel_count, 0),
    unclaimedChannels: list.reduce((count, item) => count + item.unclaimed_channel_count, 0),
  };
}
