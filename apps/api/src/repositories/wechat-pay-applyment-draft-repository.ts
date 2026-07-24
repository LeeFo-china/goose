import { Errors } from "@/errors/error-factory";
import {
  throwTenantApplymentDraftSessionClaimError,
  throwTenantApplymentDraftUpdateError,
} from "@/repositories/wechat-pay-applyment-rpc-errors";
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
  epoch: number;
  revision: number;
  patch: WechatPayApplymentUpdate;
  auditMetadata: Json | null;
};

export type WechatPayApplymentDraftUpdateResult = {
  outcome: "applied" | "same_or_older_revision" | "stale_epoch";
  applyment: WechatPayApplymentRecord;
};

type FindApplymentById = (input: {
  id: string;
  tenantId: string;
}) => Promise<WechatPayApplymentRecord | null>;

export async function claimTenantApplymentDraftSession(input: {
  applymentId: string;
  tenantId: string;
  employeeId: string;
  findById: FindApplymentById;
}): Promise<WechatPayApplymentRecord> {
  const { data, error } = await SupabaseDB.getAdminClient().rpc(
    "claim_tenant_wechat_pay_applyment_draft_session",
    {
      p_applyment_id: input.applymentId,
      p_tenant_id: input.tenantId,
      p_employee_id: input.employeeId,
    },
  );
  if (error) throwTenantApplymentDraftSessionClaimError(error);
  const claimedEpoch = Number(data);
  if (!Number.isSafeInteger(claimedEpoch) || claimedEpoch <= 0) {
    throw Errors.dbError("认领微信支付开通申请草稿会话失败");
  }
  const applyment = await input.findById({
    id: input.applymentId,
    tenantId: input.tenantId,
  });
  if (!applyment) {
    throw Errors.dbError("认领后查询微信支付开通申请草稿失败");
  }
  return {
    ...applyment,
    draft_epoch: claimedEpoch,
    draft_revision: 0,
  };
}

export async function updateTenantApplymentDraftAtomically(
  input: WechatPayApplymentDraftUpdateInput & {
    findById: FindApplymentById;
  },
): Promise<WechatPayApplymentDraftUpdateResult> {
  const { data, error } = await SupabaseDB.getAdminClient().rpc(
    "update_tenant_wechat_pay_applyment_draft",
    {
      p_applyment_id: input.applymentId,
      p_tenant_id: input.tenantId,
      p_employee_id: input.employeeId,
      p_epoch: input.epoch,
      p_revision: input.revision,
      p_patch: input.patch as Json,
      p_audit_metadata: input.auditMetadata,
    },
  );

  if (error) throwTenantApplymentDraftUpdateError(error);
  if (
    data !== "applied" &&
    data !== "same_or_older_revision" &&
    data !== "stale_epoch"
  ) {
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
