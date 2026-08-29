import {
  SupabaseDB,
  type CreatePlatformTenantInput,
} from "./legacy/shared";
import {
  createWithDefaultTemplate as createWithDefaultTemplateCommand,
  type PlatformTenantRpc,
} from "./legacy/commands";
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
export type {
  PlatformTenantAtomicCreateResult,
  PlatformTenantRpc,
} from "./legacy/commands";

class PlatformTenantRepository {
  private client = SupabaseDB.getAdminClient();

  private rpc: PlatformTenantRpc = (functionName, args) =>
    (this.client as unknown as { rpc: PlatformTenantRpc })
      .rpc(functionName, args);

  private from(table: string) {
    return (this.client as unknown as { from: (table: string) => any }).from(table);
  }

  list = list;
  findById = findById;
  findBySlug = findBySlug;
  create = create;
  createWithDefaultTemplate(
    input: CreatePlatformTenantInput,
    operatorEmployeeId: string | null,
  ) {
    return createWithDefaultTemplateCommand(this.rpc, input, operatorEmployeeId);
  }
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
