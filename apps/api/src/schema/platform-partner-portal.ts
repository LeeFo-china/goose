import { PaginationQuerySchema } from "@/schema/request";
import { PlatformPartnerPhoneSchema } from "@/schema/platform-partner-phone";
import { z } from "zod";

export const PartnerAuthLoginSchema = z.object({
  code: z.string().trim().min(1, "缺少微信登录 code"),
}).strict();

export const PartnerAuthSendCodeSchema = z.object({
  phone: PlatformPartnerPhoneSchema,
}).strict();

const OptionalSmsCodeSchema = z.preprocess(
  (value) => {
    if (value === undefined || value === null) return undefined;
    if (typeof value === "string" && value.trim() === "") return undefined;
    return value;
  },
  z.string().trim().length(6, "验证码必须为 6 位").optional(),
);

export const PartnerAuthBindPhoneSchema = PartnerAuthSendCodeSchema.extend({
  code: z.string().trim().min(1, "缺少微信登录 code"),
  sms_code: OptionalSmsCodeSchema,
}).strict();

export const PartnerDashboardSummaryQuerySchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/, "月份格式必须为 YYYY-MM").optional(),
});

export const PartnerDashboardTenantListQuerySchema = PaginationQuerySchema.extend({
  status: z.enum(["active", "pending_transfer", "ended"]).optional(),
});

export const PartnerDashboardRevenueEventListQuerySchema =
  PaginationQuerySchema.extend({
    revenue_type: z.enum(["tenant_recharge", "lead_service_fee"]).optional(),
    status: z.enum([
      "pending",
      "confirmed",
      "refunded",
      "reversed",
      "blocked",
    ]).optional(),
    month: z.string().regex(/^\d{4}-\d{2}$/, "月份格式必须为 YYYY-MM").optional(),
  });

export const PartnerDashboardCommissionLedgerListQuerySchema =
  PaginationQuerySchema.extend({
    status: z.enum([
      "pending",
      "blocked",
      "available",
      "settling",
      "settled",
      "failed",
      "reversed",
    ]).optional(),
  });

export const PartnerDashboardSettlementListQuerySchema =
  PaginationQuerySchema.extend({
    status: z.enum(["draft", "reviewing", "paid", "canceled"]).optional(),
  });

export type PartnerAuthLoginInput = z.infer<typeof PartnerAuthLoginSchema>;
export type PartnerAuthSendCodeInput = z.infer<typeof PartnerAuthSendCodeSchema>;
export type PartnerAuthBindPhoneInput = z.infer<typeof PartnerAuthBindPhoneSchema>;
export type PartnerDashboardSummaryQuery =
  z.infer<typeof PartnerDashboardSummaryQuerySchema>;
export type PartnerDashboardTenantListQuery =
  z.infer<typeof PartnerDashboardTenantListQuerySchema>;
export type PartnerDashboardRevenueEventListQuery =
  z.infer<typeof PartnerDashboardRevenueEventListQuerySchema>;
export type PartnerDashboardCommissionLedgerListQuery =
  z.infer<typeof PartnerDashboardCommissionLedgerListQuerySchema>;
export type PartnerDashboardSettlementListQuery =
  z.infer<typeof PartnerDashboardSettlementListQuerySchema>;
