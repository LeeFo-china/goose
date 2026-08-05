import {
  assertPlatformDevicePermission,
  assertTenantDeviceAccess,
  PLATFORM_DEVICE_READ_PERMISSION,
} from "./access";
import {
  getTencentDeviceTypeLabel,
  tenantDeviceRepository,
  tencentIotVideoService,
  type AuthContext,
  type PlatformTencentDeviceListQueryInput,
  type PlatformTenantDeviceListQueryInput,
  type TenantDeviceListQueryInput,
} from "./shared";

export async function listTenantDevices(input: {
  authContext: AuthContext;
  query: TenantDeviceListQueryInput;
}) {
  const tenantId = assertTenantDeviceAccess(input.authContext, "project.read");

  return tenantDeviceRepository.list({
    ...input.query,
    tenantId,
  });
}

export async function listPlatformTenantDevices(
  query: PlatformTenantDeviceListQueryInput,
  authContext: AuthContext,
) {
  assertPlatformDevicePermission(authContext, PLATFORM_DEVICE_READ_PERMISSION);
  return tenantDeviceRepository.listPlatform(query);
}

export async function listPlatformTencentDevices(
  query: PlatformTencentDeviceListQueryInput,
  authContext: AuthContext,
) {
  assertPlatformDevicePermission(authContext, PLATFORM_DEVICE_READ_PERMISSION);

  const [devices, channels, assets] = await Promise.all([
    tencentIotVideoService.listDeviceSummaries(query.keyword),
    tencentIotVideoService.listDeviceChannels(query.keyword),
    tenantDeviceRepository.listActiveByVendor("tencent_iotvideo_industry"),
  ]);
  const hydratedAssets = await tenantDeviceRepository.hydratePlatformRows(assets);
  const assetMap = new Map(
    hydratedAssets.map((asset) => [
      `${asset.vendor_device_serial}:${asset.vendor_channel_id || ""}`,
      asset,
    ]),
  );
  const channelsByDevice = new Map<string, Array<{
    channel_id: string;
    channel_code: string | null;
    channel_name: string;
    channel_type: number | null;
    status: "online" | "offline" | "unknown";
    raw_status: number | string | null;
    tenant_device_id: string | null;
    tenant_id: string | null;
    tenant_name: string | null;
    tenant_slug: string | null;
    bound_project_id: string | null;
    bound_project_name: string | null;
    bound_camera_id: string | null;
    bound_camera_name: string | null;
  }>>();

  for (const channel of channels) {
    const asset = assetMap.get(`${channel.device_id}:${channel.channel_id}`);
    const rows = channelsByDevice.get(channel.device_id) || [];
    rows.push({
      channel_id: channel.channel_id,
      channel_code: channel.channel_code,
      channel_name: channel.channel_name,
      channel_type: channel.channel_type,
      status: channel.status,
      raw_status: channel.raw_status,
      tenant_device_id: asset?.id || null,
      tenant_id: asset?.tenant_id || null,
      tenant_name: asset?.tenant?.name || null,
      tenant_slug: asset?.tenant?.slug || null,
      bound_project_id: asset?.bound_project_id || null,
      bound_project_name: asset?.bound_project?.name || null,
      bound_camera_id: asset?.bound_camera_id || null,
      bound_camera_name: asset?.bound_camera?.name || null,
    });
    channelsByDevice.set(channel.device_id, rows);
  }

  const filteredDevices = query.status
    ? devices.filter((device) => device.status === query.status)
    : devices;

  const rows = filteredDevices.map((device) => {
    const deviceChannels = (channelsByDevice.get(device.device_id) || []).sort((left, right) =>
      left.channel_name.localeCompare(right.channel_name, "zh-CN"),
    );
    const tenantMap = new Map<string, { id: string; name: string | null; slug: string | null }>();

    for (const channel of deviceChannels) {
      if (!channel.tenant_id) continue;
      tenantMap.set(channel.tenant_id, {
        id: channel.tenant_id,
        name: channel.tenant_name,
        slug: channel.tenant_slug,
      });
    }

    const claimedChannelCount = deviceChannels.filter((channel) => channel.tenant_device_id).length;
    const boundChannelCount = deviceChannels.filter((channel) => channel.bound_camera_id).length;

    return {
      ...device,
      device_type_label: getTencentDeviceTypeLabel(device.device_type),
      channel_count: deviceChannels.length,
      claimed_channel_count: claimedChannelCount,
      unclaimed_channel_count: Math.max(deviceChannels.length - claimedChannelCount, 0),
      bound_channel_count: boundChannelCount,
      can_delete: claimedChannelCount === 0 && boundChannelCount === 0,
      tenants: Array.from(tenantMap.values()),
      channels: deviceChannels,
    };
  }).sort((left, right) => {
    if (left.status !== right.status) {
      if (left.status === "online") return -1;
      if (right.status === "online") return 1;
      if (left.status === "offline") return -1;
      if (right.status === "offline") return 1;
    }
    return (left.device_name || left.device_code || left.device_id).localeCompare(
      right.device_name || right.device_code || right.device_id,
      "zh-CN",
    );
  });

  const page = query.page;
  const pageSize = query.pageSize;
  const from = (page - 1) * pageSize;
  const list = rows.slice(from, from + pageSize);

  return {
    list,
    pagination: {
      page,
      pageSize,
      total: rows.length,
      totalPages: rows.length ? Math.ceil(rows.length / pageSize) : 0,
    },
  };
}
