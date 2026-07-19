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
import type { DouyinRefreshLease, DouyinTokenEnvelopeInput } from "./douyin-third-party-components";

const INSTALLATION_SELECT = [
  "id",
  "tenant_id",
  "component_appid",
  "authorizer_appid",
  "deployment_key",
  "installation_kind",
  "authorization_status",
  "access_token_ciphertext",
  "access_token_iv",
  "access_token_tag",
  "access_token_key_version",
  "access_token_expires_at",
  "refresh_token_ciphertext",
  "refresh_token_iv",
  "refresh_token_tag",
  "refresh_token_key_version",
  "refresh_token_expires_at",
  "permission_snapshot",
  "token_refresh_claim_token",
  "token_refresh_claim_expires_at",
].join(",");

const PLATFORM_INSTALLATION_SELECT = [
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

const NullableString = z.string().nullable();
const InstallationRowSchema = z.object({
  id: z.string().uuid(),
  tenant_id: NullableString,
  component_appid: z.string().min(1),
  authorizer_appid: z.string().min(1),
  deployment_key: NullableString,
  installation_kind: z.string().min(1),
  authorization_status: z.string().min(1),
  access_token_ciphertext: NullableString,
  access_token_iv: NullableString,
  access_token_tag: NullableString,
  access_token_key_version: NullableString,
  access_token_expires_at: NullableString,
  refresh_token_ciphertext: NullableString,
  refresh_token_iv: NullableString,
  refresh_token_tag: NullableString,
  refresh_token_key_version: NullableString,
  refresh_token_expires_at: NullableString,
  permission_snapshot: z.unknown(),
  token_refresh_claim_token: NullableString,
  token_refresh_claim_expires_at: NullableString,
});
const LeaseRowSchema = z.object({
  claim_token: z.string().uuid(),
  claim_expires_at: z.string().min(1),
});

export type DouyinInstallationDatabaseResult = {
  readonly data: unknown;
  readonly error: unknown;
  readonly count?: number | null;
};

export interface DouyinInstallationQuery {
  select(columns: string, options?: unknown): DouyinInstallationQuery;
  insert(value: unknown): DouyinInstallationQuery;
  update(value: unknown): DouyinInstallationQuery;
  eq(column: string, value: unknown): DouyinInstallationQuery;
  in(column: string, values: readonly string[]): DouyinInstallationQuery;
  order(column: string, options: unknown): DouyinInstallationQuery;
  range(from: number, to: number): DouyinInstallationQuery;
  maybeSingle(): Promise<DouyinInstallationDatabaseResult>;
  single(): Promise<DouyinInstallationDatabaseResult>;
  then<TResult1 = DouyinInstallationDatabaseResult, TResult2 = never>(
    onfulfilled?: ((value: DouyinInstallationDatabaseResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2>;
}

export interface DouyinInstallationDatabaseClient {
  from(table: string): DouyinInstallationQuery;
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): PromiseLike<DouyinInstallationDatabaseResult>;
}

export type DouyinMiniappInstallationRecord = z.infer<typeof InstallationRowSchema>;

type StringRefreshRotation = {
  readonly ciphertext: string;
  readonly iv: string;
  readonly tag: string;
  readonly keyVersion: string;
  readonly expiresAt: string;
};

type NullRefreshRotation = {
  readonly ciphertext: null;
  readonly iv: null;
  readonly tag: null;
  readonly keyVersion: null;
  readonly expiresAt: null;
};

export type AuthorizerRefreshRotation = StringRefreshRotation | NullRefreshRotation;

export class DouyinMiniappInstallationsRepository {
  constructor(
    private readonly client: DouyinInstallationDatabaseClient =
      SupabaseDB.getAdminClient() as unknown as DouyinInstallationDatabaseClient,
  ) {}

  async listForPlatform(
    query: PlatformDouyinMiniappListQuery,
  ): Promise<{ list: PlatformDouyinMiniappSafeRecord[]; total: number }> {
    return executeInstallationOperation("查询抖音小程序安装列表失败", async () => {
      const from = (query.page - 1) * query.pageSize;
      const to = from + query.pageSize - 1;
      const result = await this.client
        .from("douyin_miniapp_installations")
        .select(PLATFORM_INSTALLATION_SELECT, { count: "exact" })
        .order("updated_at", { ascending: false })
        .range(from, to);
      assertDatabaseSuccess(result, "查询抖音小程序安装列表失败");
      if (!Array.isArray(result.data)) throw invalidResponseError();
      return {
        list: result.data.map(parsePlatformInstallation),
        total: result.count ?? 0,
      };
    });
  }

  async findForPlatformById(
    installationId: string,
  ): Promise<PlatformDouyinMiniappSafeRecord | null> {
    return this.findPlatformInstallation("id", installationId);
  }

  async findForPlatformByAuthorizerAppId(
    authorizerAppId: string,
  ): Promise<PlatformDouyinMiniappSafeRecord | null> {
    return this.findPlatformInstallation("authorizer_appid", authorizerAppId);
  }

  async createTemplateDevelopment(input: {
    readonly componentAppId: string;
    readonly authorizerAppId: string;
    readonly tenantId: string;
    readonly runtimeConfig: DouyinRuntimeConfig;
  }): Promise<PlatformDouyinMiniappSafeRecord> {
    return executeInstallationOperation("创建抖音模板开发安装失败", async () => {
      const result = await this.client
        .from("douyin_miniapp_installations")
        .insert({
          component_appid: input.componentAppId,
          authorizer_appid: input.authorizerAppId,
          tenant_id: input.tenantId,
          installation_kind: "template_development",
          authorization_status: "active",
          runtime_config: input.runtimeConfig,
        })
        .select(PLATFORM_INSTALLATION_SELECT)
        .single();
      if (result.error && databaseErrorCode(result.error) === "23505") {
        throw Errors.business(
          409,
          "模板开发小程序已登记",
          "DOUYIN_TEMPLATE_INSTALLATION_CONFLICT",
        );
      }
      assertDatabaseSuccess(result, "创建抖音模板开发安装失败");
      return parsePlatformInstallation(result.data);
    });
  }

  async updateRuntimeConfig(
    installationId: string,
    runtimeConfig: DouyinRuntimeConfig,
  ): Promise<PlatformDouyinMiniappSafeRecord | null> {
    return this.updatePlatformInstallation(
      installationId,
      { runtime_config: runtimeConfig },
      ["active", "disabled"],
      "更新抖音小程序运行配置失败",
    );
  }

  async rotateDeploymentKey(
    installationId: string,
    deploymentKey: string,
  ): Promise<PlatformDouyinMiniappSafeRecord | null> {
    return executeInstallationOperation("轮换抖音小程序部署标识失败", async () => {
      const result = await this.client
        .from("douyin_miniapp_installations")
        .update({ deployment_key: deploymentKey })
        .eq("id", installationId)
        .eq("installation_kind", "merchant")
        .in("authorization_status", ["active"])
        .select(PLATFORM_INSTALLATION_SELECT)
        .maybeSingle();
      assertDatabaseSuccess(result, "轮换抖音小程序部署标识失败");
      return result.data === null ? null : parsePlatformInstallation(result.data);
    });
  }

  async transitionAuthorizationStatus(
    installationId: string,
    fromStatus: "active" | "disabled",
    toStatus: "active" | "disabled",
  ): Promise<PlatformDouyinMiniappSafeRecord | null> {
    return this.updatePlatformInstallation(
      installationId,
      { authorization_status: toStatus },
      [fromStatus],
      toStatus === "active" ? "启用抖音小程序安装失败" : "停用抖音小程序安装失败",
    );
  }

  async findActiveByAuthorizerAppId(
    authorizerAppId: string,
  ): Promise<DouyinMiniappInstallationRecord | null> {
    return executeInstallationOperation("查询抖音小程序授权失败", async () => {
      const result = await this.client
        .from("douyin_miniapp_installations")
        .select(INSTALLATION_SELECT)
        .eq("authorizer_appid", authorizerAppId)
        .in("authorization_status", ["authorized_unbound", "active"])
        .maybeSingle();
      return parseInstallationResult(result, "查询抖音小程序授权失败");
    });
  }

  async findActiveMerchant(
    authorizerAppId: string,
    deploymentKey: string,
  ): Promise<DouyinMiniappInstallationRecord | null> {
    return executeInstallationOperation("查询抖音商家小程序授权失败", async () => {
      const result = await this.client
        .from("douyin_miniapp_installations")
        .select(INSTALLATION_SELECT)
        .eq("authorizer_appid", authorizerAppId)
        .eq("deployment_key", deploymentKey)
        .eq("installation_kind", "merchant")
        .eq("authorization_status", "active")
        .maybeSingle();
      return parseInstallationResult(result, "查询抖音商家小程序授权失败");
    });
  }

  async bindActiveTenant(input: {
    readonly authorizerAppId: string;
    readonly tenantId: string;
    readonly deploymentKey: string;
    readonly runtimeConfig: unknown;
  }): Promise<DouyinMiniappInstallationRecord> {
    return executeInstallationOperation("绑定抖音小程序租户失败", async () => {
      const result = await this.client.rpc("bind_douyin_miniapp_installation", {
        p_authorizer_appid: input.authorizerAppId,
        p_tenant_id: input.tenantId,
        p_deployment_key: input.deploymentKey,
        p_runtime_config: input.runtimeConfig,
      });
      assertBindingSuccess(result);
      const installation = parseInstallationResult(result, "绑定抖音小程序租户失败");
      if (!installation) throw invalidResponseError();
      return installation;
    });
  }

  async claimAccessTokenRefresh(installationId: string): Promise<DouyinRefreshLease | null> {
    return executeInstallationOperation("申领抖音授权凭证刷新租约失败", async () => {
      const result = await this.client.rpc("claim_douyin_authorizer_token_refresh", {
        p_installation_id: installationId,
      });
      assertDatabaseSuccess(result, "申领抖音授权凭证刷新租约失败");
      return parseLease(result.data);
    });
  }

  async completeAccessTokenRefresh(input: {
    readonly installationId: string;
    readonly claimToken: string;
    readonly accessToken: DouyinTokenEnvelopeInput;
    readonly refreshToken: AuthorizerRefreshRotation;
  }): Promise<boolean> {
    return executeInstallationOperation("完成抖音授权凭证刷新失败", async () => {
      assertRefreshRotation(input.refreshToken);
      const result = await this.client.rpc("complete_douyin_authorizer_token_refresh", {
        p_installation_id: input.installationId,
        p_claim_token: input.claimToken,
        p_access_token_ciphertext: input.accessToken.ciphertext,
        p_access_token_iv: input.accessToken.iv,
        p_access_token_tag: input.accessToken.tag,
        p_access_token_key_version: input.accessToken.keyVersion,
        p_access_token_expires_at: input.accessToken.expiresAt,
        p_refresh_token_ciphertext: input.refreshToken.ciphertext,
        p_refresh_token_iv: input.refreshToken.iv,
        p_refresh_token_tag: input.refreshToken.tag,
        p_refresh_token_key_version: input.refreshToken.keyVersion,
        p_refresh_token_expires_at: input.refreshToken.expiresAt,
      });
      return parseBooleanResult(result, "完成抖音授权凭证刷新失败");
    });
  }

  async failAccessTokenRefresh(input: {
    readonly installationId: string;
    readonly claimToken: string;
    readonly errorCode: string;
  }): Promise<boolean> {
    return executeInstallationOperation("标记抖音授权凭证刷新失败", async () => {
      const result = await this.client.rpc("fail_douyin_authorizer_token_refresh", {
        p_installation_id: input.installationId,
        p_claim_token: input.claimToken,
        p_last_refresh_error_code: input.errorCode,
      });
      return parseBooleanResult(result, "标记抖音授权凭证刷新失败");
    });
  }

  private async findPlatformInstallation(
    column: "id" | "authorizer_appid",
    value: string,
  ): Promise<PlatformDouyinMiniappSafeRecord | null> {
    return executeInstallationOperation("查询抖音小程序安装失败", async () => {
      const result = await this.client
        .from("douyin_miniapp_installations")
        .select(PLATFORM_INSTALLATION_SELECT)
        .eq(column, value)
        .maybeSingle();
      assertDatabaseSuccess(result, "查询抖音小程序安装失败");
      return result.data === null ? null : parsePlatformInstallation(result.data);
    });
  }

  private async updatePlatformInstallation(
    installationId: string,
    patch: Record<string, unknown>,
    allowedStatuses: readonly string[],
    message: string,
  ): Promise<PlatformDouyinMiniappSafeRecord | null> {
    return executeInstallationOperation(message, async () => {
      const result = await this.client
        .from("douyin_miniapp_installations")
        .update(patch)
        .eq("id", installationId)
        .in("authorization_status", allowedStatuses)
        .select(PLATFORM_INSTALLATION_SELECT)
        .maybeSingle();
      assertDatabaseSuccess(result, message);
      return result.data === null ? null : parsePlatformInstallation(result.data);
    });
  }
}

function assertRefreshRotation(rotation: AuthorizerRefreshRotation): void {
  const values = [
    rotation.ciphertext,
    rotation.iv,
    rotation.tag,
    rotation.keyVersion,
    rotation.expiresAt,
  ];
  if (values.every((value) => value === null)) return;

  const stringsArePresent = values.every(
    (value) => typeof value === "string" && value.trim().length > 0,
  );
  if (
    stringsArePresent &&
    typeof rotation.expiresAt === "string" &&
    Number.isFinite(Date.parse(rotation.expiresAt))
  ) {
    return;
  }
  throw Errors.business(
    500,
    "抖音授权刷新凭证轮换参数无效",
    "DOUYIN_AUTHORIZER_REFRESH_ROTATION_INVALID",
  );
}

async function executeInstallationOperation<Result>(
  message: string,
  operation: () => Promise<Result>,
): Promise<Result> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw Errors.business(500, message, "DOUYIN_INSTALLATION_REPOSITORY_ERROR");
  }
}

function parseInstallationResult(
  result: DouyinInstallationDatabaseResult,
  message: string,
): DouyinMiniappInstallationRecord | null {
  assertDatabaseSuccess(result, message);
  if (result.data === null) return null;
  const parsed = InstallationRowSchema.safeParse(result.data);
  if (!parsed.success) throw invalidResponseError();
  return parsed.data;
}

function parsePlatformInstallation(data: unknown): PlatformDouyinMiniappSafeRecord {
  const parsed = PlatformDouyinMiniappSafeRecordSchema.safeParse(data);
  if (!parsed.success) throw invalidResponseError();
  return parsed.data;
}

function parseLease(data: unknown): DouyinRefreshLease | null {
  if (!Array.isArray(data) || data.length > 1) throw invalidResponseError();
  const first: unknown = data[0];
  if (first === undefined) return null;
  const parsed = LeaseRowSchema.safeParse(first);
  if (!parsed.success) throw invalidResponseError();
  return { claimToken: parsed.data.claim_token, claimExpiresAt: parsed.data.claim_expires_at };
}

function parseBooleanResult(
  result: DouyinInstallationDatabaseResult,
  message: string,
): boolean {
  assertDatabaseSuccess(result, message);
  if (typeof result.data !== "boolean") throw invalidResponseError();
  return result.data;
}

function assertDatabaseSuccess(
  result: DouyinInstallationDatabaseResult,
  message: string,
): void {
  if (result.error) {
    throw Errors.business(500, message, "DOUYIN_INSTALLATION_REPOSITORY_ERROR");
  }
}

function assertBindingSuccess(result: DouyinInstallationDatabaseResult): void {
  if (!result.error) return;
  const message = databaseErrorMessage(result.error);
  if (databaseErrorCode(result.error) === "23505") {
    throw Errors.business(409, "抖音小程序授权不可绑定", "DOUYIN_INSTALLATION_BIND_CONFLICT");
  }
  if (message === "DOUYIN_TENANT_NOT_ACTIVE") {
    throw Errors.business(409, "租户不存在或未启用", message);
  }
  if (message === "DOUYIN_INSTALLATION_BIND_CONFLICT") {
    throw Errors.business(409, "抖音小程序授权不可绑定", message);
  }
  throw Errors.business(500, "绑定抖音小程序租户失败", "DOUYIN_INSTALLATION_REPOSITORY_ERROR");
}

function databaseErrorMessage(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("message" in error)) return undefined;
  return typeof error.message === "string" ? error.message : undefined;
}

function databaseErrorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) return undefined;
  return typeof error.code === "string" ? error.code : undefined;
}

function invalidResponseError() {
  return Errors.business(
    500,
    "抖音授权存储响应格式无效",
    "DOUYIN_INSTALLATION_REPOSITORY_RESPONSE_INVALID",
  );
}
