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

export async function saveCameraStatus(this: any, input: {
  cameraId: string;
  status: ProjectCameraRow["status"];
  errorMessage?: string | null;
}) {
  try {
    await projectCameraRepository.updateStatus(input);
    await tenantDeviceRepository.updateStatusByCameraId({
      cameraId: input.cameraId,
      status: input.status,
      rawStatus: input.errorMessage || null,
    });
  } catch {
    // 状态回写只用于提升列表体验，不能影响播放主链路。
  }
}

export async function enrichTencentCameraStatuses(
  this: any,
  cameras: ProjectCameraRow[],
): Promise<ProjectCameraRow[]> {
  const tencentCameras = cameras.filter((camera) =>
    camera.vendor === "tencent_iotvideo_industry" && camera.vendor_channel_id
  );
  if (!tencentCameras.length) return cameras;

  try {
    const channels = await tencentIotVideoService.listDeviceChannels();
    const statusMap = new Map(
      channels.map((channel) => [
        buildTencentDeviceChannelKey(channel.device_id, channel.channel_id),
        normalizeCameraStatus(channel.status),
      ]),
    );

    const changed: Array<{
      cameraId: string;
      status: ProjectCameraRow["status"];
    }> = [];
    const nextCameras = cameras.map((camera) => {
      if (camera.vendor !== "tencent_iotvideo_industry" || !camera.vendor_channel_id) {
        return camera;
      }

      const status = statusMap.get(
        buildTencentDeviceChannelKey(camera.vendor_device_serial, camera.vendor_channel_id),
      );
      if (!status) return camera;
      if (status !== camera.status) {
        changed.push({
          cameraId: camera.id,
          status,
        });
      }
      return withCameraStatus(camera, status);
    });

    await Promise.all(changed.map((item) =>
      this.saveCameraStatus({
        cameraId: item.cameraId,
        status: item.status,
      })
    ));

    return nextCameras;
  } catch {
    return cameras;
  }
}

export async function getCustomerOwnedProjectTenant(this: any, authUserId: string, projectId: string) {
  const row = await projectCameraRepository.getCustomerOwnedProjectTenant({
    authUserId,
    projectId,
  });

  return row?.tenant_id ?? null;
}

export async function assertProjectExists(this: any, projectId: string, tenantId?: string | null) {
  const project = await projectCameraRepository.getProject(projectId, tenantId);
  if (!project) {
    throw Errors.business(404, "项目不存在", "PROJECT_NOT_FOUND");
  }

  return project;
}

export async function resolveActor(this: any, input: TenantServiceAccessInput & {
  authUserId?: string | null;
  projectId: string;
  permissionCode: "project.read" | "project.update";
  allowCustomer: boolean;
}): Promise<CameraActor> {
  if (!input.authUserId) {
    throw Errors.unauthorized("缺少登录凭证");
  }

  const customerTenantId = input.allowCustomer
    ? await this.getCustomerOwnedProjectTenant(input.authUserId, input.projectId)
    : null;
  if (input.allowCustomer && customerTenantId) {
    return {
      userId: input.authUserId,
      userRole: "customer",
      tenantId: customerTenantId,
    };
  }

  const authContext = await authorizationService.getRequiredAuthContext(
    input.authUserId,
    { tenantServiceAccess: input.tenantServiceAccess },
  );

  if (
    !authContext.employeeId ||
    !accessPolicyService.hasPermission(authContext, input.permissionCode)
  ) {
    throw Errors.business(
      403,
      "无权查看该项目摄像头",
      ErrorCodes.CAMERA_ACCESS_DENIED,
    );
  }

  const tenantId = accessPolicyService.assertTenantContext(authContext);
  const hasAccess = await accessPolicyService.canAccessProject(
    authContext,
    input.projectId,
    input.permissionCode,
  );

  if (!hasAccess) {
    throw Errors.business(
      403,
      "无权查看该项目摄像头",
      ErrorCodes.CAMERA_ACCESS_DENIED,
    );
  }

  await this.assertProjectExists(input.projectId, tenantId);

  return {
    userId: authContext.employeeId || input.authUserId,
    userRole: "employee",
    tenantId,
    authContext,
  };
}

export async function logAccess(this: any, input: {
  actor: CameraActor;
  projectId: string;
  cameraId?: string | null;
  action: CameraAccessLogAction;
  result?: "success" | "failure";
  errorMessage?: string | null;
  meta?: RequestLogMeta;
}) {
  await projectCameraRepository.logAccess({
    tenant_id: input.actor.tenantId,
    project_id: input.projectId,
    camera_id: input.cameraId || null,
    user_id: input.actor.userId,
    user_role: input.actor.userRole,
    action: input.action,
    result: input.result,
    error_message: input.errorMessage,
    ip: getIp(input.meta),
    user_agent: getUserAgent(input.meta),
  });
}
