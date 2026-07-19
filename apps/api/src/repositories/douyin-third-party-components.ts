import { z } from "zod";
import { AppError } from "@/errors/app-error";
import { Errors } from "@/errors/error-factory";
import { SupabaseDB } from "@/utils/supabase";

const COMPONENT_SELECT = [
  "component_appid",
  "component_ticket_ciphertext",
  "component_ticket_iv",
  "component_ticket_tag",
  "component_ticket_key_version",
  "component_ticket_received_at",
  "access_token_ciphertext",
  "access_token_iv",
  "access_token_tag",
  "access_token_key_version",
  "access_token_expires_at",
  "token_refresh_claim_token",
  "token_refresh_claim_expires_at",
].join(",");

const NullableString = z.string().nullable();
const ComponentRowSchema = z.object({
  component_appid: z.string().min(1),
  component_ticket_ciphertext: NullableString,
  component_ticket_iv: NullableString,
  component_ticket_tag: NullableString,
  component_ticket_key_version: NullableString,
  component_ticket_received_at: NullableString,
  access_token_ciphertext: NullableString,
  access_token_iv: NullableString,
  access_token_tag: NullableString,
  access_token_key_version: NullableString,
  access_token_expires_at: NullableString,
  token_refresh_claim_token: NullableString,
  token_refresh_claim_expires_at: NullableString,
});
const LeaseRowSchema = z.object({
  claim_token: z.string().uuid(),
  claim_expires_at: z.string().min(1),
});

export type DouyinComponentDatabaseResult = {
  readonly data: unknown;
  readonly error: unknown;
};

export interface DouyinComponentQuery {
  select(columns: string): DouyinComponentQuery;
  eq(column: string, value: unknown): DouyinComponentQuery;
  maybeSingle(): Promise<DouyinComponentDatabaseResult>;
}

export interface DouyinComponentDatabaseClient {
  from(table: string): DouyinComponentQuery;
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): PromiseLike<DouyinComponentDatabaseResult>;
}

export type DouyinThirdPartyComponentRecord = z.infer<typeof ComponentRowSchema>;

export type DouyinTokenEnvelopeInput = {
  readonly ciphertext: string;
  readonly iv: string;
  readonly tag: string;
  readonly keyVersion: string;
  readonly expiresAt: string;
};

export type DouyinRefreshLease = {
  readonly claimToken: string;
  readonly claimExpiresAt: string;
};

export class DouyinThirdPartyComponentsRepository {
  constructor(
    private readonly client: DouyinComponentDatabaseClient =
      SupabaseDB.getAdminClient() as unknown as DouyinComponentDatabaseClient,
  ) {}

  async findActive(componentAppId: string): Promise<DouyinThirdPartyComponentRecord | null> {
    return executeComponentOperation("查询抖音第三方组件失败", async () => {
      const result = await this.client
        .from("douyin_third_party_components")
        .select(COMPONENT_SELECT)
        .eq("component_appid", componentAppId)
        .eq("status", "active")
        .maybeSingle();
      assertDatabaseSuccess(result, "查询抖音第三方组件失败");
      if (result.data === null) return null;
      const parsed = ComponentRowSchema.safeParse(result.data);
      if (!parsed.success) throw invalidResponseError();
      return parsed.data;
    });
  }

  async claimAccessTokenRefresh(componentAppId: string): Promise<DouyinRefreshLease | null> {
    return executeComponentOperation("申领抖音组件凭证刷新租约失败", async () => {
      const result = await this.client.rpc("claim_douyin_component_token_refresh", {
        p_component_appid: componentAppId,
      });
      assertDatabaseSuccess(result, "申领抖音组件凭证刷新租约失败");
      return parseLease(result.data);
    });
  }

  async completeAccessTokenRefresh(input: {
    readonly componentAppId: string;
    readonly claimToken: string;
    readonly accessToken: DouyinTokenEnvelopeInput;
  }): Promise<boolean> {
    return executeComponentOperation("完成抖音组件凭证刷新失败", async () => {
      const result = await this.client.rpc("complete_douyin_component_token_refresh", {
        p_component_appid: input.componentAppId,
        p_claim_token: input.claimToken,
        p_access_token_ciphertext: input.accessToken.ciphertext,
        p_access_token_iv: input.accessToken.iv,
        p_access_token_tag: input.accessToken.tag,
        p_access_token_key_version: input.accessToken.keyVersion,
        p_access_token_expires_at: input.accessToken.expiresAt,
      });
      return parseBooleanResult(result, "完成抖音组件凭证刷新失败");
    });
  }

  async failAccessTokenRefresh(input: {
    readonly componentAppId: string;
    readonly claimToken: string;
    readonly errorCode: string;
  }): Promise<boolean> {
    return executeComponentOperation("标记抖音组件凭证刷新失败", async () => {
      const result = await this.client.rpc("fail_douyin_component_token_refresh", {
        p_component_appid: input.componentAppId,
        p_claim_token: input.claimToken,
        p_last_refresh_error_code: input.errorCode,
      });
      return parseBooleanResult(result, "标记抖音组件凭证刷新失败");
    });
  }
}

async function executeComponentOperation<Result>(
  message: string,
  operation: () => Promise<Result>,
): Promise<Result> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw Errors.business(500, message, "DOUYIN_COMPONENT_REPOSITORY_ERROR");
  }
}

function assertDatabaseSuccess(
  result: DouyinComponentDatabaseResult,
  message: string,
): void {
  if (result.error) {
    throw Errors.business(500, message, "DOUYIN_COMPONENT_REPOSITORY_ERROR");
  }
}

function parseLease(data: unknown): DouyinRefreshLease | null {
  if (!Array.isArray(data) || data.length > 1) throw invalidResponseError();
  const first: unknown = data[0];
  if (first === undefined) return null;
  const parsed = LeaseRowSchema.safeParse(first);
  if (!parsed.success) throw invalidResponseError();
  return {
    claimToken: parsed.data.claim_token,
    claimExpiresAt: parsed.data.claim_expires_at,
  };
}

function parseBooleanResult(
  result: DouyinComponentDatabaseResult,
  message: string,
): boolean {
  assertDatabaseSuccess(result, message);
  if (typeof result.data !== "boolean") throw invalidResponseError();
  return result.data;
}

function invalidResponseError() {
  return Errors.business(
    500,
    "抖音组件存储响应格式无效",
    "DOUYIN_COMPONENT_REPOSITORY_RESPONSE_INVALID",
  );
}
