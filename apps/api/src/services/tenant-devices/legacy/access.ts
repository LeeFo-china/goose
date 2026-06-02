import {
  ErrorCodes,
  Errors,
  accessPolicyService,
  tenantDeviceRepository,
  type AuthContext,
  type TenantDeviceRow,
} from "./shared";

export function assertTenantDeviceAccess(
  authContext: AuthContext,
  permissionCode = "project.read",
) {
  if (!authContext.employeeId || !accessPolicyService.hasPermission(authContext, permissionCode)) {
    throw Errors.business(
      403,
      "无权访问设备资产",
      ErrorCodes.CAMERA_ACCESS_DENIED,
    );
  }

  return accessPolicyService.assertTenantContext(authContext);
}

export function assertPlatformAdmin(authContext: AuthContext) {
  if (!authContext.isPlatformAdmin) {
    throw Errors.forbidden();
  }
}

export function getDeviceLabel(device: TenantDeviceRow) {
  return device.vendor_channel_name ||
    device.vendor_device_name ||
    device.vendor_channel_code ||
    device.vendor_device_code ||
    device.vendor_channel_id ||
    device.vendor_device_serial;
}

export async function getRequiredPlatformDevice(id: string, authContext: AuthContext) {
  assertPlatformAdmin(authContext);
  const device = await tenantDeviceRepository.findById(id);
  if (!device) {
    throw Errors.badRequest("设备资产不存在");
  }

  return device;
}

export async function getRequiredPlatformTencentDevice(id: string, authContext: AuthContext) {
  const device = await getRequiredPlatformDevice(id, authContext);
  if (device.vendor !== "tencent_iotvideo_industry") {
    throw Errors.badRequest("仅腾讯云设备支持该操作");
  }

  return device;
}
