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

export async function createTencentDevice(this: any, input: TenantServiceAccessInput & {
  authUserId?: string | null;
  projectId: string;
  payload: CreateProjectCameraTencentDeviceInput;
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

  const password = input.payload.password?.trim() || generateSipPassword();
  const originalName = normalizeDeviceName(
    input.payload.name || generateDeviceNameFallback(input.payload.device_type),
  );
  let name = originalName;

  if (await tencentDeviceNameExists(originalName)) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const candidate = buildUniqueDeviceNameCandidate(originalName);
      if (!await tencentDeviceNameExists(candidate)) {
        name = candidate;
        break;
      }
    }
  }

  const created = await tencentIotVideoService.createDevice({
    name,
    password,
    deviceType: input.payload.device_type,
    groupId: input.payload.group_id,
  });
  const sipServer = await tencentIotVideoService.getSipServerConfig().catch(() => null);
  if (created.device_id) {
    const existing = await tenantDeviceRepository.findByVendorDeviceChannel({
      vendor: "tencent_iotvideo_industry",
      vendor_device_serial: created.device_id,
      vendor_channel_id: null,
    });
    if (!existing) {
      await tenantDeviceRepository.create({
        tenant_id: actor.tenantId,
        vendor: "tencent_iotvideo_industry",
        vendor_device_serial: created.device_id,
        vendor_device_code: created.device_code,
        vendor_device_name: name,
        vendor_channel_id: null,
        vendor_channel_code: null,
        vendor_channel_name: null,
        device_type: getTencentDeviceTypeLabel(input.payload.device_type),
        source_project_id: input.projectId,
        status: "unknown",
        metadata: {
          virtual_group_id: created.virtual_group_id,
          group_id: input.payload.group_id || null,
          sip_transport_protocol: "TCP",
        },
        created_by: actor.authContext?.employeeId || null,
      });
    }
  }

  return {
    device: {
      device_id: created.device_id,
      device_code: created.device_code,
      device_name: name,
      device_type: input.payload.device_type,
      device_type_label: getTencentDeviceTypeLabel(input.payload.device_type),
      virtual_group_id: created.virtual_group_id,
      sip_username: created.device_code,
      sip_password: password,
      sip_transport_protocol: "TCP",
      request_id: created.request_id,
      original_device_name: originalName,
      name_adjusted: name !== originalName,
    },
    sip_server: sipServer,
  };
}

export async function getTencentDevicePassword(this: any, input: TenantServiceAccessInput & {
  authUserId?: string | null;
  projectId: string;
  deviceId: string;
}) {
  await this.resolveActor({
    authUserId: input.authUserId,
    projectId: input.projectId,
    permissionCode: "project.update",
    allowCustomer: false,
    tenantServiceAccess: input.tenantServiceAccess,
    requiredCapability: input.requiredCapability,
  });

  const result = await tencentIotVideoService.getDevicePassword(input.deviceId);

  return {
    device_id: input.deviceId,
    sip_password: result.password,
    request_id: result.request_id,
  };
}

export async function resetTencentDevicePassword(this: any, input: TenantServiceAccessInput & {
  authUserId?: string | null;
  projectId: string;
  deviceId: string;
  payload: UpdateProjectCameraTencentDevicePasswordInput;
}) {
  await this.resolveActor({
    authUserId: input.authUserId,
    projectId: input.projectId,
    permissionCode: "project.update",
    allowCustomer: false,
    tenantServiceAccess: input.tenantServiceAccess,
    requiredCapability: input.requiredCapability,
  });

  const password = input.payload.password?.trim() || generateSipPassword();
  const result = await tencentIotVideoService.updateDevicePassword({
    deviceId: input.deviceId,
    password,
  });

  if (result.status !== "OK") {
    throw Errors.business(
      503,
      "腾讯云设备密码重置失败",
      ErrorCodes.TENCENT_IOT_VIDEO_API_ERROR,
      result,
    );
  }

  return {
    device_id: input.deviceId,
    sip_password: password,
    status: result.status,
    request_id: result.request_id,
  };
}
