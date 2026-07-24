import { Errors } from "@/errors/error-factory";
import type {
  WechatPayApplymentInsert,
  WechatPayApplymentRecord,
} from "@/repositories/wechat-pay-applyments";
import type { Json } from "@/types/database";
import { SupabaseDB } from "@/utils/supabase/index";

export async function createTenantWechatPayApplymentAtomically(input: {
  applyment: WechatPayApplymentInsert;
  auditMetadata: Json;
  findById: (input: {
    id: string;
    tenantId?: string;
  }) => Promise<WechatPayApplymentRecord | null>;
}): Promise<WechatPayApplymentRecord> {
  const { data, error } = await SupabaseDB.getAdminClient()
    .rpc("create_tenant_wechat_pay_applyment", {
      p_applyment: input.applyment as Json,
      p_audit_metadata: input.auditMetadata,
    });
  if (error) {
    if (
      error.code === "23505" ||
      error.message.includes("WECHAT_PAY_APPLYMENT_EXISTS")
    ) {
      throw Errors.business(
        409,
        "当前租户已有微信支付开通申请",
        "WECHAT_PAY_APPLYMENT_EXISTS",
      );
    }
    throw Errors.dbError("创建微信支付开通申请失败", error);
  }
  const applymentId = typeof data === "string" ? data : input.applyment.id;
  if (!applymentId) throw Errors.dbError("创建微信支付开通申请失败");
  const created = await input.findById({
    id: applymentId,
    tenantId: input.applyment.tenant_id,
  });
  if (!created) throw Errors.dbError("读取新建微信支付开通申请失败");
  return created;
}
