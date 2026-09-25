import { buildGb28181VideoChannelCode } from "@/services/gb28181-channel-code";
import { assertTenantDeviceAccess } from "./access";
import {
  ErrorCodes,
  Errors,
  generateSipPassword,
  getTencentDeviceTypeLabel,
  tenantDeviceRepository,
  tencentIotVideoService,
  type AuthContext,
  type CreateTenantTencentDeviceInput,
} from "./shared";

export async function createTenantTencentDevice(input: {
  authContext: AuthContext;
  payload: CreateTenantTencentDeviceInput;
}) {
  const tenantId = assertTenantDeviceAccess(input.authContext, "project.update");
  const hardwareSerial = input.payload.hardware_serial;
  const existing = await tenantDeviceRepository.findByHardwareSerial({
    tenantId,
    vendor: "tencent_iotvideo_industry",
    hardwareSerial,
  });
  if (existing) {
    throw Errors.business(409, "该设备 SN 已登记", ErrorCodes.CAMERA_ALREADY_BOUND);
  }

  const password = input.payload.password || generateSipPassword();
  const created = await tencentIotVideoService.createDevice({
    name: hardwareSerial,
    password,
    deviceType: input.payload.device_type,
  });
  if (!created.device_id) {
    throw Errors.business(
      503,
      "腾讯云未返回设备 ID",
      ErrorCodes.TENCENT_IOT_VIDEO_API_ERROR,
      { request_id: created.request_id },
    );
  }
  const asset = await tenantDeviceRepository.create({
    tenant_id: tenantId,
    vendor: "tencent_iotvideo_industry",
    hardware_serial: hardwareSerial,
    vendor_device_serial: created.device_id,
    vendor_device_code: created.device_code,
    vendor_device_name: hardwareSerial,
    vendor_channel_id: null,
    vendor_channel_code: null,
    vendor_channel_name: null,
    device_type: getTencentDeviceTypeLabel(input.payload.device_type),
    source_project_id: null,
    status: "unknown",
    metadata: {
      virtual_group_id: created.virtual_group_id,
      sip_transport_protocol: "TCP",
    },
    created_by: input.authContext.employeeId,
  });
  const sipServer = await tencentIotVideoService.getSipServerConfig().catch(() => null);

  return {
    asset,
    device: {
      tenant_device_id: asset.id,
      hardware_serial: hardwareSerial,
      device_id: created.device_id,
      device_code: created.device_code,
      device_name: hardwareSerial,
      device_type: input.payload.device_type,
      device_type_label: getTencentDeviceTypeLabel(input.payload.device_type),
      sip_username: created.device_code,
      video_channel_code: buildGb28181VideoChannelCode(created.device_code),
      sip_password: password,
      sip_transport_protocol: "TCP" as const,
      request_id: created.request_id,
    },
    sip_server: sipServer,
  };
}
