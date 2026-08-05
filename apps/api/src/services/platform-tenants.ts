import { Errors } from "@/errors/error-factory";
import { platformTenantRepository } from "@/repositories/platform-tenants";
import type {
  CreatePlatformTenantInput,
  PlatformTenantListQuery,
  UpdatePlatformTenantInput,
} from "@/schema/platform-tenants";
import { authorizationService, type AuthContext } from "@/services/authorization";
import { platformAuditLogService } from "@/services/platform-audit-logs";
import { platformAuthorizationService } from "@/services/platform-authorization";
import type { PermissionCode } from "@gooes/domain";

class PlatformTenantService {
  async list(query: PlatformTenantListQuery, authContext: AuthContext) {
    this.assertPermission(authContext, "platform.tenant.read");
    return platformTenantRepository.list(query);
  }

  async create(input: CreatePlatformTenantInput, authContext: AuthContext) {
    this.assertPermission(authContext, "platform.tenant.manage");

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
    await platformAuditLogService.recordBestEffort({
      action: "tenant_create",
      actorEmployeeId: authContext.employeeId,
      actorUserId: authContext.authUserId,
      targetTenantId: record.id,
      resourceType: "tenant",
      resourceId: record.id,
      resourceLabel: record.name,
      summary: `创建租户「${record.name}」`,
      metadata: {
        slug: record.slug,
        status: record.status,
        contact_name: record.contact_name,
        contact_phone: record.contact_phone,
        initialization,
      },
    });

    if (input.admin && initialization.admin_employee_id) {
      await platformAuditLogService.recordBestEffort({
        action: "tenant_admin_create",
        actorEmployeeId: authContext.employeeId,
        actorUserId: authContext.authUserId,
        targetTenantId: record.id,
        resourceType: "employee",
        resourceId: initialization.admin_employee_id,
        resourceLabel: input.admin.name,
        summary: `为租户「${record.name}」创建管理员「${input.admin.name}」`,
        metadata: {
          admin_phone: input.admin.phone,
          admin_role_id: initialization.admin_role_id,
          tenant_slug: record.slug,
        },
      });
    }

    return {
      ...record,
      usage: usage.get(record.id) ?? null,
      initialization,
    };
  }

  async getDetail(id: string, authContext: AuthContext) {
    this.assertPermission(authContext, "platform.tenant.read");
    const record = await this.getRequiredTenant(id);
    const [usage, templateApplication, adminEmployees, roles] = await Promise.all([
      platformTenantRepository.getUsageStats([id]),
      platformTenantRepository.getLatestTemplateApplication(id),
      platformTenantRepository.findTenantAdminEmployees(id),
      platformTenantRepository.listTenantRoles(id),
    ]);
    const result = templateApplication?.result || {};
    const adminEmployeeId = typeof result.admin_employee_id === "string"
      ? result.admin_employee_id
      : adminEmployees[0]?.id ?? null;
    const adminRoleId = typeof result.admin_role_id === "string"
      ? result.admin_role_id
      : null;
    const employeeIds = [
      adminEmployeeId,
      templateApplication?.applied_by_employee_id ?? null,
    ].filter((value): value is string => Boolean(value));
    const roleIds = [adminRoleId].filter((value): value is string => Boolean(value));
    const [employeeMap, roleMap] = await Promise.all([
      platformTenantRepository.findEmployeesByIds(employeeIds),
      platformTenantRepository.findRolesByIds(roleIds),
    ]);

    return {
      ...record,
      usage: usage.get(id) ?? null,
      initialization: templateApplication
        ? {
          id: templateApplication.id,
          template_id: templateApplication.template_id,
          template_code: templateApplication.template_code,
          template_version: templateApplication.template_version,
          applied_by_employee_id: templateApplication.applied_by_employee_id,
          applied_by: templateApplication.applied_by_employee_id
            ? employeeMap.get(templateApplication.applied_by_employee_id) ?? null
            : null,
          applied_at: templateApplication.applied_at,
          result,
          departments_count: this.readNumber(result.departments_count),
          posts_count: this.readNumber(result.posts_count),
          roles_count: this.readNumber(result.roles_count),
          admin_employee_id: adminEmployeeId,
          admin_role_id: adminRoleId,
          admin_employee: adminEmployeeId ? employeeMap.get(adminEmployeeId) ?? null : null,
          admin_role: adminRoleId ? roleMap.get(adminRoleId) ?? null : null,
        }
        : null,
      admin_employees: adminEmployees,
      roles,
    };
  }

  async update(id: string, input: UpdatePlatformTenantInput, authContext: AuthContext) {
    this.assertPermission(authContext, "platform.tenant.manage");
    await this.getRequiredTenant(id);

    const record = await platformTenantRepository.update(id, input);
    if (!record) {
      throw Errors.notFound("租户不存在");
    }

    const usage = await platformTenantRepository.getUsageStats([id]);
    await platformAuditLogService.recordBestEffort({
      action: "tenant_update",
      actorEmployeeId: authContext.employeeId,
      actorUserId: authContext.authUserId,
      targetTenantId: record.id,
      resourceType: "tenant",
      resourceId: record.id,
      resourceLabel: record.name,
      summary: `更新租户「${record.name}」基础信息`,
      metadata: {
        input,
      },
    });

    return {
      ...record,
      usage: usage.get(id) ?? null,
    };
  }

  async suspend(id: string, authContext: AuthContext) {
    this.assertPermission(authContext, "platform.tenant.status.manage");
    const tenant = await this.getRequiredTenant(id);
    if (tenant.status === "archived") {
      throw Errors.business(409, "已归档租户不能停用", "TENANT_ARCHIVED");
    }

    const record = await platformTenantRepository.updateStatus(id, "suspended");
    if (!record) {
      throw Errors.notFound("租户不存在");
    }

    authorizationService.invalidateTenantContext(id);
    await platformAuditLogService.recordBestEffort({
      action: "tenant_suspend",
      actorEmployeeId: authContext.employeeId,
      actorUserId: authContext.authUserId,
      targetTenantId: record.id,
      resourceType: "tenant",
      resourceId: record.id,
      resourceLabel: record.name,
      summary: `停用租户「${record.name}」`,
      metadata: {
        previous_status: tenant.status,
        current_status: record.status,
        slug: record.slug,
      },
    });

    return {
      ...record,
      suspended: true,
    };
  }

  async activate(id: string, authContext: AuthContext) {
    this.assertPermission(authContext, "platform.tenant.status.manage");
    const tenant = await this.getRequiredTenant(id);
    if (tenant.status === "archived") {
      throw Errors.business(409, "已归档租户不能启用", "TENANT_ARCHIVED");
    }

    const record = await platformTenantRepository.updateStatus(id, "active");
    if (!record) {
      throw Errors.notFound("租户不存在");
    }

    authorizationService.invalidateTenantContext(id);
    await platformAuditLogService.recordBestEffort({
      action: "tenant_activate",
      actorEmployeeId: authContext.employeeId,
      actorUserId: authContext.authUserId,
      targetTenantId: record.id,
      resourceType: "tenant",
      resourceId: record.id,
      resourceLabel: record.name,
      summary: `启用租户「${record.name}」`,
      metadata: {
        previous_status: tenant.status,
        current_status: record.status,
        slug: record.slug,
      },
    });

    return {
      ...record,
      activated: true,
    };
  }

  private assertPermission(authContext: AuthContext, code: PermissionCode) {
    if (authContext.tenantId !== null || (!authContext.isPlatformStaff && !authContext.isPlatformAdmin)) {
      throw Errors.forbidden();
    }
    platformAuthorizationService.assertPermission(authContext, code);
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

  private readNumber(value: unknown) {
    return typeof value === "number" && Number.isFinite(value) ? value : 0;
  }
}

export const platformTenantService = new PlatformTenantService();
