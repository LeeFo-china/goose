import { z } from "zod";
import { AppError } from "@/errors/app-error";
import { Errors } from "@/errors/error-factory";
import {
  PlatformDouyinMiniappSafeRecordSchema,
  type DouyinRuntimeConfig,
  type PlatformDouyinMiniappListQuery,
  type PlatformDouyinMiniappSafeRecord,
} from "@/schema/platform-douyin-miniapps";
import { SupabaseDB } from "@/utils/supabase";

const SAFE_INSTALLATION_SELECT = [
  "id",
  "tenant_id",
  "component_appid",
  "authorizer_appid",
  "installation_kind",
  "authorization_status",
  "permission_snapshot",
  "runtime_config",
  "template_id",
  "template_version",
  "last_submitted_at",
  "last_audited_at",
  "last_released_at",
  "revoked_at",
  "created_at",
  "updated_at",
  "tenant:tenants(id,name,slug,status)",
].join(",");

const TenantStatusSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["active", "suspended", "archived"]),
});
const InstallationIdentitySchema = z.object({ id: z.string().uuid() });

export type PlatformDouyinMiniappsDatabaseResult = {
  readonly data: unknown;
  readonly error: unknown;
  readonly count?: number | null;
};

export interface PlatformDouyinMiniappsQuery {
  select(columns: string, options?: unknown): PlatformDouyinMiniappsQuery;
  update(value: unknown): PlatformDouyinMiniappsQuery;
  eq(column: string, value: unknown): PlatformDouyinMiniappsQuery;
  in(column: string, values: readonly string[]): PlatformDouyinMiniappsQuery;
  order(column: string, options: unknown): PlatformDouyinMiniappsQuery;
  range(from: number, to: number): PlatformDouyinMiniappsQuery;
  maybeSingle(): Promise<PlatformDouyinMiniappsDatabaseResult>;
  then<TResult1 = PlatformDouyinMiniappsDatabaseResult, TResult2 = never>(
    onfulfilled?: (
      (value: PlatformDouyinMiniappsDatabaseResult) => TResult1 | PromiseLike<TResult1>
    ) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2>;
}

export interface PlatformDouyinMiniappsDatabaseClient {
  from(table: string): PlatformDouyinMiniappsQuery;
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): PromiseLike<PlatformDouyinMiniappsDatabaseResult>;
}

export class PlatformDouyinMiniappsRepository {
  constructor(
    private readonly client: PlatformDouyinMiniappsDatabaseClient =
      SupabaseDB.getAdminClient() as unknown as PlatformDouyinMiniappsDatabaseClient,
  ) {}

  async list(
    query: PlatformDouyinMiniappListQuery,
  ): Promise<{ list: PlatformDouyinMiniappSafeRecord[]; total: number }> {
    return execute("查询抖音小程序安装列表失败", async () => {
      const from = (query.page - 1) * query.pageSize;
      const to = from + query.pageSize - 1;
      let databaseQuery = this.client
        .from("douyin_miniapp_installations")
        .select(SAFE_INSTALLATION_SELECT, { count: "exact" });
      if (query.installation_kind) {
        databaseQuery = databaseQuery.eq(
          "installation_kind",
          query.installation_kind,
        );
      }
      if (query.authorization_status) {
        databaseQuery = databaseQuery.eq(
          "authorization_status",
          query.authorization_status,
        );
      }
      const result = await databaseQuery
        .order("updated_at", { ascending: false })
        .range(from, to);
      assertSuccess(result, "查询抖音小程序安装列表失败");
      if (!Array.isArray(result.data)) throw invalidResponse();
      return { list: result.data.map(parseInstallation), total: result.count ?? 0 };
    });
  }

  async findById(installationId: string) {
    return this.findInstallation("id", installationId);
  }

  async findByAuthorizerAppId(authorizerAppId: string) {
    return this.findInstallation("authorizer_appid", authorizerAppId);
  }

  async findTenantStatusById(tenantId: string) {
    return execute("查询租户状态失败", async () => {
      const result = await this.client
        .from("tenants")
        .select("id,status")
        .eq("id", tenantId)
        .maybeSingle();
      assertSuccess(result, "查询租户状态失败");
      if (result.data === null) return null;
      const parsed = TenantStatusSchema.safeParse(result.data);
      if (!parsed.success) throw invalidResponse();
      return parsed.data;
    });
  }

  async createTemplateDevelopmentAtomically(input: {
    readonly componentAppId: string;
    readonly authorizerAppId: string;
    readonly tenantId: string;
    readonly runtimeConfig: DouyinRuntimeConfig;
  }) {
    return this.executeInstallationRpc(
      "create_douyin_template_development_installation",
      {
        p_component_appid: input.componentAppId,
        p_authorizer_appid: input.authorizerAppId,
        p_tenant_id: input.tenantId,
        p_runtime_config: input.runtimeConfig,
      },
      "创建抖音模板开发安装失败",
    );
  }

  async enableAtomically(installationId: string) {
    return this.executeInstallationRpc(
      "enable_douyin_miniapp_installation",
      { p_installation_id: installationId },
      "启用抖音小程序安装失败",
    );
  }

  async updateRuntimeConfig(installationId: string, runtimeConfig: DouyinRuntimeConfig) {
    return this.updateInstallation(
      installationId,
      { runtime_config: runtimeConfig },
      ["active", "disabled"],
      "更新抖音小程序运行配置失败",
    );
  }

  async rotateDeploymentKey(installationId: string, deploymentKey: string) {
    return execute("轮换抖音小程序部署标识失败", async () => {
      const result = await this.client
        .from("douyin_miniapp_installations")
        .update({ deployment_key: deploymentKey })
        .eq("id", installationId)
        .eq("installation_kind", "merchant")
        .in("authorization_status", ["active"])
        .select(SAFE_INSTALLATION_SELECT)
        .maybeSingle();
      assertSuccess(result, "轮换抖音小程序部署标识失败");
      return result.data === null ? null : parseInstallation(result.data);
    });
  }

  async disable(installationId: string) {
    return this.updateInstallation(
      installationId,
      { authorization_status: "disabled" },
      ["active"],
      "停用抖音小程序安装失败",
    );
  }

  private async findInstallation(column: "id" | "authorizer_appid", value: string) {
    return execute("查询抖音小程序安装失败", async () => {
      const result = await this.client
        .from("douyin_miniapp_installations")
        .select(SAFE_INSTALLATION_SELECT)
        .eq(column, value)
        .maybeSingle();
      assertSuccess(result, "查询抖音小程序安装失败");
      return result.data === null ? null : parseInstallation(result.data);
    });
  }

  private async updateInstallation(
    installationId: string,
    patch: Record<string, unknown>,
    statuses: readonly string[],
    message: string,
  ) {
    return execute(message, async () => {
      const result = await this.client
        .from("douyin_miniapp_installations")
        .update(patch)
        .eq("id", installationId)
        .in("authorization_status", statuses)
        .select(SAFE_INSTALLATION_SELECT)
        .maybeSingle();
      assertSuccess(result, message);
      return result.data === null ? null : parseInstallation(result.data);
    });
  }

  private async executeInstallationRpc(
    name: string,
    args: Record<string, unknown>,
    message: string,
  ) {
    return execute(message, async () => {
      const result = await this.client.rpc(name, args);
      assertSuccess(result, message);
      const identity = InstallationIdentitySchema.safeParse(result.data);
      if (!identity.success) throw invalidResponse();
      const installation = await this.findById(identity.data.id);
      if (!installation) throw invalidResponse();
      return installation;
    });
  }
}

async function execute<Result>(message: string, operation: () => Promise<Result>) {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw Errors.business(500, message, "DOUYIN_PLATFORM_MINIAPP_REPOSITORY_ERROR");
  }
}

function assertSuccess(result: PlatformDouyinMiniappsDatabaseResult, message: string) {
  if (!result.error) return;
  const code = databaseErrorMessage(result.error);
  if (code && BUSINESS_ERROR_CODES.has(code)) {
    throw Errors.business(409, businessErrorMessage(code), code);
  }
  throw Errors.business(500, message, "DOUYIN_PLATFORM_MINIAPP_REPOSITORY_ERROR");
}

const BUSINESS_ERROR_CODES = new Set([
  "DOUYIN_COMPONENT_NOT_ACTIVE",
  "DOUYIN_TENANT_NOT_ACTIVE",
  "DOUYIN_INSTALLATION_STATE_CONFLICT",
  "DOUYIN_TEMPLATE_INSTALLATION_CONFLICT",
]);

function businessErrorMessage(code: string): string {
  if (code === "DOUYIN_COMPONENT_NOT_ACTIVE") return "抖音第三方组件未启用";
  if (code === "DOUYIN_TENANT_NOT_ACTIVE") return "租户不存在或未启用";
  if (code === "DOUYIN_TEMPLATE_INSTALLATION_CONFLICT") return "模板开发小程序登记冲突";
  return "抖音小程序安装当前状态不允许此操作";
}

function databaseErrorMessage(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("message" in error)) return null;
  return typeof error.message === "string" ? error.message : null;
}

function parseInstallation(data: unknown): PlatformDouyinMiniappSafeRecord {
  const parsed = PlatformDouyinMiniappSafeRecordSchema.safeParse(data);
  if (!parsed.success) throw invalidResponse();
  return parsed.data;
}

function invalidResponse() {
  return Errors.business(
    500,
    "抖音小程序安装数据格式无效",
    "DOUYIN_INSTALLATION_REPOSITORY_RESPONSE_INVALID",
  );
}

export const platformDouyinMiniappsRepository = new PlatformDouyinMiniappsRepository();
