import { z } from "zod";
import {
  normalizeWechatPayQualificationType,
} from "@gooes/domain";

import { Errors } from "@/errors/error-factory";
import { SupabaseDB } from "@/utils/supabase/index";

export const WechatPaySettlementRuleSchema = z.object({
  id: z.uuid(),
  subject_type: z.enum([
    "SUBJECT_TYPE_ENTERPRISE",
    "SUBJECT_TYPE_INDIVIDUAL",
  ]),
  settlement_id: z.string(),
  qualification_type: z.string(),
  label: z.string(),
  rate_label: z.string(),
  settlement_cycle_label: z.string(),
  requires_special_qualification: z.boolean(),
  status: z.enum(["active", "inactive"]),
  sort_order: z.number().int(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export type WechatPaySettlementRuleRecord =
  z.infer<typeof WechatPaySettlementRuleSchema>;

export type WechatPaySettlementRuleListResult = {
  list: WechatPaySettlementRuleRecord[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

export type WechatPaySettlementRuleListInput = {
  page: number;
  pageSize: number;
  subject_type?: WechatPaySettlementRuleRecord["subject_type"];
};

export type FindWechatPaySettlementRuleInput = {
  subjectType: WechatPaySettlementRuleRecord["subject_type"];
  settlementId: string;
  qualificationType: string;
};

const RULE_SELECT = [
  "id",
  "subject_type",
  "settlement_id",
  "qualification_type",
  "label",
  "rate_label",
  "settlement_cycle_label",
  "requires_special_qualification",
  "status",
  "sort_order",
  "created_at",
  "updated_at",
].join(", ");

export class WechatPaySettlementRuleRepository {
  async listActive(
    input: WechatPaySettlementRuleListInput,
  ): Promise<WechatPaySettlementRuleListResult> {
    const pagination = normalizePagination(input);
    const start = (pagination.page - 1) * pagination.pageSize;
    const end = start + pagination.pageSize - 1;
    let request = SupabaseDB.getAdminClient()
      .from("wechat_pay_settlement_rules")
      .select(RULE_SELECT, { count: "exact" })
      .eq("status", "active");

    if (input.subject_type) {
      request = request.eq("subject_type", input.subject_type);
    }

    const { data, error, count } = await request
      .order("subject_type", { ascending: true })
      .order("sort_order", { ascending: true })
      .order("id", { ascending: true })
      .range(start, end);
    if (error) throw Errors.dbError("查询微信支付结算规则失败", error);

    const list = WechatPaySettlementRuleSchema.array().parse(data ?? []);
    return {
      list,
      pagination: {
        ...pagination,
        total: count ?? list.length,
        totalPages: count ? Math.ceil(count / pagination.pageSize) : 0,
      },
    };
  }

  async findActiveRule(
    input: FindWechatPaySettlementRuleInput,
  ): Promise<WechatPaySettlementRuleRecord | null> {
    const qualificationType = normalizeWechatPayQualificationType(
      input.qualificationType,
    );
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("wechat_pay_settlement_rules")
      .select(RULE_SELECT)
      .eq("status", "active")
      .eq("subject_type", input.subjectType)
      .eq("settlement_id", input.settlementId)
      .eq("qualification_type", qualificationType)
      .limit(1)
      .maybeSingle();
    if (error) throw Errors.dbError("查询微信支付结算规则失败", error);
    return data
      ? WechatPaySettlementRuleSchema.parse(data)
      : null;
  }
}

function normalizePagination(input: WechatPaySettlementRuleListInput) {
  const page = Number.isInteger(input.page) && input.page > 0
    ? input.page
    : 1;
  const pageSize = Number.isInteger(input.pageSize) && input.pageSize > 0
    ? Math.min(input.pageSize, 100)
    : 20;
  return { page, pageSize };
}

export const wechatPaySettlementRuleRepository =
  new WechatPaySettlementRuleRepository();
