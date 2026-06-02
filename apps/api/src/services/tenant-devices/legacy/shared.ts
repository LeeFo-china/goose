import { randomBytes } from "node:crypto";

export { Errors } from "@/errors/error-factory";
export { ErrorCodes } from "@/errors/error-codes";
export { projectCameraRepository } from "@/repositories/project-cameras";
export {
  tenantDeviceRepository,
  type TenantDeviceRow,
} from "@/repositories/tenant-devices";
export type {
  CreateTenantDeviceInput,
  PlatformTencentDeviceListQueryInput,
  PlatformTenantDeviceListQueryInput,
  TenantDeviceListQueryInput,
  UpdateTenantDeviceInput,
} from "@/schema/tenant-devices";
export { accessPolicyService } from "@/services/access-policy";
export type { AuthContext } from "@/services/authorization";
export { ezvizDeviceService } from "@/services/ezviz";
export { platformAuditLogService } from "@/services/platform-audit-logs";
export { tencentIotVideoService } from "@/services/tencent-iot-video";

export function getTencentDeviceTypeLabel(value: number | null | undefined) {
  if (value === 2) return "IPC";
  if (value === 3) return "NVR";
  if (value === 1) return "VMS";
  if (value === 9) return "智能告警设备";
  return value == null ? null : `类型 ${value}`;
}

export function generateSipPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789_";
  const bytes = randomBytes(12);
  let password = "";

  for (const byte of bytes) {
    password += alphabet[byte % alphabet.length];
  }

  return password;
}
