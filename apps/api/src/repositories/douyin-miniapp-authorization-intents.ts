import { z } from "zod";

import { AppError } from "@/errors/app-error";
import { Errors } from "@/errors/error-factory";
import type { DouyinTokenEnvelopeInput } from "@/repositories/douyin-third-party-components";
import { SupabaseDB } from "@/utils/supabase";

const DateTimeSchema = z.iso.datetime({ offset: true });
const DigestSchema = z.string().regex(/^[0-9a-f]{64}$/);
const IntentRowSchema = z.strictObject({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  requested_by_employee_id: z.string().uuid(),
  component_appid: z.string().trim().min(1).max(128),
  intent_digest: DigestSchema,
  authorization_code_digest: DigestSchema.nullable(),
  authorizer_appid: z.string().trim().min(1).max(128).nullable(),
  status: z.enum([
    "pending",
    "completing",
    "completed",
    "expired",
    "failed",
  ]),
  expires_at: DateTimeSchema,
  completed_at: DateTimeSchema.nullable(),
  failure_code: z.string().regex(/^DOUYIN_[A-Z0-9_]{1,95}$/).nullable(),
  created_at: DateTimeSchema,
  updated_at: DateTimeSchema,
});
const ClaimRowSchema = z.strictObject({
  claim_state: z.enum(["completing", "completed"]),
  intent_id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  component_appid: z.string().trim().min(1).max(128),
  expires_at: DateTimeSchema,
  authorizer_appid: z.string().trim().min(1).max(128).nullable(),
});
const EventAuthorizerSchema = z.strictObject({
  authorizer_appid: z.string().trim().min(1).max(128),
});

export type AuthorizationIntentRecord = {
  readonly id: string;
  readonly tenantId: string;
  readonly requestedByEmployeeId: string;
  readonly componentAppId: string;
  readonly intentDigest: string;
  readonly authorizationCodeDigest: string | null;
  readonly authorizerAppId: string | null;
  readonly status:
    | "pending"
    | "completing"
    | "completed"
    | "expired"
    | "failed";
  readonly expiresAt: string;
  readonly completedAt: string | null;
  readonly failureCode: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type AuthorizationIntentClaim = {
  readonly state: "completing" | "completed";
  readonly intentId: string;
  readonly tenantId: string;
  readonly componentAppId: string;
  readonly expiresAt: string;
  readonly authorizerAppId: string | null;
};

export type CreateIntentInput = {
  readonly tenantId: string;
  readonly requestedByEmployeeId: string;
  readonly componentAppId: string;
  readonly intentDigest: string;
  readonly expiresAt: string;
};

export type CompleteIntentInput = {
  readonly intentId: string;
  readonly authorizationCodeDigest: string;
  readonly authorizerAppId: string;
  readonly deploymentKey: string;
  readonly runtimeConfig: unknown;
  readonly accessToken: DouyinTokenEnvelopeInput | null;
  readonly refreshToken: DouyinTokenEnvelopeInput | null;
  readonly permissions: readonly unknown[] | null;
};

export type AuthorizationIntentDatabaseResult = {
  readonly data: unknown;
  readonly error: unknown;
};

export interface AuthorizationIntentQuery {
  select(columns: string): AuthorizationIntentQuery;
  eq(column: string, value: unknown): AuthorizationIntentQuery;
  in(column: string, values: readonly string[]): AuthorizationIntentQuery;
  maybeSingle(): Promise<AuthorizationIntentDatabaseResult>;
}

export interface AuthorizationIntentDatabaseClient {
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): PromiseLike<AuthorizationIntentDatabaseResult>;
  from(table: string): AuthorizationIntentQuery;
}

export interface AuthorizationIntentRepositoryPort {
  create(input: CreateIntentInput): Promise<AuthorizationIntentRecord>;
  claim(input: {
    readonly intentDigest: string;
    readonly authorizationCodeDigest: string;
  }): Promise<AuthorizationIntentClaim>;
  complete(input: CompleteIntentInput): Promise<AuthorizationIntentRecord>;
  fail(input: {
    readonly intentId: string;
    readonly failureCode: string;
  }): Promise<void>;
  findAuthorizerByCodeDigest(codeDigest: string): Promise<string | null>;
}

export class DouyinMiniappAuthorizationIntentsRepository
implements AuthorizationIntentRepositoryPort {
  constructor(
    private readonly client: AuthorizationIntentDatabaseClient =
      SupabaseDB.getAdminClient() as unknown as
        AuthorizationIntentDatabaseClient,
  ) {}

  async create(input: CreateIntentInput): Promise<AuthorizationIntentRecord> {
    return this.intentRpc("create_tenant_douyin_authorization_intent", {
      p_tenant_id: input.tenantId,
      p_requested_by_employee_id: input.requestedByEmployeeId,
      p_component_appid: input.componentAppId,
      p_intent_digest: input.intentDigest,
      p_expires_at: input.expiresAt,
    });
  }

  async claim(input: {
    readonly intentDigest: string;
    readonly authorizationCodeDigest: string;
  }): Promise<AuthorizationIntentClaim> {
    const result = await this.execute(() =>
      this.client.rpc("claim_tenant_douyin_authorization_intent", {
        p_intent_digest: input.intentDigest,
        p_authorization_code_digest: input.authorizationCodeDigest,
      }));
    const rows = Array.isArray(result.data) ? result.data : [];
    const parsed = rows.length === 1
      ? ClaimRowSchema.safeParse(rows[0])
      : null;
    if (!parsed?.success) throw invalidResponseError();
    return {
      state: parsed.data.claim_state,
      intentId: parsed.data.intent_id,
      tenantId: parsed.data.tenant_id,
      componentAppId: parsed.data.component_appid,
      expiresAt: parsed.data.expires_at,
      authorizerAppId: parsed.data.authorizer_appid,
    };
  }

  async complete(
    input: CompleteIntentInput,
  ): Promise<AuthorizationIntentRecord> {
    return this.intentRpc(
      "complete_tenant_douyin_authorization_intent",
      {
        p_intent_id: input.intentId,
        p_authorization_code_digest: input.authorizationCodeDigest,
        p_authorizer_appid: input.authorizerAppId,
        p_deployment_key: input.deploymentKey,
        p_runtime_config: input.runtimeConfig,
        p_access_token_ciphertext: input.accessToken?.ciphertext ?? null,
        p_access_token_iv: input.accessToken?.iv ?? null,
        p_access_token_tag: input.accessToken?.tag ?? null,
        p_access_token_key_version: input.accessToken?.keyVersion ?? null,
        p_access_token_expires_at: input.accessToken?.expiresAt ?? null,
        p_refresh_token_ciphertext: input.refreshToken?.ciphertext ?? null,
        p_refresh_token_iv: input.refreshToken?.iv ?? null,
        p_refresh_token_tag: input.refreshToken?.tag ?? null,
        p_refresh_token_key_version: input.refreshToken?.keyVersion ?? null,
        p_refresh_token_expires_at: input.refreshToken?.expiresAt ?? null,
        p_permissions: input.permissions,
      },
    );
  }

  async fail(input: {
    readonly intentId: string;
    readonly failureCode: string;
  }): Promise<void> {
    const result = await this.execute(() =>
      this.client.rpc("fail_tenant_douyin_authorization_intent", {
        p_intent_id: input.intentId,
        p_failure_code: input.failureCode,
      }));
    if (typeof result.data !== "boolean") throw invalidResponseError();
  }

  async findAuthorizerByCodeDigest(
    codeDigest: string,
  ): Promise<string | null> {
    const result = await this.execute(() =>
      this.client.from("douyin_authorization_event_deliveries")
        .select("authorizer_appid")
        .eq("authorization_code_digest", codeDigest)
        .eq("processing_state", "completed")
        .in("event_name", ["AUTHORIZED", "UPDATE_AUTHORIZED"])
        .maybeSingle());
    if (result.data === null) return null;
    const parsed = EventAuthorizerSchema.safeParse(result.data);
    if (!parsed.success) throw invalidResponseError();
    return parsed.data.authorizer_appid;
  }

  private async intentRpc(
    name: string,
    args: Record<string, unknown>,
  ): Promise<AuthorizationIntentRecord> {
    const result = await this.execute(() => this.client.rpc(name, args));
    const parsed = IntentRowSchema.safeParse(result.data);
    if (!parsed.success) throw invalidResponseError();
    return mapIntent(parsed.data);
  }

  private async execute(
    operation: () => PromiseLike<AuthorizationIntentDatabaseResult>,
  ): Promise<AuthorizationIntentDatabaseResult> {
    try {
      const result = await operation();
      if (result.error) throw databaseError(result.error);
      return result;
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw repositoryError();
    }
  }
}

function mapIntent(
  row: z.infer<typeof IntentRowSchema>,
): AuthorizationIntentRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    requestedByEmployeeId: row.requested_by_employee_id,
    componentAppId: row.component_appid,
    intentDigest: row.intent_digest,
    authorizationCodeDigest: row.authorization_code_digest,
    authorizerAppId: row.authorizer_appid,
    status: row.status,
    expiresAt: row.expires_at,
    completedAt: row.completed_at,
    failureCode: row.failure_code,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function databaseError(error: unknown): AppError {
  const message = databaseErrorMessage(error);
  if (message === "DOUYIN_AUTHORIZATION_INTENT_NOT_FOUND") {
    return Errors.business(404, "抖音授权意图不存在", message);
  }
  if (message === "DOUYIN_AUTHORIZATION_INTENT_EXPIRED") {
    return Errors.business(410, "抖音授权意图已过期", message);
  }
  if (
    message === "DOUYIN_AUTHORIZATION_INTENT_CONFLICT"
    || message === "DOUYIN_AUTHORIZATION_INTENT_FAILED"
  ) {
    return Errors.business(409, "抖音授权意图状态冲突", message);
  }
  if (message === "DOUYIN_COMPONENT_NOT_ACTIVE") {
    return Errors.business(503, "抖音第三方组件未启用", message);
  }
  if (message === "DOUYIN_TENANT_NOT_ACTIVE") {
    return Errors.business(409, "租户不存在或未启用", message);
  }
  return repositoryError();
}

function databaseErrorMessage(error: unknown): string | undefined {
  if (
    typeof error !== "object"
    || error === null
    || !("message" in error)
  ) {
    return undefined;
  }
  return typeof error.message === "string" ? error.message : undefined;
}

function invalidResponseError(): AppError {
  return Errors.business(
    500,
    "抖音授权意图存储响应格式无效",
    "DOUYIN_AUTHORIZATION_INTENT_REPOSITORY_RESPONSE_INVALID",
  );
}

function repositoryError(): AppError {
  return Errors.business(
    500,
    "抖音授权意图存储失败",
    "DOUYIN_AUTHORIZATION_INTENT_REPOSITORY_ERROR",
  );
}

export const douyinMiniappAuthorizationIntentsRepository =
  new DouyinMiniappAuthorizationIntentsRepository();
