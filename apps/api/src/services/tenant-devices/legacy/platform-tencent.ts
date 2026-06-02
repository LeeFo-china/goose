import {
  assertPlatformAdmin,
  getDeviceLabel,
  getRequiredPlatformDevice,
  getRequiredPlatformTencentDevice,
} from "./access";
import { syncAssets } from "./sync";
import {
  ErrorCodes,
  Errors,
  generateSipPassword,
  platformAuditLogService,
  projectCameraRepository,
  tenantDeviceRepository,
  tencentIotVideoService,
  type AuthContext,
} from "./shared";

export async function deletePlatformTencentDevice(deviceId: string, authContext: AuthContext) {
  assertPlatformAdmin(authContext);

  const [device, channels, assets, bindings] = await Promise.all([
    tencentIotVideoService.findDeviceSummary(deviceId),
    tencentIotVideoService.listChannels(deviceId),
    tenantDeviceRepository.listActiveByVendorDeviceSerial("tencent_iotvideo_industry", deviceId),
    projectCameraRepository.listActiveBindingsByVendorDeviceSerial("tencent_iotvideo_industry", deviceId),
  ]);

  if (!device) {
    throw Errors.business(404, "腾讯云设备不存在", ErrorCodes.CAMERA_NOT_FOUND);
  }

  if (assets.length > 0 || bindings.length > 0) {
    throw Errors.business(
      409,
      "设备已纳入资产或已绑定项目，不能删除",
      ErrorCodes.CAMERA_ALREADY_BOUND,
    );
  }

  const result = await tencentIotVideoService.deleteDevice(deviceId);

  await platformAuditLogService.recordBestEffort({
    action: "platform_device_cloud_delete",
    actorEmployeeId: authContext.employeeId,
    actorUserId: authContext.authUserId,
    targetTenantId: null,
    resourceType: "tencent_device",
    resourceId: deviceId,
    resourceLabel: device.device_name || device.device_code || device.device_id,
    summary: `删除腾讯云空闲设备「${device.device_name || device.device_code || device.device_id}」`,
    metadata: {
      vendor: "tencent_iotvideo_industry",
      vendor_device_serial: deviceId,
      vendor_device_code: device.device_code,
      channel_count: channels.length,
      request_id: result.request_id,
    },
  });

  return {
    success: true,
    request_id: result.request_id,
  };
}

export async function getPlatformTencentDeviceAccessInfo(id: string, authContext: AuthContext) {
  const device = await getRequiredPlatformTencentDevice(id, authContext);
  const sipServer = await tencentIotVideoService.getSipServerConfig();

  await platformAuditLogService.recordBestEffort({
    action: "platform_device_access_view",
    actorEmployeeId: authContext.employeeId,
    actorUserId: authContext.authUserId,
    targetTenantId: device.tenant_id,
    resourceType: "tenant_device",
    resourceId: device.id,
    resourceLabel: getDeviceLabel(device),
    summary: `查看设备「${getDeviceLabel(device)}」接入信息`,
    metadata: {
      vendor: device.vendor,
      vendor_device_serial: device.vendor_device_serial,
      vendor_channel_id: device.vendor_channel_id,
    },
  });

  return {
    device: {
      tenant_device_id: device.id,
      device_id: device.vendor_device_serial,
      device_code: device.vendor_device_code,
      device_name: device.vendor_device_name,
      channel_id: device.vendor_channel_id,
      channel_code: device.vendor_channel_code,
      channel_name: device.vendor_channel_name,
      device_type_label: device.device_type,
      sip_username: device.vendor_device_code || device.vendor_device_serial,
      sip_transport_protocol: "TCP" as const,
      source_project_id: device.source_project_id,
      bound_project_id: device.bound_project_id,
    },
    sip_server: sipServer,
  };
}

export async function getPlatformTencentDevicePassword(id: string, authContext: AuthContext) {
  const device = await getRequiredPlatformTencentDevice(id, authContext);
  const result = await tencentIotVideoService.getDevicePassword(device.vendor_device_serial);

  await platformAuditLogService.recordBestEffort({
    action: "platform_device_password_query",
    actorEmployeeId: authContext.employeeId,
    actorUserId: authContext.authUserId,
    targetTenantId: device.tenant_id,
    resourceType: "tenant_device",
    resourceId: device.id,
    resourceLabel: getDeviceLabel(device),
    summary: `查询设备「${getDeviceLabel(device)}」SIP密码`,
    metadata: {
      vendor: device.vendor,
      vendor_device_serial: device.vendor_device_serial,
    },
  });

  return {
    tenant_device_id: device.id,
    device_id: device.vendor_device_serial,
    device_code: device.vendor_device_code,
    device_name: device.vendor_device_name,
    sip_username: device.vendor_device_code || device.vendor_device_serial,
    sip_transport_protocol: "TCP" as const,
    sip_password: result.password,
    request_id: result.request_id,
  };
}

export async function resetPlatformTencentDevicePassword(id: string, authContext: AuthContext) {
  const device = await getRequiredPlatformTencentDevice(id, authContext);
  const password = generateSipPassword();
  const result = await tencentIotVideoService.updateDevicePassword({
    deviceId: device.vendor_device_serial,
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

  await platformAuditLogService.recordBestEffort({
    action: "platform_device_password_reset",
    actorEmployeeId: authContext.employeeId,
    actorUserId: authContext.authUserId,
    targetTenantId: device.tenant_id,
    resourceType: "tenant_device",
    resourceId: device.id,
    resourceLabel: getDeviceLabel(device),
    summary: `重置设备「${getDeviceLabel(device)}」SIP密码`,
    metadata: {
      vendor: device.vendor,
      vendor_device_serial: device.vendor_device_serial,
      request_id: result.request_id,
    },
  });

  return {
    tenant_device_id: device.id,
    device_id: device.vendor_device_serial,
    device_code: device.vendor_device_code,
    device_name: device.vendor_device_name,
    sip_username: device.vendor_device_code || device.vendor_device_serial,
    sip_transport_protocol: "TCP" as const,
    sip_password: password,
    status: result.status,
    request_id: result.request_id,
  };
}

export async function syncPlatformTenantDevice(id: string, authContext: AuthContext) {
  const device = await getRequiredPlatformDevice(id, authContext);
  const result = await syncAssets({
    tenantId: device.tenant_id,
    assets: [device],
    updatedBy: authContext.employeeId,
  });

  await platformAuditLogService.recordBestEffort({
    action: "platform_device_sync",
    actorEmployeeId: authContext.employeeId,
    actorUserId: authContext.authUserId,
    targetTenantId: device.tenant_id,
    resourceType: "tenant_device",
    resourceId: device.id,
    resourceLabel: getDeviceLabel(device),
    summary: `同步设备「${getDeviceLabel(device)}」资产`,
    metadata: {
      vendor: device.vendor,
      vendor_device_serial: device.vendor_device_serial,
      result,
    },
  });

  return result;
}
