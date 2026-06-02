import { SupabaseDB } from "./legacy/shared";
import { list, findById, findBySlug, create, update, updateStatus } from "./legacy/tenants";
import { getUsageStats, getLatestTemplateApplication } from "./legacy/usage";
import {
  findEmployeesByPhone,
  findEmployeesByIds,
  findTenantAdminEmployees,
  findRolesByIds,
  listTenantRoles,
} from "./legacy/members";
import {
  initializeDefaultData,
  upsertDefaultDepartments,
  upsertDefaultPosts,
  upsertDefaultRoles,
  grantAllPermissionsToRole,
  createTenantAdminEmployee,
  findTenantDepartmentIdByCode,
  assignEmployeeRole,
  recordTemplateApplication,
} from "./legacy/initialization";

export type {
  PlatformTenantEmployeeLite,
  PlatformTenantInitializationResult,
  PlatformTenantRecord,
  PlatformTenantRoleLite,
  PlatformTenantTemplateApplication,
  PlatformTenantUsageStats,
} from "./legacy/shared";

class PlatformTenantRepository {
  private client = SupabaseDB.getAdminClient();

  private from(table: string) {
    return (this.client as unknown as { from: (table: string) => any }).from(table);
  }

  list = list;
  findById = findById;
  findBySlug = findBySlug;
  create = create;
  findEmployeesByPhone = findEmployeesByPhone;
  initializeDefaultData = initializeDefaultData;
  update = update;
  updateStatus = updateStatus;
  getUsageStats = getUsageStats;
  getLatestTemplateApplication = getLatestTemplateApplication;
  findEmployeesByIds = findEmployeesByIds;
  findTenantAdminEmployees = findTenantAdminEmployees;
  findRolesByIds = findRolesByIds;
  listTenantRoles = listTenantRoles;
  private upsertDefaultDepartments = upsertDefaultDepartments;
  private upsertDefaultPosts = upsertDefaultPosts;
  private upsertDefaultRoles = upsertDefaultRoles;
  private grantAllPermissionsToRole = grantAllPermissionsToRole;
  private createTenantAdminEmployee = createTenantAdminEmployee;
  private findTenantDepartmentIdByCode = findTenantDepartmentIdByCode;
  private assignEmployeeRole = assignEmployeeRole;
  private recordTemplateApplication = recordTemplateApplication;
}

export const platformTenantRepository = new PlatformTenantRepository();
