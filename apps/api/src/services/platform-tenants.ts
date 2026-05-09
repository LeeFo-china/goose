import { Errors } from "@/errors/error-factory";
import { platformTenantRepository } from "@/repositories/platform-tenants";
import type {
  CreatePlatformTenantInput,
  PlatformTenantListQuery,
  UpdatePlatformTenantInput,
} from "@/schema/platform-tenants";
import type { AuthContext } from "@/services/authorization";

class PlatformTenantService {
  async list(query: PlatformTenantListQuery, authContext: AuthContext) {
    this.assertPlatformAdmin(authContext);
    return platformTenantRepository.list(query);
  }

  async create(input: CreatePlatformTenantInput, authContext: AuthContext) {
    this.assertPlatformAdmin(authContext);

    const existing = await platformTenantRepository.findBySlug(input.slug);
    if (existing) {
      throw Errors.business(409, "租户标识已存在", "TENANT_SLUG_EXISTS", {
        slug: input.slug,
      });
    }

    if (input.admin) {
      await this.assertAdminPhoneAvailable(input.admin.phone);
    }

    const record = await platformTenantRepository.create(input);
    const initialization = await platformTenantRepository.initializeDefaultData({
      tenantId: record.id,
      operatorEmployeeId: authContext.employeeId,
      admin: input.admin,
    });
    const usage = await platformTenantRepository.getUsageStats([record.id]);

    return {
      ...record,
      usage: usage.get(record.id) ?? null,
      initialization,
    };
  }

  async getDetail(id: string, authContext: AuthContext) {
    this.assertPlatformAdmin(authContext);
    const record = await this.getRequiredTenant(id);
    const usage = await platformTenantRepository.getUsageStats([id]);

    return {
      ...record,
      usage: usage.get(id) ?? null,
    };
  }

  async update(id: string, input: UpdatePlatformTenantInput, authContext: AuthContext) {
    this.assertPlatformAdmin(authContext);
    await this.getRequiredTenant(id);

    const record = await platformTenantRepository.update(id, input);
    if (!record) {
      throw Errors.notFound("租户不存在");
    }

    const usage = await platformTenantRepository.getUsageStats([id]);
    return {
      ...record,
      usage: usage.get(id) ?? null,
    };
  }

  async suspend(id: string, authContext: AuthContext) {
    this.assertPlatformAdmin(authContext);
    const tenant = await this.getRequiredTenant(id);
    if (tenant.status === "archived") {
      throw Errors.business(409, "已归档租户不能停用", "TENANT_ARCHIVED");
    }

    const record = await platformTenantRepository.updateStatus(id, "suspended");
    if (!record) {
      throw Errors.notFound("租户不存在");
    }

    return {
      ...record,
      suspended: true,
    };
  }

  async activate(id: string, authContext: AuthContext) {
    this.assertPlatformAdmin(authContext);
    const tenant = await this.getRequiredTenant(id);
    if (tenant.status === "archived") {
      throw Errors.business(409, "已归档租户不能启用", "TENANT_ARCHIVED");
    }

    const record = await platformTenantRepository.updateStatus(id, "active");
    if (!record) {
      throw Errors.notFound("租户不存在");
    }

    return {
      ...record,
      activated: true,
    };
  }

  private assertPlatformAdmin(authContext: AuthContext) {
    if (!authContext.isPlatformAdmin) {
      throw Errors.forbidden();
    }
  }

  private async getRequiredTenant(id: string) {
    const tenant = await platformTenantRepository.findById(id);
    if (!tenant) {
      throw Errors.notFound("租户不存在");
    }

    return tenant;
  }

  private async assertAdminPhoneAvailable(phone: string) {
    const employees = await platformTenantRepository.findEmployeesByPhone(phone);
    if (employees.length > 0) {
      throw Errors.business(409, "管理员手机号已绑定员工身份", "TENANT_ADMIN_PHONE_EXISTS", {
        phone,
        employee_count: employees.length,
      });
    }
  }
}

export const platformTenantService = new PlatformTenantService();
