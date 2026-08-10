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
    { tenantServiceAccess: input.tenantServiceAccess },
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
    { tenantServiceAccess: input.tenantServiceAccess },
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
  const result = await projectCameraRepository.listCameraProjectGroups({
    ...input.query,
    tenantId,
    visibleProjectIds,
  });
  const groups: ProjectCameraProjectGroupRow[] = result.list;
  const enrichedCameras: ProjectCameraRow[] = await this.enrichTencentCameraStatuses(
    groups.flatMap((group) => group.cameras),
  );
  const cameraMap = new Map<string, ProjectCameraRow>(
    enrichedCameras.map((camera) => [camera.id, camera]),
  );

  return {
    list: groups.map((group) => {
      const cameras: ProjectCameraRow[] = group.cameras.map((camera) =>
        cameraMap.get(camera.id) || camera
      );

      return {
        project: group.project,
        cameras: cameras.map(serializeCamera),
        summary: {
          camera_count: cameras.length,
          online_count: cameras.filter((camera) =>
            normalizeCameraStatus(camera.status) === "online"
          ).length,
          hidden_count: cameras.filter((camera) => !camera.can_view).length,
          tencent_count: cameras.filter((camera) =>
            camera.vendor === "tencent_iotvideo_industry"
          ).length,
        },
      };
    }),
    pagination: result.pagination,
    summary: result.summary,
  };
}
