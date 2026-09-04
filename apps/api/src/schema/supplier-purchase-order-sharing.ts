import { z } from "zod";

const uuid = (message: string) => z.uuid(message);
const optionalTrimmedText = (maximum: number, field: string) =>
  z.string().trim()
    .max(maximum, `${field}不能超过 ${maximum} 个字符`)
    .nullable()
    .optional();

export const SupplierPurchaseOrderPublicTokenParamSchema = z.object({
  token: z.string().trim()
    .regex(/^pos_[A-Za-z0-9_-]{32,}$/, "无效的采购单分享 token"),
}).strict();

export const SupplierPurchaseOrderShareLinkCreateSchema = z.object({
  expires_at: z.iso.datetime({
    offset: true,
    message: "过期时间格式无效",
  }).nullable().optional(),
}).strict();

export const SupplierPurchaseOrderPublicConfirmViewSchema = z.object({
  confirmed_at: z.iso.datetime({
    offset: true,
    message: "确认时间格式无效",
  }),
  remark: optionalTrimmedText(500, "确认备注"),
}).strict();

export const SupplierPurchaseOrderExportParamSchema = z.object({
  id: uuid("无效的供应商采购单 ID"),
}).strict();

export type SupplierPurchaseOrderPublicTokenParam =
  z.infer<typeof SupplierPurchaseOrderPublicTokenParamSchema>;
export type SupplierPurchaseOrderShareLinkCreateInput =
  z.infer<typeof SupplierPurchaseOrderShareLinkCreateSchema>;
export type SupplierPurchaseOrderPublicConfirmViewInput =
  z.infer<typeof SupplierPurchaseOrderPublicConfirmViewSchema>;
