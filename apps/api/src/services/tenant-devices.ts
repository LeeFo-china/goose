import { Errors } from "@/errors/error-factory";
import { ErrorCodes } from "@/errors/error-codes";
import { projectCameraRepository } from "@/repositories/project-cameras";
import { tenantDeviceRepository } from "@/repositories/tenant-devices";
import type {
  CreateTenantDeviceInput,
  TenantDeviceListQueryInput,
  UpdateTenantDeviceInput,
} from "@/schema/tenant-devices";
import { accessPolicyService } from "@/services/access-policy";
import { authorizationService } from "@/services/authorization";

class TenantDeviceService {
  private async getTenantAuthContext(authUserId?: string | null, permissionCode = "project.read") {
    if (!authUserId) {
      throw Errors.unauthorized("缺少登录凭证");
    }

    const authContext = await authorizationService.getRequiredAuthContext(authUserId);
    if (!authContext.employeeId || !accessPolicyService.hasPermission(authContext, permissionCode)) {
      throw Errors.business(
        403,
        "无权访问设备资产",
        ErrorCodes.CAMERA_ACCESS_DENIED,
      );
    }

    return authContext;
  }

  async listTenantDevices(input: {
    authUserId?: string | null;
    query: TenantDeviceListQueryInput;
  }) {
    const authContext = await this.getTenantAuthContext(input.authUserId, "project.read");
    const tenantId = accessPolicyService.assertTenantContext(authContext);

    return tenantDeviceRepository.list({
      ...input.query,
      tenantId,
    });
  }

  async getTenantDevice(input: {
    authUserId?: string | null;
    id: string;
  }) {
    const authContext = await this.getTenantAuthContext(input.authUserId, "project.read");
    const tenantId = accessPolicyService.assertTenantContext(authContext);
    const device = await tenantDeviceRepository.findById(input.id, tenantId);
    if (!device) {
      throw Errors.badRequest("设备资产不存在");
    }

    return device;
  }

  async createTenantDevice(input: {
    authUserId?: string | null;
    payload: CreateTenantDeviceInput;
  }) {
    const authContext = await this.getTenantAuthContext(input.authUserId, "project.update");
    const tenantId = accessPolicyService.assertTenantContext(authContext);
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
      created_by: authContext.employeeId,
    });
  }

  async updateTenantDevice(input: {
    authUserId?: string | null;
    id: string;
    payload: UpdateTenantDeviceInput;
  }) {
    const authContext = await this.getTenantAuthContext(input.authUserId, "project.update");
    const tenantId = accessPolicyService.assertTenantContext(authContext);
    const device = await tenantDeviceRepository.findById(input.id, tenantId);
    if (!device) {
      throw Errors.badRequest("设备资产不存在");
    }

    return tenantDeviceRepository.update(input.id, {
      ...input.payload,
      updated_by: authContext.employeeId,
    }, tenantId);
  }

  async deleteTenantDevice(input: {
    authUserId?: string | null;
    id: string;
  }) {
    const authContext = await this.getTenantAuthContext(input.authUserId, "project.update");
    const tenantId = accessPolicyService.assertTenantContext(authContext);
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
      authContext.employeeId,
    );

    return { success: true };
  }
}

export const tenantDeviceService = new TenantDeviceService();
