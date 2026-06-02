import { assertTenantDeviceAccess } from "./access";
import {
  ErrorCodes,
  Errors,
  projectCameraRepository,
  tenantDeviceRepository,
  type AuthContext,
  type CreateTenantDeviceInput,
  type UpdateTenantDeviceInput,
} from "./shared";

export async function getTenantDevice(input: {
  authContext: AuthContext;
  id: string;
}) {
  const tenantId = assertTenantDeviceAccess(input.authContext, "project.read");
  const device = await tenantDeviceRepository.findById(input.id, tenantId);
  if (!device) {
    throw Errors.badRequest("设备资产不存在");
  }

  return device;
}

export async function createTenantDevice(input: {
  authContext: AuthContext;
  payload: CreateTenantDeviceInput;
}) {
  const tenantId = assertTenantDeviceAccess(input.authContext, "project.update");
  const project = await projectCameraRepository.getProject(
    input.payload.source_project_id,
    tenantId,
  );
  if (!project) {
    throw Errors.business(404, "项目不存在", "PROJECT_NOT_FOUND");
  }

  const existing = await tenantDeviceRepository.findByVendorDeviceChannel({
    vendor: input.payload.vendor,
    vendor_device_serial: input.payload.vendor_device_serial,
    vendor_channel_id: input.payload.vendor_channel_id,
  });
  if (existing) {
    if (existing.tenant_id !== tenantId) {
      throw Errors.business(
        409,
        "该设备已归属其他租户",
        ErrorCodes.CAMERA_BOUND_TO_ANOTHER_PROJECT,
      );
    }

    throw Errors.business(409, "该设备资产已存在", ErrorCodes.CAMERA_ALREADY_BOUND);
  }

  return tenantDeviceRepository.create({
    ...input.payload,
    tenant_id: tenantId,
    created_by: input.authContext.employeeId,
  });
}

export async function updateTenantDevice(input: {
  authContext: AuthContext;
  id: string;
  payload: UpdateTenantDeviceInput;
}) {
  const tenantId = assertTenantDeviceAccess(input.authContext, "project.update");
  const device = await tenantDeviceRepository.findById(input.id, tenantId);
  if (!device) {
    throw Errors.badRequest("设备资产不存在");
  }

  return tenantDeviceRepository.update(input.id, {
    ...input.payload,
    updated_by: input.authContext.employeeId,
  }, tenantId);
}

export async function deleteTenantDevice(input: {
  authContext: AuthContext;
  id: string;
}) {
  const tenantId = assertTenantDeviceAccess(input.authContext, "project.update");
  const device = await tenantDeviceRepository.findById(input.id, tenantId);
  if (!device) {
    throw Errors.badRequest("设备资产不存在");
  }

  if (device.bound_camera_id || device.bound_project_id) {
    throw Errors.business(
      409,
      "设备已绑定项目，请先解绑项目摄像头后再删除",
      ErrorCodes.CAMERA_ALREADY_BOUND,
    );
  }

  await tenantDeviceRepository.softDelete(
    input.id,
    tenantId,
    input.authContext.employeeId,
  );

  return { success: true };
}
