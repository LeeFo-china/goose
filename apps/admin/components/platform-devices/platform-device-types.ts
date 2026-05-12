export type Pagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type PlatformDeviceTenant = {
  id: string;
  name: string | null;
  slug: string | null;
  status: string | null;
};

export type PlatformDeviceProject = {
  id: string;
  name: string | null;
};

export type PlatformDeviceCamera = {
  id: string;
  name: string | null;
};

export type PlatformDeviceRecord = {
  id: string;
  tenant_id: string;
  vendor: "ezviz" | "tencent_iotvideo_industry" | string;
  vendor_device_serial: string;
  vendor_device_code: string | null;
  vendor_device_name: string | null;
  vendor_channel_id: string | null;
  vendor_channel_code: string | null;
  vendor_channel_name: string | null;
  device_type: string | null;
  source_project_id: string | null;
  bound_project_id: string | null;
  bound_camera_id: string | null;
  status: "online" | "offline" | "unknown" | string;
  raw_status: string | null;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
  tenant: PlatformDeviceTenant | null;
  source_project: PlatformDeviceProject | null;
  bound_project: PlatformDeviceProject | null;
  bound_camera: PlatformDeviceCamera | null;
};

export type PlatformDeviceListData = {
  list: PlatformDeviceRecord[];
  pagination: Pagination;
};

export const platformDeviceVendorOptions = [
  { value: "ezviz", label: "萤石" },
  { value: "tencent_iotvideo_industry", label: "腾讯云" },
] as const;

export const platformDeviceStatusOptions = [
  { value: "online", label: "在线", variant: "success" as const },
  { value: "offline", label: "离线", variant: "danger" as const },
  { value: "unknown", label: "未知", variant: "secondary" as const },
] as const;

export function getPlatformDeviceVendorLabel(vendor: string) {
  return platformDeviceVendorOptions.find((item) => item.value === vendor)?.label || vendor || "未知厂商";
}

export function getPlatformDeviceStatusMeta(status: string) {
  return platformDeviceStatusOptions.find((item) => item.value === status) || {
    value: status,
    label: status || "未知",
    variant: "outline" as const,
  };
}
