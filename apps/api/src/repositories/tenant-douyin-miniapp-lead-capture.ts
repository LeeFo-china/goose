import { z } from "zod";

import { Errors } from "@/errors/error-factory";
import { TenantDouyinLeadCaptureConfigResponseSchema } from
  "@/schema/tenant-douyin-miniapp";
import { SupabaseDB } from "@/utils/supabase";

const RpcErrorSchema = z.strictObject({
  error: z.discriminatedUnion("code", [
    z.strictObject({ status_code: z.literal(400), code: z.enum([
      "DOUYIN_LEAD_CAPTURE_CONFIG_INVALID",
      "DOUYIN_CLUE_COMPONENT_ID_INVALID",
      "DOUYIN_CLUE_COMPONENT_ID_REQUIRED",
    ]) }),
    z.strictObject({ status_code: z.literal(404), code: z.literal(
      "DOUYIN_ACTIVE_INSTALLATION_NOT_FOUND",
    ) }),
    z.strictObject({ status_code: z.literal(409), code: z.enum([
      "DOUYIN_LEAD_CAPTURE_CONFIG_STALE",
      "DOUYIN_RUNTIME_CONFIG_INVALID",
    ]) }),
  ]),
});
const RpcSuccessSchema = z.strictObject({
  data: TenantDouyinLeadCaptureConfigResponseSchema,
});
const RpcEnvelopeSchema = z.union([RpcSuccessSchema, RpcErrorSchema]);

export type TenantDouyinLeadCaptureUpdateInput = {
  readonly tenantId: string;
  readonly installationId: string;
  readonly authorizerAppId: string;
  readonly expectedUpdatedAt: string;
  readonly enabled: boolean;
  readonly clueComponentId: string | null;
};

export type TenantDouyinLeadCaptureDatabaseClient = {
  rpc(name: "update_douyin_miniapp_lead_capture_config", args: {
    readonly p_tenant_id: string;
    readonly p_installation_id: string;
    readonly p_authorizer_appid: string;
    readonly p_expected_updated_at: string;
    readonly p_enabled: boolean;
    readonly p_clue_component_id: string | null;
  }): Promise<{ readonly data: unknown; readonly error: unknown }>;
};

export class TenantDouyinMiniappLeadCaptureRepository {
  constructor(
    private readonly client: TenantDouyinLeadCaptureDatabaseClient =
      SupabaseDB.getAdminClient() as unknown as
        TenantDouyinLeadCaptureDatabaseClient,
  ) {}

  async update(input: TenantDouyinLeadCaptureUpdateInput) {
    let result: Awaited<ReturnType<TenantDouyinLeadCaptureDatabaseClient["rpc"]>>;
    try {
      result = await this.client.rpc(
        "update_douyin_miniapp_lead_capture_config",
        {
          p_tenant_id: input.tenantId,
          p_installation_id: input.installationId,
          p_authorizer_appid: input.authorizerAppId,
          p_expected_updated_at: input.expectedUpdatedAt,
          p_enabled: input.enabled,
          p_clue_component_id: input.clueComponentId,
        },
      );
    } catch {
      throw databaseError();
    }
    if (result.error) throw databaseError();

    const parsed = RpcEnvelopeSchema.safeParse(result.data);
    if (!parsed.success) throw databaseError();
    if ("error" in parsed.data) throw businessError(parsed.data.error);
    const output = parsed.data.data;
    if (output.installation_id !== input.installationId
      || output.authorizer_appid !== input.authorizerAppId
      || output.enabled !== input.enabled) {
      throw databaseError();
    }
    return output;
  }
}

function businessError(error: z.infer<typeof RpcErrorSchema>["error"]) {
  const messages: Record<typeof error.code, string> = {
    DOUYIN_LEAD_CAPTURE_CONFIG_INVALID: "手机号留资配置参数无效",
    DOUYIN_CLUE_COMPONENT_ID_INVALID: "线索组件 ID 格式无效",
    DOUYIN_CLUE_COMPONENT_ID_REQUIRED: "请填写当前小程序的线索组件 ID",
    DOUYIN_ACTIVE_INSTALLATION_NOT_FOUND: "当前已授权小程序不存在",
    DOUYIN_LEAD_CAPTURE_CONFIG_STALE: "配置已更新，请刷新后重试",
    DOUYIN_RUNTIME_CONFIG_INVALID: "当前小程序运行配置无效",
  };
  return Errors.business(error.status_code, messages[error.code], error.code);
}

function databaseError() {
  return Errors.dbError("更新抖音手机号留资配置失败");
}

export const tenantDouyinMiniappLeadCaptureRepository =
  new TenantDouyinMiniappLeadCaptureRepository();
