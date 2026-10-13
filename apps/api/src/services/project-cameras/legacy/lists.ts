import { refreshWorkspaceCameraStatuses } from "../workspace-status";
import type { ProjectCameraWorkspaceDevicesQueryInput } from "@/schema/project-cameras";
import type { resolveActor } from "./access";
import {
  Errors,
  ErrorCodes,
  accessPolicyService,
  authorizationService,
  buildDeviceChannelKey,
  buildEzvizLiveUrl,
  buildTenantDeviceChannelKey,
  buildTencentDeviceChannelKey,
  buildUniqueDeviceNameCandidate,
  chooseTencentPlayUrl,
  createTenantDeviceAssetMap,
  ezvizDeviceService,
  ezvizTokenService,
  generateDeviceNameFallback,
  generateSipPassword,
  getBindingProject,
  getEzplayerPluginVersion,
  getIp,
  getTencentDeviceTypeLabel,
  getUserAgent,
  normalizeCameraStatus,
  normalizeDeviceName,
  projectCameraRepository,
  projectRepository,
  projectStatusService,
  serializeAssetState,
  serializeCamera,
  serializeCameraForPlayer,
  tenantDeviceRepository,
  tencentDeviceNameExists,
  tencentIotVideoService,
  withCameraStatus,
  type CameraAccessLogAction,
  type CameraActor,
  type CreateProjectCameraInput,
  type CreateProjectCameraTencentDeviceInput,
  type ProjectCameraBindOptionsQueryInput,
  type ProjectCameraProjectGroupRow,
  type ProjectCameraProjectGroupsQueryInput,
  type ProjectCameraRow,
  type RequestLogMeta,
  type TenantServiceAccessInput,
  type UpdateProjectCameraInput,
  type UpdateProjectCameraTencentDevicePasswordInput,
} from "./shared";

export async function listProjectCameras(this: any, input: TenantServiceAccessInput & {
  authUserId?: string | null;
  projectId: string;
  meta?: RequestLogMeta;
}) {
  const actor = await this.resolveActor({
    authUserId: input.authUserId,
    projectId: input.projectId,
    permissionCode: "project.read",
    allowCustomer: true,
    tenantServiceAccess: input.tenantServiceAccess,
    requiredCapability: input.requiredCapability,
  });
  const cameras: ProjectCameraRow[] = await this.enrichTencentCameraStatuses(
    await projectCameraRepository.listByProjectId(input.projectId, actor.tenantId),
  );
  await this.logAccess({
    actor,
    projectId: input.projectId,
    action: "list",
    meta: input.meta,
  });

  return {
    list: cameras
      .filter((camera) => actor.userRole === "employee" || camera.can_view)
      .map(serializeCamera),
  };
}

export async function listCameraBindProjectOptions(this: any, input: TenantServiceAccessInput & {
  authUserId?: string | null;
  query: ProjectCameraBindOptionsQueryInput;
}) {
  if (!input.authUserId) {
    throw Errors.unauthorized("缺少登录凭证");
  }

  const authContext = await authorizationService.getRequiredAuthContext(
    input.authUserId,
    {
      tenantServiceAccess: input.tenantServiceAccess,
      requiredCapability: input.requiredCapability,
    },
  );
  if (!authContext.employeeId) {
    throw Errors.business(
      403,
      "无权绑定项目摄像头",
      ErrorCodes.CAMERA_ACCESS_DENIED,
    );
  }

  const tenantId = accessPolicyService.assertTenantContext(authContext);
  const visibleProjectIds = await accessPolicyService.getVisibleProjectIds(
    authContext,
    "project.update",
  );

  return projectCameraRepository.listCameraBindProjectOptions({
    ...input.query,
    tenantId,
    visibleProjectIds,
  });
}

export async function listCameraProjectGroups(this: any, input: TenantServiceAccessInput & {
  authUserId?: string | null;
  query: ProjectCameraProjectGroupsQueryInput;
}) {
  if (!input.authUserId) {
    throw Errors.unauthorized("缺少登录凭证");
  }

  const authContext = await authorizationService.getRequiredAuthContext(
    input.authUserId,
    {
      tenantServiceAccess: input.tenantServiceAccess,
      requiredCapability: input.requiredCapability,
    },
  );
  if (!authContext.employeeId) {
    throw Errors.business(
      403,
      "无权查看项目摄像头",
      ErrorCodes.CAMERA_ACCESS_DENIED,
    );
  }

  const tenantId = accessPolicyService.assertTenantContext(authContext);
  const visibleProjectIds = await accessPolicyService.getVisibleProjectIds(
    authContext,
    "project.read",
  );
  // RPC summaries cover every filtered project and persisted camera status.
  // Empty previews must never be used to reconstruct these totals.
  return projectCameraRepository.listCameraProjectGroups({
    ...input.query,
    tenantId,
    visibleProjectIds,
  });
}

/** Admin expansion only; the mini-program list keeps its existing contract. */
export async function listCameraWorkspaceDevices(
  this: { resolveActor: typeof resolveActor },
  input: TenantServiceAccessInput & {
    authUserId?: string | null;
    projectId: string;
    query: ProjectCameraWorkspaceDevicesQueryInput;
  },
) {
  const actor = await this.resolveActor({
    authUserId: input.authUserId,
    projectId: input.projectId,
    permissionCode: "project.read",
    allowCustomer: false,
    tenantServiceAccess: input.tenantServiceAccess,
    requiredCapability: input.requiredCapability,
  });
  if (!actor.tenantId) throw Errors.forbidden();
  const result = await projectCameraRepository.listCameraWorkspaceDevices({
    ...input.query, projectId: input.projectId, tenantId: actor.tenantId,
  });
  const refreshed = await refreshWorkspaceCameraStatuses(result.list, {
    tenantId: actor.tenantId, projectId: input.projectId,
  });
  return { ...result, ...refreshed };
}
