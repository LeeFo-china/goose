import { tencentRegistrationRepository } from "@/repositories/tenant-devices/tencent-registration";
import { tencentRegistrationGateway } from "@/gateways/tencent-iot-video/registration";
import { registerTenantTencentDevice } from "../tencent-registration";
import { assertTenantDeviceAccess } from "./access";
import { generateSipPassword, type AuthContext, type CreateTenantTencentDeviceInput } from "./shared";

export async function createTenantTencentDevice(input: {
  authContext: AuthContext;
  payload: CreateTenantTencentDeviceInput;
}) {
  const tenantId = assertTenantDeviceAccess(input.authContext, "project.update");
  return registerTenantTencentDevice({ tenantId, employeeId: input.authContext.employeeId,
    payload: input.payload }, {
    repository: tencentRegistrationRepository,
    gateway: tencentRegistrationGateway,
    generatePassword: generateSipPassword,
  });
}
