import { Errors } from "@/errors/error-factory";
import { ErrorCodes } from "@/errors/error-codes";
import type { TencentRegistrationRepository, TencentRegistration } from "@/repositories/tenant-devices/tencent-registration";
import type { TencentRegistrationGateway } from "@/gateways/tencent-iot-video/registration";
import type { CreateTenantTencentDeviceInput } from "@/schema/tenant-devices";
import { buildGb28181VideoChannelCode } from "@/services/gb28181-channel-code";

export interface RegistrationDependencies {
  repository: TencentRegistrationRepository;
  gateway: TencentRegistrationGateway;
  generatePassword(): string;
}

function reconciliationRequired(registration: TencentRegistration) {
  return Errors.business(409, "设备登记结果尚未确认，请稍后重试；持续未确认需人工核对，勿重复创建云设备",
    ErrorCodes.CAMERA_ALREADY_BOUND, {
      registration_id: registration.id,
      registration_state: "reconciliation_required",
      hardware_serial: registration.hardware_serial,
    });
}

/** Claims never expire: a process crash before/after sending CreateDevice is indistinguishable.
 * Only a complete, exact operation-marker match can automatically recover an unknown result.
 */
export async function registerTenantTencentDevice(input: {
  tenantId: string;
  employeeId: string | null;
  payload: CreateTenantTencentDeviceInput;
}, dependencies: RegistrationDependencies) {
  const { repository, gateway } = dependencies;
  const hardwareSerial = input.payload.hardware_serial.trim().toUpperCase();
  const claim = await repository.claim({ tenantId: input.tenantId, hardwareSerial,
    deviceType: input.payload.device_type, employeeId: input.employeeId });
  const registration = claim.registration;
  const scope = { tenantId: input.tenantId, registrationId: registration.id };
  const marker = `gooes-reg-${registration.id}`;
  let asset = claim.asset;
  let initialPassword: string | undefined;
  let cloudRequestId = registration.cloud_request_id;

  if (!asset && registration.state === "pending") {
    let cloud = null;
    if (claim.can_create) {
      const password = input.payload.password || dependencies.generatePassword();
      try {
        cloud = await gateway.create({ marker, password, deviceType: registration.device_type });
        if (cloud.device_id) initialPassword = password;
      } catch {
        // A timeout/error does not establish that Tencent rejected the operation.
        // Never persist/log the raw error: it could contain request credentials.
        cloud = null;
      }
    }
    if (!cloud?.device_id) {
      try {
        cloud = await gateway.recover({ marker, deviceType: registration.device_type });
      } catch {
        throw reconciliationRequired(registration);
      }
    }
    if (!cloud?.device_id) throw reconciliationRequired(registration);
    await repository.saveCloud({ ...scope, cloud });
    cloudRequestId = cloud.request_id;
  }
  asset ??= await repository.complete(scope);
  // A concurrent admin rename can occur between claim and complete. Never label B's
  // configuration with the caller's old A key, even when the operation UUID is unchanged.
  if (asset.hardware_serial?.trim().toUpperCase() !== hardwareSerial) {
    throw reconciliationRequired(registration);
  }

  const passwordResult = initialPassword
    ? { password: initialPassword, request_id: null }
    : await gateway.getPassword(asset.vendor_device_serial).catch(() => {
      // The asset is already committed. Normalize upstream failures without exposing
      // credentials; the client must recover its configuration rather than recreate it.
      return { password: null, request_id: null };
    });
  if (!passwordResult.password) {
    throw Errors.business(503, "设备已登记，暂未获取接入密码，请重试读取配置",
      ErrorCodes.TENCENT_IOT_VIDEO_API_ERROR, { tenant_device_id: asset.id });
  }
  const sipServer = await gateway.getSipServer().catch(() => null);
  const deviceType = asset.device_type === "NVR" ? 3 : asset.device_type === "IPC" ? 2 : registration.device_type;
  return {
    asset,
    device: {
      tenant_device_id: asset.id,
      hardware_serial: hardwareSerial,
      device_id: asset.vendor_device_serial,
      device_code: asset.vendor_device_code,
      device_name: asset.vendor_device_name || hardwareSerial,
      device_type: deviceType,
      device_type_label: asset.device_type,
      sip_username: asset.vendor_device_code || asset.vendor_device_serial,
      video_channel_code: buildGb28181VideoChannelCode(asset.vendor_device_code),
      sip_password: passwordResult.password,
      sip_transport_protocol: "TCP" as const,
      request_id: passwordResult.request_id || cloudRequestId,
    },
    sip_server: sipServer,
  };
}
