import { findByVendorDeviceChannel } from "./queries";
import {
  ErrorCodes,
  Errors,
  type CreateTenantDeviceInput,
  type ProjectCameraVendor,
  type TenantDeviceRepositoryContext,
  type TenantDeviceRow,
  type TenantDeviceStatus,
  type UpdateTenantDeviceInput,
} from "./shared";

export async function create(
  this: TenantDeviceRepositoryContext,
  input: CreateTenantDeviceInput & {
    tenant_id: string;
    created_by?: string | null;
  },
) {
  const { data, error } = await this.adminClient
    .from("tenant_devices")
    .insert({
      tenant_id: input.tenant_id,
      vendor: input.vendor,
      vendor_device_serial: input.vendor_device_serial,
      vendor_device_code: input.vendor_device_code || null,
      vendor_device_name: input.vendor_device_name || null,
      vendor_channel_id: input.vendor_channel_id || null,
      vendor_channel_code: input.vendor_channel_code || null,
      vendor_channel_name: input.vendor_channel_name || null,
      device_type: input.device_type || null,
      source_project_id: input.source_project_id,
      status: input.status,
      metadata: input.metadata || {},
      created_by: input.created_by || null,
      updated_by: input.created_by || null,
    })
    .select("*")
    .single();

  if (error) {
    throw Errors.dbError("创建设备资产失败", error);
  }

  return data as TenantDeviceRow;
}

export async function upsertSynced(
  this: TenantDeviceRepositoryContext,
  input: {
    tenant_id: string;
    vendor: ProjectCameraVendor;
    vendor_device_serial: string;
    vendor_device_code?: string | null;
    vendor_device_name?: string | null;
    vendor_channel_id?: string | null;
    vendor_channel_code?: string | null;
    vendor_channel_name?: string | null;
    device_type?: string | null;
    source_project_id?: string | null;
    status: TenantDeviceStatus;
    raw_status?: string | number | null;
    metadata?: Record<string, unknown>;
    updated_by?: string | null;
  },
) {
  const existing = await findByVendorDeviceChannel.call(this, {
    vendor: input.vendor,
    vendor_device_serial: input.vendor_device_serial,
    vendor_channel_id: input.vendor_channel_id,
  });
  const payload = {
    tenant_id: input.tenant_id,
    vendor: input.vendor,
    vendor_device_serial: input.vendor_device_serial,
    vendor_device_code: input.vendor_device_code || null,
    vendor_device_name: input.vendor_device_name || null,
    vendor_channel_id: input.vendor_channel_id || null,
    vendor_channel_code: input.vendor_channel_code || null,
    vendor_channel_name: input.vendor_channel_name || null,
    device_type: input.device_type || null,
    source_project_id: input.source_project_id || null,
    status: input.status,
    raw_status: input.raw_status == null ? null : String(input.raw_status),
    metadata: input.metadata || {},
    updated_by: input.updated_by || null,
    last_synced_at: new Date().toISOString(),
  };

  if (existing) {
    if (existing.tenant_id !== input.tenant_id) {
      throw Errors.business(
        409,
        "该设备已归属其他租户",
        ErrorCodes.CAMERA_BOUND_TO_ANOTHER_PROJECT,
      );
    }

    const { data, error } = await this.adminClient
      .from("tenant_devices")
      .update({
        ...payload,
        bound_project_id: existing.bound_project_id,
        bound_camera_id: existing.bound_camera_id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id)
      .select("*")
      .single();

    if (error) {
      throw Errors.dbError("同步设备资产失败", error);
    }

    return { device: data as TenantDeviceRow, created: false };
  }

  const { data, error } = await this.adminClient
    .from("tenant_devices")
    .insert({
      ...payload,
      created_by: input.updated_by || null,
    })
    .select("*")
    .single();

  if (error) {
    throw Errors.dbError("同步设备资产失败", error);
  }

  return { device: data as TenantDeviceRow, created: true };
}

export async function update(
  this: TenantDeviceRepositoryContext,
  id: string,
  input: UpdateTenantDeviceInput & { updated_by?: string | null },
  tenantId?: string | null,
) {
  const { updated_by, ...payload } = input;
  let query = this.adminClient
    .from("tenant_devices")
    .update({
      ...payload,
      updated_by: updated_by || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .is("deleted_at", null);

  if (tenantId) {
    query = query.eq("tenant_id", tenantId);
  }

  const { data, error } = await query
    .select("*")
    .maybeSingle();

  if (error) {
    throw Errors.dbError("更新设备资产失败", error);
  }

  if (!data) {
    throw Errors.badRequest("设备资产不存在或更新失败");
  }

  return data as TenantDeviceRow;
}

export async function softDelete(
  this: TenantDeviceRepositoryContext,
  id: string,
  tenantId?: string | null,
  actorEmployeeId?: string | null,
) {
  let query = this.adminClient
    .from("tenant_devices")
    .update({
      deleted_at: new Date().toISOString(),
      updated_by: actorEmployeeId || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .is("deleted_at", null);

  if (tenantId) {
    query = query.eq("tenant_id", tenantId);
  }

  const { data, error } = await query
    .select("id")
    .maybeSingle();

  if (error) {
    throw Errors.dbError("删除设备资产失败", error);
  }

  if (!data) {
    throw Errors.badRequest("设备资产不存在或删除失败");
  }

  return data as { id: string };
}
