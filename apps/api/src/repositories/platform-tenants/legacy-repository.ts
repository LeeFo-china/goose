import {
  SupabaseDB,
  type CreatePlatformTenantInput,
} from "./legacy/shared";
import {
  createWithDefaultTemplate as createWithDefaultTemplateCommand,
  type PlatformTenantRpc,
} from "./legacy/commands";
import { list, findById, findBySlug, update, updateStatus } from "./legacy/tenants";
import { getUsageStats, getLatestTemplateApplication } from "./legacy/usage";
import {
  findEmployeesByPhone,
  findEmployeesByIds,
  findTenantAdminEmployees,
  findRolesByIds,
  listTenantRoles,
} from "./legacy/members";

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

type PlatformTenantRpcResult = Awaited<ReturnType<PlatformTenantRpc>>;

export type PlatformTenantRpcClient = {
  rpc(
    functionName: string,
    args: Record<string, unknown>,
  ): PromiseLike<PlatformTenantRpcResult>;
};

export function createPlatformTenantRpcAdapter(
  client: PlatformTenantRpcClient,
): PlatformTenantRpc {
  return async (functionName, args) => {
    const { data, error } = await client.rpc(functionName, args);
    return { data, error };
  };
}

export type PlatformTenantCreateWithDefaultTemplateOptions = {
  readonly operatorEmployeeId: string | null;
};

class PlatformTenantRepository {
  private client = SupabaseDB.getAdminClient();

  private rpc = createPlatformTenantRpcAdapter(
    this.client as unknown as PlatformTenantRpcClient,
  );

  private from(table: string) {
    return (this.client as unknown as { from: (table: string) => any }).from(table);
  }

  list = list;
  findById = findById;
  findBySlug = findBySlug;
  createWithDefaultTemplate(
    input: CreatePlatformTenantInput,
    options: PlatformTenantCreateWithDefaultTemplateOptions,
  ) {
    return createWithDefaultTemplateCommand(
      this.rpc,
      input,
      options.operatorEmployeeId,
    );
  }
  findEmployeesByPhone = findEmployeesByPhone;
  update = update;
  updateStatus = updateStatus;
  getUsageStats = getUsageStats;
  getLatestTemplateApplication = getLatestTemplateApplication;
  findEmployeesByIds = findEmployeesByIds;
  findTenantAdminEmployees = findTenantAdminEmployees;
  findRolesByIds = findRolesByIds;
  listTenantRoles = listTenantRoles;
}

export const platformTenantRepository = new PlatformTenantRepository();
