import { assertTenantDeviceAccess } from "./access";
import {
  getTencentDeviceTypeLabel,
  ezvizDeviceService,
  tenantDeviceRepository,
  tencentIotVideoService,
  type AuthContext,
  type TenantDeviceRow,
} from "./shared";

export async function syncTenantDevices(input: {
  authContext: AuthContext;
}) {
  const tenantId = assertTenantDeviceAccess(input.authContext, "project.update");
  const assets = await tenantDeviceRepository.listAllByTenant(tenantId);
  return syncAssets({
    tenantId,
    assets,
    updatedBy: input.authContext.employeeId,
  });
}

export async function syncAssets(input: {
  tenantId: string;
  assets: TenantDeviceRow[];
  updatedBy?: string | null;
}) {
  const sourceProjectByDevice = new Map<string, string | null>();
  const tencentDeviceIds = new Set<string>();
  const ezvizDeviceSerials = new Set<string>();

  for (const asset of input.assets) {
    sourceProjectByDevice.set(
      `${asset.vendor}:${asset.vendor_device_serial}`,
      asset.source_project_id,
    );
    if (asset.vendor === "tencent_iotvideo_industry") {
      tencentDeviceIds.add(asset.vendor_device_serial);
    }
    if (asset.vendor === "ezviz") {
      ezvizDeviceSerials.add(asset.vendor_device_serial);
    }
  }

  let createdCount = 0;
  let updatedCount = 0;

  if (tencentDeviceIds.size > 0) {
    const channels = await tencentIotVideoService.listDeviceChannels();
    for (const channel of channels) {
      if (!tencentDeviceIds.has(channel.device_id)) continue;

      const result = await tenantDeviceRepository.upsertSynced({
        tenant_id: input.tenantId,
        vendor: "tencent_iotvideo_industry",
        vendor_device_serial: channel.device_id,
        vendor_device_code: channel.device_code,
        vendor_device_name: channel.device_name,
        vendor_channel_id: channel.channel_id,
        vendor_channel_code: channel.channel_code,
        vendor_channel_name: channel.channel_name,
        device_type: getTencentDeviceTypeLabel(channel.device_type),
        source_project_id: sourceProjectByDevice.get(
          `tencent_iotvideo_industry:${channel.device_id}`,
        ) || null,
        status: channel.status,
        raw_status: channel.raw_status,
        metadata: {
          protocol: channel.protocol,
          group_id: channel.group_id,
          group_name: channel.group_name,
          channel_type: channel.channel_type,
        },
        updated_by: input.updatedBy,
      });
      if (result.created) createdCount += 1;
      else updatedCount += 1;
    }
  }

  if (ezvizDeviceSerials.size > 0) {
    const channels = await ezvizDeviceService.listDeviceChannels();
    for (const channel of channels) {
      if (!ezvizDeviceSerials.has(channel.device_serial)) continue;

      const result = await tenantDeviceRepository.upsertSynced({
        tenant_id: input.tenantId,
        vendor: "ezviz",
        vendor_device_serial: channel.device_serial,
        vendor_device_name: channel.device_name,
        vendor_channel_id: null,
        vendor_channel_name: channel.channel_name,
        source_project_id: sourceProjectByDevice.get(`ezviz:${channel.device_serial}`) || null,
        status: channel.status,
        raw_status: channel.raw_status,
        metadata: {
          channel_no: channel.channel_no,
          video_encrypted: channel.video_encrypted,
          cover_url: channel.cover_url,
        },
        updated_by: input.updatedBy,
      });
      if (result.created) createdCount += 1;
      else updatedCount += 1;
    }
  }

  return {
    created_count: createdCount,
    updated_count: updatedCount,
    total_count: createdCount + updatedCount,
  };
}
