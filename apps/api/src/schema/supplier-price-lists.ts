import { SUPPLIER_PRICE_LIST_STATUS_VALUES } from "@gooes/domain";
import { z } from "zod";

import { PaginationQuerySchema } from "./request";

const uuid = (message: string) => z.uuid(message);
const requiredText = (
  max: number,
  emptyMessage: string,
  maxMessage: string,
) => z.string().trim().min(1, emptyMessage).max(max, maxMessage);
const legacyProxyReason = z.string().trim()
  .min(2, "请填写代录原因")
  .max(500, "代录原因不能超过 500 个字符")
  .optional();
const expectedVersion = z.coerce.number().int()
  .positive("版本号必须是正整数");
const dateTime = z.iso.datetime({
  offset: true,
  local: false,
  message: "价格生效时间格式无效",
});
const hasScale = (value: number, scale: number) => {
  const text = value.toString();
  if (/[eE]/.test(text)) return false;
  return (text.split(".")[1]?.length ?? 0) <= scale;
};
const money = z.number().finite().nonnegative("单价不能为负数")
  .max(999_999_999_999.99, "单价超过数据库上限")
  .refine((value) => hasScale(value, 2), "单价最多保留 2 位小数");
const taxRate = z.number().finite()
  .min(0, "税率不能为负数")
  .max(1, "税率不能超过 1")
  .refine((value) => hasScale(value, 6), "税率最多保留 6 位小数");
const hasBusinessUpdate = (input: Record<string, unknown>) =>
  Object.entries(input).some(
    ([key, value]) =>
      !["expected_version", "proxy_reason"].includes(key) &&
      value !== undefined,
  );
const validPeriod = (
  input: { effective_from?: string; effective_until?: string | null },
  context: z.RefinementCtx,
) => {
  if (
    input.effective_from &&
    input.effective_until &&
    Date.parse(input.effective_until) <= Date.parse(input.effective_from)
  ) {
    context.addIssue({
      code: "custom",
      path: ["effective_until"],
      message: "价格失效时间必须晚于生效时间",
    });
  }
};

export const SupplierPriceListStatusSchema = z.enum(
  SUPPLIER_PRICE_LIST_STATUS_VALUES,
  { message: "无效的价格簿状态" },
);

export const SupplierPriceListListQuerySchema =
  PaginationQuerySchema.extend({
    tenantSupplierId: uuid("无效的租户供应商关系 ID"),
    keyword: z.string().trim().max(80, "关键词不能超过 80 个字符")
      .optional(),
    lifecycle_status: SupplierPriceListStatusSchema.optional(),
  }).strict();

export const SupplierPriceItemListQuerySchema =
  PaginationQuerySchema.strict();

export const SupplierPriceScopeQuerySchema = z.object({
  tenantSupplierId: uuid("无效的租户供应商关系 ID"),
}).strict();

export const SupplierPriceItemHttpListQuerySchema =
  SupplierPriceItemListQuerySchema.extend({
    tenantSupplierId: uuid("无效的租户供应商关系 ID"),
  }).strict();

export const SupplierPriceListParamSchema = z.object({
  id: uuid("无效的供应商价格簿 ID"),
}).strict();

export const SupplierPriceItemParamSchema = z.object({
  id: uuid("无效的供应商价格簿 ID"),
  itemId: uuid("无效的供应商价格条目 ID"),
}).strict();

const priceListFields = {
  price_list_code: requiredText(
    80,
    "价格簿编码不能为空",
    "价格簿编码不能超过 80 个字符",
  ),
  name: requiredText(
    160,
    "价格簿名称不能为空",
    "价格簿名称不能超过 160 个字符",
  ),
  currency: z.string().regex(
    /^[A-Z]{3}$/,
    "币种必须是三个大写英文字母",
  ),
  effective_from: dateTime,
  effective_until: dateTime.nullable(),
};

export const SupplierPriceListCreateSchema = z.object({
  ...priceListFields,
  currency: priceListFields.currency.default("CNY"),
  effective_until: priceListFields.effective_until.default(null),
  proxy_reason: legacyProxyReason,
}).strict().superRefine(validPeriod)
  .transform(({ proxy_reason: _legacyProxyReason, ...input }) => input);

export const SupplierPriceListUpdateSchema = z.object({
  expected_version: expectedVersion,
  name: priceListFields.name.optional(),
  currency: priceListFields.currency.optional(),
  effective_from: priceListFields.effective_from.optional(),
  effective_until: priceListFields.effective_until.optional(),
  proxy_reason: legacyProxyReason,
}).strict().superRefine(validPeriod)
  .refine(hasBusinessUpdate, {
    message: "至少需要提交一个价格簿更新字段",
  })
  .transform(({ proxy_reason: _legacyProxyReason, ...input }) => input);

export const SupplierPriceListCommandSchema = z.object({
  expected_version: expectedVersion,
  proxy_reason: legacyProxyReason,
}).strict().transform(({ proxy_reason: _legacyProxyReason, ...input }) => input);

export const SupplierPriceListNewVersionSchema = z.object({
  expected_version: expectedVersion,
  new_price_list_id: uuid("无效的新价格簿 ID"),
  proxy_reason: legacyProxyReason,
}).strict().transform(({ proxy_reason: _legacyProxyReason, ...input }) => input);

export const SupplierPriceItemUpsertSchema = z.object({
  supplier_sku_id: uuid("无效的供应商 SKU ID"),
  minimum_quantity: z.literal(1).default(1),
  maximum_quantity: z.null().default(null),
  unit_price: money,
  tax_rate: taxRate,
  tax_inclusive: z.boolean(),
  expected_version: expectedVersion,
  proxy_reason: legacyProxyReason,
}).strict().transform(({ proxy_reason: _legacyProxyReason, ...input }) => input);

export const SupplierPriceItemDeleteSchema = z.object({
  expected_version: expectedVersion,
  proxy_reason: legacyProxyReason,
}).strict().transform(({ proxy_reason: _legacyProxyReason, ...input }) => input);

export type SupplierPriceListListQuery =
  z.infer<typeof SupplierPriceListListQuerySchema>;
export type SupplierPriceItemListQuery =
  z.infer<typeof SupplierPriceItemListQuerySchema>;
export type SupplierPriceListCreateInput =
  z.infer<typeof SupplierPriceListCreateSchema>;
export type SupplierPriceListUpdateInput =
  z.infer<typeof SupplierPriceListUpdateSchema>;
export type SupplierPriceListCommandInput =
  z.infer<typeof SupplierPriceListCommandSchema>;
export type SupplierPriceListNewVersionInput =
  z.infer<typeof SupplierPriceListNewVersionSchema>;
export type SupplierPriceItemUpsertInput =
  z.infer<typeof SupplierPriceItemUpsertSchema>;
export type SupplierPriceItemDeleteInput =
  z.infer<typeof SupplierPriceItemDeleteSchema>;
