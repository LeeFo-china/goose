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

export type PlatformDevicesTabValue = "ownership" | "tencent";

export type PlatformTencentDeviceTenant = {
  id: string;
  name: string | null;
  slug: string | null;
};

export type PlatformTencentDeviceChannel = {
  channel_id: string;
  channel_code: string | null;
  channel_name: string;
  channel_type: number | null;
  status: "online" | "offline" | "unknown" | string;
  raw_status: string | number | null;
  tenant_device_id: string | null;
  tenant_id: string | null;
  tenant_name: string | null;
  tenant_slug: string | null;
  bound_project_id: string | null;
  bound_project_name: string | null;
  bound_camera_id: string | null;
  bound_camera_name: string | null;
};

export type PlatformTencentDeviceRecord = {
  device_id: string;
  device_code: string | null;
  device_name: string | null;
  device_type: number | null;
  device_type_label: string | null;
  status: "online" | "offline" | "unknown" | string;
  raw_status: string | number | null;
  protocol: string | null;
  group_id: string | null;
  group_name: string | null;
  channel_count: number;
  claimed_channel_count: number;
  unclaimed_channel_count: number;
  bound_channel_count: number;
  can_delete: boolean;
  tenants: PlatformTencentDeviceTenant[];
  channels: PlatformTencentDeviceChannel[];
};

export type PlatformTencentDeviceListData = {
  list: PlatformTencentDeviceRecord[];
  pagination: Pagination;
};

export type PlatformTencentDeviceAccessInfo = {
  device: {
    tenant_device_id: string;
    device_id: string;
    device_code: string | null;
    device_name: string | null;
    channel_id: string | null;
    channel_code: string | null;
    channel_name: string | null;
    device_type_label: string | null;
    sip_username: string | null;
    sip_transport_protocol: "TCP";
    source_project_id: string | null;
    bound_project_id: string | null;
  };
  sip_server: {
    sip_server_id: string | null;
    sip_domain: string | null;
    sip_host: string | null;
    sip_port: number | null;
    transport_protocol: "TCP";
    request_id: string | null;
  } | null;
};

export type PlatformTencentDevicePasswordResult = {
  tenant_device_id: string;
  device_id: string;
  device_code: string | null;
  device_name: string | null;
  sip_username: string | null;
  sip_transport_protocol: "TCP";
  sip_password: string | null;
  request_id: string | null;
  status?: string | null;
};

export type PlatformDeviceSyncResult = {
  created_count: number;
  updated_count: number;
  total_count: number;
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
