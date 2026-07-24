import { Errors } from "@/errors/error-factory";
import type { Tables } from "@/types/db";
import { SupabaseDB } from "@/utils/supabase/index";

export type WechatPayApplymentAttachmentOwner = Pick<
  Tables<"tenant_wechat_pay_applyments">,
  "id" | "tenant_id" | "status"
>;

export async function findWechatPayApplymentAttachmentOwner(input: {
  fileObjectId: string;
  tenantId?: string;
}): Promise<WechatPayApplymentAttachmentOwner | null> {
  let request = SupabaseDB.getAdminClient()
    .from("tenant_wechat_pay_applyments")
    .select("id, tenant_id, status")
    .contains(
      "attachments",
      JSON.stringify([{ file_object_id: input.fileObjectId }]),
    );
  if (input.tenantId) request = request.eq("tenant_id", input.tenantId);
  const { data, error } = await request.limit(1).maybeSingle();
  if (error) {
    throw Errors.dbError("查询微信支付进件附件归属失败", error);
  }
  return (data as WechatPayApplymentAttachmentOwner | null) ?? null;
}
