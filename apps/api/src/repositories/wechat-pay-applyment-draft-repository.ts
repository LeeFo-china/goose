import { Errors } from "@/errors/error-factory";
import { throwTenantApplymentDraftUpdateError } from "@/repositories/wechat-pay-applyment-rpc-errors";
import type {
  WechatPayApplymentRecord,
  WechatPayApplymentUpdate,
} from "@/repositories/wechat-pay-applyments";
import type { Json } from "@/types/database";
import { SupabaseDB } from "@/utils/supabase/index";

export type WechatPayApplymentDraftUpdateInput = {
  applymentId: string;
  tenantId: string;
  employeeId: string;
  revision: number;
  patch: WechatPayApplymentUpdate;
};

export type WechatPayApplymentDraftUpdateResult = {
  outcome: "applied" | "stale";
  applyment: WechatPayApplymentRecord;
};

export async function updateTenantApplymentDraftAtomically(
  input: WechatPayApplymentDraftUpdateInput & {
    findById: (input: {
      id: string;
      tenantId: string;
    }) => Promise<WechatPayApplymentRecord | null>;
  },
): Promise<WechatPayApplymentDraftUpdateResult> {
  const { data, error } = await SupabaseDB.getAdminClient().rpc(
    "update_tenant_wechat_pay_applyment_draft",
    {
      p_applyment_id: input.applymentId,
      p_tenant_id: input.tenantId,
      p_employee_id: input.employeeId,
      p_revision: input.revision,
      p_patch: input.patch as Json,
    },
  );

  if (error) throwTenantApplymentDraftUpdateError(error);
  if (data !== "applied" && data !== "stale") {
    throw Errors.dbError("更新微信支付开通申请草稿失败");
  }
  const applyment = await input.findById({
    id: input.applymentId,
    tenantId: input.tenantId,
  });
  if (!applyment) {
    throw Errors.dbError("更新后查询微信支付开通申请草稿失败");
  }
  return { outcome: data, applyment };
}
