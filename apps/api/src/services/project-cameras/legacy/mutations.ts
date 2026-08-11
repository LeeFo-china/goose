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
  const project = await projectRepository.findById(input.projectId, actor.tenantId);
  if (!project) {
    throw Errors.business(404, "项目不存在", "PROJECT_NOT_FOUND");
  }
  projectStatusService.assertCanBindProjectCamera(project);

  const existingDevice = await tenantDeviceRepository.findByVendorDeviceChannel({
    vendor: input.payload.vendor,
    vendor_device_serial: input.payload.vendor_device_serial,
    vendor_channel_id: input.payload.vendor_channel_id,
  });
  if (existingDevice && existingDevice.tenant_id !== actor.tenantId) {
    throw Errors.business(
      409,
      "该设备已归属其他租户",
      ErrorCodes.CAMERA_BOUND_TO_ANOTHER_PROJECT,
    );
  }
  if (
    existingDevice?.bound_camera_id &&
    existingDevice.bound_project_id !== input.projectId
  ) {
    throw Errors.business(
      409,
      "该设备已绑定到当前租户其他项目，请先解绑后再绑定",
      ErrorCodes.CAMERA_ALREADY_BOUND,
    );
  }

  const camera = await projectCameraRepository.create(
    input.projectId,
    input.payload,
    actor.tenantId,
  );
  await tenantDeviceRepository.upsertFromProjectCamera(
    camera,
    actor.authContext?.employeeId || null,
  );

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
  await projectCameraRepository.softDelete(input.projectId, input.cameraId, actor.tenantId);
  await tenantDeviceRepository.markUnboundByCameraId(
    input.cameraId,
    actor.authContext?.employeeId || null,
  );
  return { success: true };
}
