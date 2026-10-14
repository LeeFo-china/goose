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
  serializeAssetState,
  serializeCamera,
  serializeCameraForPlayer,
  tencentDeviceNameExists,
  tencentIotVideoService,
  withCameraStatus,
  type CameraAccessLogAction,
  type CameraActor,
  type CreateProjectCameraInput,
  type CreateProjectCameraTencentDeviceInput,
  type ProjectCameraBindOptionsQueryInput,
  type ProjectCameraProjectGroupsQueryInput,
  type ProjectCameraRow,
  type RequestLogMeta,
  type TenantServiceAccessInput,
  type UpdateProjectCameraInput,
  type UpdateProjectCameraTencentDevicePasswordInput,
} from "./shared";

export async function createProjectCamera(this: any, input: TenantServiceAccessInput & {
  authUserId?: string | null;
  projectId: string;
  payload: CreateProjectCameraInput;
}) {
  const actor = await this.resolveActor({
    authUserId: input.authUserId,
    projectId: input.projectId,
    permissionCode: "project.update",
    allowCustomer: false,
    tenantServiceAccess: input.tenantServiceAccess,
    requiredCapability: input.requiredCapability,
  });
  if (!actor.tenantId) {
    throw Errors.business(403, "缺少租户上下文", ErrorCodes.CAMERA_ACCESS_DENIED);
  }
  const camera = await projectCameraRepository.bindProjectCamera({
    tenantId: actor.tenantId,
    projectId: input.projectId,
    payload: input.payload,
    actorEmployeeId: actor.authContext?.employeeId || null,
  });

  return { id: camera.id };
}

export async function updateProjectCamera(this: any, input: TenantServiceAccessInput & {
  authUserId?: string | null;
  projectId: string;
  cameraId: string;
  payload: UpdateProjectCameraInput;
}) {
  const actor = await this.resolveActor({
    authUserId: input.authUserId,
    projectId: input.projectId,
    permissionCode: "project.update",
    allowCustomer: false,
    tenantServiceAccess: input.tenantServiceAccess,
    requiredCapability: input.requiredCapability,
  });

  const camera = await projectCameraRepository.update(
    input.projectId,
    input.cameraId,
    input.payload,
    actor.tenantId,
  );

  return serializeCamera(camera);
}

export async function deleteProjectCamera(this: any, input: TenantServiceAccessInput & {
  authUserId?: string | null;
  projectId: string;
  cameraId: string;
}) {
  const actor = await this.resolveActor({
    authUserId: input.authUserId,
    projectId: input.projectId,
    permissionCode: "project.update",
    allowCustomer: false,
    tenantServiceAccess: input.tenantServiceAccess,
    requiredCapability: input.requiredCapability,
  });
  if (!actor.tenantId) {
    throw Errors.business(403, "缺少租户上下文", ErrorCodes.CAMERA_ACCESS_DENIED);
  }
  await projectCameraRepository.unbindProjectCamera({
    tenantId: actor.tenantId,
    projectId: input.projectId,
    cameraId: input.cameraId,
    actorEmployeeId: actor.authContext?.employeeId || null,
  });
  return { success: true };
}
