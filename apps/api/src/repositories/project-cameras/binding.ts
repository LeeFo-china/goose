import { Errors } from "@/errors/error-factory";
import { ErrorCodes } from "@/errors/error-codes";
import type { CreateProjectCameraInput } from "@/schema/project-cameras";

// Narrow Supabase boundary: transaction semantics are owned by the SQL migration.
type BindingClient = {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
};
type BindingScope = { tenantId: string; projectId: string; actorEmployeeId?: string | null };
type BindingResult = { id: string };
const businessErrors: Record<string, { status: number; code: string }> = {
  PCA01: { status: 404, code: "PROJECT_NOT_FOUND" },
  PCA02: { status: 404, code: ErrorCodes.CAMERA_NOT_FOUND },
  PCA03: { status: 400, code: ErrorCodes.VALIDATION_ERROR },
  PCA04: { status: 409, code: ErrorCodes.CAMERA_ALREADY_BOUND },
  PCA05: { status: 409, code: ErrorCodes.CAMERA_BOUND_TO_ANOTHER_PROJECT },
  PCA06: { status: 409, code: ErrorCodes.TENCENT_IOT_VIDEO_PLAY_URL_ERROR },
  PCA07: { status: 409, code: ErrorCodes.CAMERA_ALREADY_BOUND },
};
const channelUniqueConstraints = [
  "uniq_project_cameras_ezviz_device_channel",
  "uniq_project_cameras_tencent_device_channel",
  "tenant_devices_vendor_device_channel_unique",
];

function bindingError(error: unknown, message: string): never {
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string") {
    const detail = "message" in error && typeof error.message === "string" ? error.message : message;
    const business = businessErrors[error.code];
    if (business) throw Errors.business(business.status, detail, business.code);
    // Only the known active-channel constraints are occupancy conflicts; unrelated
    // unique/FK/trigger/database errors must retain their original diagnostics.
    if (error.code === "23505" && channelUniqueConstraints.some((name) => detail.includes(`"${name}"`))) {
      throw Errors.business(409, "该设备通道已被占用，请刷新后重试", ErrorCodes.CAMERA_ALREADY_BOUND);
    }
  }
  throw Errors.dbError(message, error);
}

async function executeBinding(client: BindingClient, name: string, args: Record<string, unknown>, message: string): Promise<BindingResult> {
  const { data, error } = await client.rpc(name, args);
  if (error) bindingError(error, message);
  if (!data || typeof data !== "object" || !("id" in data) || typeof data.id !== "string") {
    throw Errors.dbError(message, { reason: "事务返回缺少摄像头 ID" });
  }
  return { id: data.id };
}

export function bindProjectCamera(client: BindingClient, input: BindingScope & { payload: CreateProjectCameraInput }): Promise<BindingResult> {
  if (!input.tenantId) throw Errors.forbidden();
  return executeBinding(client, "bind_project_camera", {
    p_tenant_id: input.tenantId, p_project_id: input.projectId,
    p_payload: input.payload, p_actor_employee_id: input.actorEmployeeId ?? null,
  }, "绑定项目摄像头失败");
}

export function unbindProjectCamera(client: BindingClient, input: BindingScope & { cameraId: string }): Promise<BindingResult> {
  if (!input.tenantId) throw Errors.forbidden();
  return executeBinding(client, "unbind_project_camera", {
    p_tenant_id: input.tenantId, p_project_id: input.projectId,
    p_camera_id: input.cameraId, p_actor_employee_id: input.actorEmployeeId ?? null,
  }, "解绑项目摄像头失败");
}
