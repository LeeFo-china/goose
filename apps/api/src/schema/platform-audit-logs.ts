import { PaginationQuerySchema } from "@/schema/request";
import { z } from "zod";

export const PlatformAuditLogActionSchema = z.enum([
  "tenant_create",
  "tenant_update",
  "tenant_suspend",
  "tenant_activate",
  "tenant_admin_create",
  "platform_lead_assign",
  "platform_device_access_view",
  "platform_device_sync",
  "platform_device_password_query",
  "platform_device_password_reset",
  "platform_device_cloud_delete",
  "platform_billing_recharge",
  "platform_billing_pricing_update",
  "platform_config_update",
  "wechat_rebind_approve",
  "wechat_rebind_reject",
]);

export const PlatformAuditLogStatusSchema = z.enum(["success", "failure"]);

export const PlatformAuditLogListQuerySchema = PaginationQuerySchema.extend({
  action: PlatformAuditLogActionSchema.optional(),
  status: PlatformAuditLogStatusSchema.optional(),
  target_tenant_id: z.uuid("无效的租户 ID").optional(),
  resource_type: z.string().trim().max(80, "资源类型不能超过 80 个字符").optional(),
  keyword: z.string().trim().max(80, "关键词不能超过 80 个字符").optional(),
});

export type PlatformAuditLogAction = z.infer<typeof PlatformAuditLogActionSchema>;
export type PlatformAuditLogStatus = z.infer<typeof PlatformAuditLogStatusSchema>;
export type PlatformAuditLogListQuery = z.infer<typeof PlatformAuditLogListQuerySchema>;
