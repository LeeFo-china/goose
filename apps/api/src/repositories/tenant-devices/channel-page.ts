import { Errors } from "@/errors/error-factory";
import { SupabaseDB } from "@/utils/supabase";
import type { SyncedDeviceChannel } from "@/gateways/tencent-iot-video/channel-page";
import type { TenantDeviceRow } from "./legacy/shared";

const CHANNEL_FIELDS = "id,hardware_serial,vendor,vendor_device_serial,vendor_device_code,vendor_device_name,vendor_channel_id,vendor_channel_code,vendor_channel_name,device_type,bound_project_id,bound_camera_id,status,last_synced_at";

export const tenantDeviceChannelRepository = {
  async list(device: TenantDeviceRow, page: { page: number; pageSize: number }, signal: AbortSignal) {
    const offset = (page.page - 1) * page.pageSize;
    const { data, error, count } = await SupabaseDB.getAdminClient().from("tenant_devices")
      .select(CHANNEL_FIELDS, { count: "exact" }).eq("tenant_id", device.tenant_id)
      .eq("vendor", device.vendor).eq("vendor_device_serial", device.vendor_device_serial)
      .not("vendor_channel_id", "is", null).is("deleted_at", null)
      .order("vendor_channel_id").order("id").range(offset, offset + page.pageSize - 1)
      .abortSignal(signal);
    if (error) throw Errors.dbError("查询设备通道失败", error);
    return { list: data || [], pagination: { ...page, total: count || 0,
      totalPages: Math.ceil((count || 0) / page.pageSize) } };
  },
  async sync(input: { tenantId: string; assetId: string; employeeId: string;
    channels: SyncedDeviceChannel[]; checkedAt: string; signal: AbortSignal }) {
    const { data, error } = await SupabaseDB.getAdminClient().rpc("sync_tenant_device_channel_page", {
      p_tenant_id: input.tenantId, p_asset_id: input.assetId, p_employee_id: input.employeeId,
      p_channels: input.channels, p_checked_at: input.checkedAt,
    }).abortSignal(input.signal);
    if (error) {
      if (error.code === "P0002") throw Errors.business(404, "设备资产不存在", "CAMERA_NOT_FOUND");
      if (error.code === "23505" || error.code === "42501") {
        throw Errors.business(409, "设备通道归属冲突，请刷新后重试", "CAMERA_BOUND_TO_ANOTHER_PROJECT");
      }
      throw Errors.dbError("同步设备通道失败，请刷新后核对结果", error);
    }
    return data as { synced_count: number };
  },
};
