import { z } from "zod";
import { AppError } from "@/errors/app-error";
import { Errors } from "@/errors/error-factory";
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
};

export interface DouyinInstallationQuery {
  select(columns: string): DouyinInstallationQuery;
  update(value: unknown): DouyinInstallationQuery;
  eq(column: string, value: unknown): DouyinInstallationQuery;
  in(column: string, values: readonly string[]): DouyinInstallationQuery;
  maybeSingle(): Promise<DouyinInstallationDatabaseResult>;
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

function invalidResponseError() {
  return Errors.business(
    500,
    "抖音授权存储响应格式无效",
    "DOUYIN_INSTALLATION_REPOSITORY_RESPONSE_INVALID",
  );
}
