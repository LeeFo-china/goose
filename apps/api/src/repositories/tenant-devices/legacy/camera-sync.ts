import { findByVendorDeviceChannel } from "./queries";
import {
  Errors,
  type ProjectCameraRow,
  type TenantDeviceRepositoryContext,
  type TenantDeviceRow,
  type TenantDeviceStatus,
} from "./shared";

export async function upsertFromProjectCamera(
  this: TenantDeviceRepositoryContext,
  camera: ProjectCameraRow,
  actorEmployeeId?: string | null,
) {
  const existing = await findByVendorDeviceChannel.call(this, {
    vendor: camera.vendor,
    vendor_device_serial: camera.vendor_device_serial,
    vendor_channel_id: camera.vendor_channel_id,
  });

  const payload = {
    tenant_id: camera.tenant_id,
    vendor: camera.vendor,
    vendor_device_serial: camera.vendor_device_serial,
    vendor_device_code: camera.vendor_device_code,
    vendor_channel_id: camera.vendor_channel_id,
    vendor_channel_code: camera.vendor_channel_code,
    vendor_channel_name: camera.name,
    source_project_id: camera.project_id,
    bound_project_id: camera.project_id,
    bound_camera_id: camera.id,
    status: camera.status,
    metadata: {
      position: camera.position,
      channel_no: camera.channel_no,
      play_protocol: camera.play_protocol,
    },
    updated_by: actorEmployeeId || null,
    last_synced_at: camera.last_status_checked_at,
  };

  if (existing) {
    const { data, error } = await this.adminClient
      .from("tenant_devices")
      .update({
        ...payload,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id)
      .select("*")
      .single();

    if (error) {
      throw Errors.dbError("更新设备资产绑定失败", error);
    }

    return data as TenantDeviceRow;
  }

  const { data, error } = await this.adminClient
    .from("tenant_devices")
    .insert({
      ...payload,
      created_by: actorEmployeeId || null,
    })
    .select("*")
    .single();

  if (error) {
    throw Errors.dbError("创建设备资产绑定失败", error);
  }

  return data as TenantDeviceRow;
}

export async function markUnboundByCameraId(
  this: TenantDeviceRepositoryContext,
  cameraId: string,
  actorEmployeeId?: string | null,
) {
  const { error } = await this.adminClient
    .from("tenant_devices")
    .update({
      bound_project_id: null,
      bound_camera_id: null,
      updated_by: actorEmployeeId || null,
      updated_at: new Date().toISOString(),
    })
    .eq("bound_camera_id", cameraId)
    .is("deleted_at", null)
    .select("id");

  if (error) {
    throw Errors.dbError("更新设备资产解绑状态失败", error);
  }
}

export async function updateStatusByCameraId(
  this: TenantDeviceRepositoryContext,
  input: {
    cameraId: string;
    status: TenantDeviceStatus;
    rawStatus?: string | null;
  },
) {
  const { error } = await this.adminClient
    .from("tenant_devices")
    .update({
      status: input.status,
      raw_status: input.rawStatus || null,
      last_synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("bound_camera_id", input.cameraId)
    .is("deleted_at", null)
    .select("id");

  if (error) {
    throw Errors.dbError("更新设备资产状态失败", error);
  }
}
