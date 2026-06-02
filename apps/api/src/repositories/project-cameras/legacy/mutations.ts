import { Errors, ErrorCodes } from "./shared";
import type { CameraAccessLogAction, CreateProjectCameraInput, ProjectCameraRow, UpdateProjectCameraInput } from "./shared";

export async function create(this: any, projectId: string, input: CreateProjectCameraInput, tenantId?: string | null) {
  const project = await this.getProject(projectId, tenantId);
  if (!project) {
    throw Errors.business(404, "项目不存在", "PROJECT_NOT_FOUND");
  }

  const existing = await this.findActiveByDeviceChannel({
    vendor: input.vendor,
    vendor_device_serial: input.vendor_device_serial,
    vendor_channel_id: input.vendor_channel_id,
    channel_no: input.channel_no,
  });

  if (existing?.project_id === projectId) {
    throw Errors.business(
      409,
      "该摄像头已绑定到当前项目",
      ErrorCodes.CAMERA_ALREADY_BOUND,
    );
  }

  if (existing) {
    throw Errors.business(
      409,
      "该摄像头已绑定到其他项目，请先解绑后再绑定",
      ErrorCodes.CAMERA_BOUND_TO_ANOTHER_PROJECT,
    );
  }

  const { data, error } = await this.adminClient
    .from("project_cameras")
    .insert({
      project_id: projectId,
      tenant_id: project.tenant_id,
      ...input,
    })
    .select("*")
    .single();

  if (error) {
    throw Errors.dbError("绑定项目摄像头失败", error);
  }

  return data as ProjectCameraRow;
}

export async function update(this: any, 
  projectId: string,
  cameraId: string,
  input: UpdateProjectCameraInput,
  tenantId?: string | null,
) {
  let query = this.adminClient
    .from("project_cameras")
    .update({
      ...input,
      updated_at: new Date().toISOString(),
    })
    .eq("project_id", projectId)
    .eq("id", cameraId)
    .is("deleted_at", null);

  if (tenantId) {
    query = query.eq("tenant_id", tenantId);
  }

  const { data, error } = await query
    .select("*")
    .maybeSingle();

  if (error) {
    throw Errors.dbError("更新项目摄像头失败", error);
  }

  if (!data) {
    throw Errors.business(404, "摄像头不存在或已解绑", ErrorCodes.CAMERA_NOT_FOUND);
  }

  return data as ProjectCameraRow;
}

export async function updateStatus(this: any, input: {
  cameraId: string;
  status: ProjectCameraRow["status"];
  errorMessage?: string | null;
}) {
  const { error } = await this.adminClient
    .from("project_cameras")
    .update({
      status: input.status,
      last_status_checked_at: new Date().toISOString(),
      last_status_error: input.errorMessage || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.cameraId)
    .is("deleted_at", null)
    .select("id");

  if (error) {
    throw Errors.dbError("更新摄像头状态失败", error);
  }
}

export async function softDelete(this: any, projectId: string, cameraId: string, tenantId?: string | null) {
  const now = new Date().toISOString();
  let query = this.adminClient
    .from("project_cameras")
    .update({
      deleted_at: now,
      updated_at: now,
    })
    .eq("project_id", projectId)
    .eq("id", cameraId)
    .is("deleted_at", null);

  if (tenantId) {
    query = query.eq("tenant_id", tenantId);
  }

  const { data, error } = await query
    .select("id")
    .maybeSingle();

  if (error) {
    throw Errors.dbError("删除项目摄像头失败", error);
  }

  if (!data) {
    throw Errors.business(404, "摄像头不存在或已解绑", ErrorCodes.CAMERA_NOT_FOUND);
  }

  return data as { id: string };
}

export async function logAccess(this: any, input: {
  tenant_id?: string | null;
  project_id: string;
  camera_id?: string | null;
  user_id?: string | null;
  user_role?: string | null;
  action: CameraAccessLogAction;
  control_action?: string | null;
  result?: "success" | "failure";
  error_message?: string | null;
  ip?: string | null;
  user_agent?: string | null;
}) {
  const { error } = await this.adminClient
    .from("camera_access_logs")
    .insert({
      tenant_id: input.tenant_id || null,
      project_id: input.project_id,
      camera_id: input.camera_id || "00000000-0000-0000-0000-000000000000",
      user_id: input.user_id || null,
      user_role: input.user_role || null,
      action: input.action,
      control_action: input.control_action || null,
      result: input.result || "success",
      error_message: input.error_message || null,
      ip: input.ip || null,
      user_agent: input.user_agent || null,
    })
    .select("id");

  if (error) {
    throw Errors.dbError("记录摄像头访问日志失败", error);
  }
}
