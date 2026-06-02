import { Errors } from "./shared";
import type { ProjectCameraBindingRow, ProjectCameraRow, ProjectCameraVendor } from "./shared";

export async function listByProjectId(this: any, projectId: string, tenantId?: string | null) {
  let query = this.adminClient
    .from("project_cameras")
    .select("*")
    .eq("project_id", projectId)
    .is("deleted_at", null);

  if (tenantId) {
    query = query.eq("tenant_id", tenantId);
  }

  const { data, error } = await query
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    throw Errors.dbError("查询项目摄像头失败", error);
  }

  return (data || []) as ProjectCameraRow[];
}

export async function findByProjectCamera(this: any, projectId: string, cameraId: string, tenantId?: string | null) {
  let query = this.adminClient
    .from("project_cameras")
    .select("*")
    .eq("project_id", projectId)
    .eq("id", cameraId)
    .is("deleted_at", null);

  if (tenantId) {
    query = query.eq("tenant_id", tenantId);
  }

  const { data, error } = await query
    .maybeSingle();

  if (error) {
    throw Errors.dbError("查询项目摄像头失败", error);
  }

  return (data || null) as ProjectCameraRow | null;
}

export async function findActiveByDeviceChannel(this: any, input: {
  vendor: ProjectCameraVendor;
  vendor_device_serial: string;
  vendor_channel_id?: string | null;
  channel_no: number;
}) {
  let query = this.adminClient
    .from("project_cameras")
    .select("*")
    .eq("vendor", input.vendor)
    .eq("vendor_device_serial", input.vendor_device_serial)
    .is("deleted_at", null);

  if (input.vendor === "tencent_iotvideo_industry") {
    query = query.eq("vendor_channel_id", input.vendor_channel_id || "");
  } else {
    query = query.eq("channel_no", input.channel_no);
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    throw Errors.dbError("查询摄像头绑定状态失败", error);
  }

  return (data || null) as ProjectCameraRow | null;
}

export async function listActiveBindingsByVendor(this: any, vendor: ProjectCameraVendor) {
  const { data, error } = await this.adminClient
    .from("project_cameras")
    .select(`
      id,
      tenant_id,
      project_id,
      vendor,
      vendor_device_serial,
      vendor_channel_id,
      vendor_device_code,
      vendor_channel_code,
      channel_no,
      name,
      project:projects(id, name)
    `)
    .eq("vendor", vendor)
    .is("deleted_at", null);

  if (error) {
    throw Errors.dbError("查询摄像头绑定状态失败", error);
  }

  return (data || []) as ProjectCameraBindingRow[];
}

export async function listActiveBindingsByVendorDeviceSerial(this: any, 
  vendor: ProjectCameraVendor,
  vendorDeviceSerial: string,
) {
  const { data, error } = await this.adminClient
    .from("project_cameras")
    .select(`
      id,
      tenant_id,
      project_id,
      vendor,
      vendor_device_serial,
      vendor_channel_id,
      vendor_device_code,
      vendor_channel_code,
      channel_no,
      name,
      project:projects(id, name)
    `)
    .eq("vendor", vendor)
    .eq("vendor_device_serial", vendorDeviceSerial)
    .is("deleted_at", null);

  if (error) {
    throw Errors.dbError("查询摄像头绑定状态失败", error);
  }

  return (data || []) as ProjectCameraBindingRow[];
}
