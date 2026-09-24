import { assertTenantDeviceAccess } from "./access";
import {
  Errors,
  accessPolicyService,
  tenantDeviceRepository,
  tencentIotVideoService,
  type AuthContext,
} from "./shared";

export async function getTenantTencentDeviceAccessInfo(input: {
  authContext: AuthContext;
  id: string;
}) {
  const tenantId = assertTenantDeviceAccess(input.authContext, "project.update");
  const device = await tenantDeviceRepository.findById(input.id, tenantId);
  if (!device) {
    throw Errors.badRequest("设备资产不存在");
  }
  if (device.vendor !== "tencent_iotvideo_industry") {
    throw Errors.badRequest("仅腾讯云设备支持该操作");
  }

  const projectId = device.bound_project_id || device.source_project_id;
  if (!projectId || !await accessPolicyService.canAccessProject(
    input.authContext,
    projectId,
    "project.update",
  )) {
    throw Errors.forbidden();
  }

  const [sipServer, passwordResult] = await Promise.all([
    tencentIotVideoService.getSipServerConfig(),
    tencentIotVideoService.getDevicePassword(device.vendor_device_serial),
  ]);

  return {
    device: {
      tenant_device_id: device.id,
      device_id: device.vendor_device_serial,
      device_code: device.vendor_device_code,
      device_name: device.vendor_device_name,
      device_type_label: device.device_type,
      sip_username: device.vendor_device_code || device.vendor_device_serial,
      sip_password: passwordResult.password,
      sip_transport_protocol: "TCP" as const,
      source_project_id: device.source_project_id,
      bound_project_id: device.bound_project_id,
      request_id: passwordResult.request_id,
    },
    sip_server: sipServer,
  };
}
