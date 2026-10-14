import { Errors } from "@/errors/error-factory";
import { ErrorCodes } from "@/errors/error-codes";
import type { TenantDeviceRow } from "./legacy/shared";
import type { TencentIotVideoCreatedDevice } from "@/gateways/tencent-iot-video/shared";

export interface TencentRegistration {
  id: string;
  tenant_id: string;
  hardware_serial: string;
  device_type: number;
  state: "pending" | "cloud_created" | "completed";
  cloud_device_id: string | null;
  cloud_device_code: string | null;
  cloud_virtual_group_id: string | null;
  cloud_request_id: string | null;
  asset_id: string | null;
}
export interface RegistrationClaim {
  registration: TencentRegistration;
  can_create: boolean;
  asset: TenantDeviceRow | null;
}
export interface TencentRegistrationRepository {
  claim(input: { tenantId: string; hardwareSerial: string; deviceType: number; employeeId: string | null }): Promise<RegistrationClaim>;
  saveCloud(input: { tenantId: string; registrationId: string; cloud: TencentIotVideoCreatedDevice }): Promise<void>;
  complete(input: { tenantId: string; registrationId: string }): Promise<TenantDeviceRow>;
}

// Lazy access keeps this standalone repository importable without environment setup.
async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const { SupabaseDB } = await import("@/utils/supabase");
  const { data, error } = await SupabaseDB.getAdminClient().rpc(name, args);
  if (error) {
    if (error.code === "23505" || error.message === "TENANT_DEVICE_REGISTRATION_CONFLICT") {
      throw Errors.business(409, "设备登记状态冲突，需要核对后恢复", ErrorCodes.CAMERA_ALREADY_BOUND,
        { registration_state: "reconciliation_required" });
    }
    throw Errors.dbError("保存设备登记状态失败");
  }
  return data as T;
}

export const tencentRegistrationRepository: TencentRegistrationRepository = {
  claim: (input) => rpc<RegistrationClaim>("claim_tenant_tencent_registration", {
    p_tenant_id: input.tenantId, p_hardware_serial: input.hardwareSerial,
    p_device_type: input.deviceType, p_employee_id: input.employeeId,
  }),
  async saveCloud(input) {
    // Explicit scalar whitelist: neither the request password nor arbitrary cloud JSON is persisted.
    await rpc("save_tenant_tencent_registration_cloud", {
      p_tenant_id: input.tenantId, p_registration_id: input.registrationId,
      p_device_id: input.cloud.device_id, p_device_code: input.cloud.device_code,
      p_virtual_group_id: input.cloud.virtual_group_id, p_request_id: input.cloud.request_id,
    });
  },
  complete: (input) => rpc<TenantDeviceRow>("complete_tenant_tencent_registration", {
    p_tenant_id: input.tenantId, p_registration_id: input.registrationId,
  }),
};


export function renameTenantTencentDeviceSerial(input: {
  tenantId: string;
  assetId: string;
  hardwareSerial: string | null;
  employeeId: string | null;
}): Promise<TenantDeviceRow> {
  return rpc<TenantDeviceRow>("rename_tenant_tencent_device_serial", {
    p_tenant_id: input.tenantId, p_asset_id: input.assetId,
    p_hardware_serial: input.hardwareSerial, p_employee_id: input.employeeId,
  });
}
