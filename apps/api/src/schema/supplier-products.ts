import {
  SUPPLIER_PRODUCT_STATUS_VALUES,
  SUPPLIER_SKU_STATUS_VALUES,
} from "@gooes/domain";
import { z } from "zod";

import { PaginationQuerySchema } from "./request";

const uuid = (message: string) => z.uuid(message);
const requiredText = (
  max: number,
  emptyMessage: string,
  maxMessage: string,
) => z.string().trim().min(1, emptyMessage).max(max, maxMessage);
const optionalText = (max: number, message: string) =>
  z.string().trim().min(1, "字段不能为空").max(max, message)
    .nullable().optional();
const expectedVersion = z.coerce.number().int()
  .positive("版本号必须是正整数");
const legacyProxyReason = z.string().trim()
  .min(2, "请填写代录原因")
  .max(500, "代录原因不能超过 500 个字符")
  .optional();
const keyword = z.string().trim().max(80, "关键词不能超过 80 个字符");
const hasBusinessUpdate = (input: Record<string, unknown>) =>
  Object.entries(input).some(
    ([key, value]) =>
      key !== "expected_version" &&
      value !== undefined,
  );

export const SupplierProductStatusSchema = z.enum(
  SUPPLIER_PRODUCT_STATUS_VALUES,
  { message: "无效的供应商商品状态" },
);
export const SupplierSkuStatusSchema = z.enum(
  SUPPLIER_SKU_STATUS_VALUES,
  { message: "无效的供应商 SKU 状态" },
);

export const SupplierProductListQuerySchema =
  PaginationQuerySchema.extend({
    tenantSupplierId: uuid("无效的租户供应商关系 ID"),
    keyword: keyword.optional(),
    status: SupplierProductStatusSchema.optional(),
    category_id: uuid("无效的目录分类 ID").optional(),
    brand_id: uuid("无效的目录品牌 ID").optional(),
  }).strict();

export const PlatformSupplierProductListQuerySchema =
  PaginationQuerySchema.extend({
    supplierId: uuid("无效的供应商 ID"),
    keyword: keyword.optional(),
    status: SupplierProductStatusSchema.optional(),
    category_id: uuid("无效的目录分类 ID").optional(),
    brand_id: uuid("无效的目录品牌 ID").optional(),
  }).strict();

export const SupplierSkuListQuerySchema = PaginationQuerySchema.extend({
  keyword: keyword.optional(),
  status: SupplierSkuStatusSchema.optional(),
}).strict();

export const SupplierScopeQuerySchema = z.object({
  tenantSupplierId: uuid("无效的租户供应商关系 ID"),
}).strict();

export const PlatformSupplierScopeQuerySchema = z.object({
  supplierId: uuid("无效的供应商 ID"),
}).strict();

export const SupplierSkuHttpListQuerySchema =
  SupplierSkuListQuerySchema.extend({
    tenantSupplierId: uuid("无效的租户供应商关系 ID"),
  }).strict();

export const PlatformSupplierSkuHttpListQuerySchema =
  SupplierSkuListQuerySchema.extend({
    supplierId: uuid("无效的供应商 ID"),
  }).strict();

export const SupplierProductParamSchema = z.object({
  id: uuid("无效的供应商商品 ID"),
}).strict();

export const SupplierSkuParamSchema = z.object({
  id: uuid("无效的供应商商品 ID"),
  skuId: uuid("无效的供应商 SKU ID"),
}).strict();

const productFields = {
  product_code: requiredText(
    80,
    "商品编码不能为空",
    "商品编码不能超过 80 个字符",
  ),
  name: requiredText(160, "商品名称不能为空", "商品名称不能超过 160 个字符"),
  category_id: uuid("无效的目录分类 ID"),
  brand_id: uuid("无效的目录品牌 ID"),
  description: optionalText(1000, "商品说明不能超过 1000 个字符"),
};

export const SupplierProductCreateSchema = z.object({
  ...productFields,
  product_code: productFields.product_code.optional(),
  proxy_reason: legacyProxyReason,
}).strict().transform(({ proxy_reason: _legacyProxyReason, ...input }) => input);

export const PlatformSupplierProductCreateSchema = z.object({
  ...productFields,
}).strict();

export const SupplierProductUpdateSchema = z.object({
  expected_version: expectedVersion,
  product_code: productFields.product_code.optional(),
  name: productFields.name.optional(),
  category_id: productFields.category_id.optional(),
  brand_id: productFields.brand_id.optional(),
  description: productFields.description,
}).strict().refine(hasBusinessUpdate, {
  message: "至少需要提交一个商品更新字段",
});

export const SupplierProductCommandSchema = z.object({
  expected_version: expectedVersion,
  proxy_reason: legacyProxyReason,
}).strict().transform(({ proxy_reason: _legacyProxyReason, ...input }) => input);

export const PlatformSupplierProductCommandSchema = z.object({
  expected_version: expectedVersion,
}).strict();

const SupplierSpecValueSchema = z.union([
  z.string(),
  z.number().finite(),
  z.boolean(),
  z.array(z.string()),
]);

const skuFields = {
  sku_code: requiredText(
    80,
    "SKU 编码不能为空",
    "SKU 编码不能超过 80 个字符",
  ),
  name: requiredText(160, "SKU 名称不能为空", "SKU 名称不能超过 160 个字符"),
  specification: optionalText(240, "SKU 规格不能超过 240 个字符"),
  model: optionalText(160, "SKU 型号不能超过 160 个字符"),
  purchase_unit_id: uuid("无效的采购单位 ID"),
  batch_managed: z.boolean(),
  color_managed: z.boolean(),
  serial_managed: z.boolean(),
  spec_values: z.record(z.string(), SupplierSpecValueSchema),
};

export const SupplierSkuCreateSchema = z.object({
  ...skuFields,
  sku_code: skuFields.sku_code.optional(),
  batch_managed: skuFields.batch_managed.default(false),
  color_managed: skuFields.color_managed.default(false),
  serial_managed: skuFields.serial_managed.default(false),
  spec_values: skuFields.spec_values.default({}),
  proxy_reason: legacyProxyReason,
}).strict().transform(({ proxy_reason: _legacyProxyReason, ...input }) => input);

export const PlatformSupplierSkuCreateSchema = z.object({
  ...skuFields,
  sku_code: skuFields.sku_code.optional(),
  batch_managed: skuFields.batch_managed.default(false),
  color_managed: skuFields.color_managed.default(false),
  serial_managed: skuFields.serial_managed.default(false),
  spec_values: skuFields.spec_values.default({}),
}).strict();

export const SupplierSkuUpdateSchema = z.object({
  expected_version: expectedVersion,
  sku_code: skuFields.sku_code.optional(),
  name: skuFields.name.optional(),
  specification: skuFields.specification,
  model: skuFields.model,
  batch_managed: skuFields.batch_managed.optional(),
  color_managed: skuFields.color_managed.optional(),
  serial_managed: skuFields.serial_managed.optional(),
  spec_values: skuFields.spec_values.optional(),
}).strict().refine(hasBusinessUpdate, {
  message: "至少需要提交一个 SKU 更新字段",
});

const positiveDecimal = z.string().trim()
  .regex(
    /^(?:0|[1-9]\d{0,11})(?:\.\d{1,6})?$/,
    "换算系数整数最多 12 位且小数最多 6 位",
  )
  .refine((value) => value !== "0" && !/^0\.0+$/.test(value), {
    message: "换算系数必须大于 0",
  });

const SupplierSkuUnitConversionSchema = z.object({
  from_unit_id: uuid("无效的源单位 ID"),
  to_unit_id: uuid("无效的目标单位 ID"),
  factor: positiveDecimal,
}).strict().refine(
  (conversion) => conversion.from_unit_id !== conversion.to_unit_id,
  { message: "单位换算不允许自环" },
);

export const SupplierSkuUnitConversionsReplaceSchema = z.object({
  expected_version: expectedVersion,
  purchase_unit_id: uuid("无效的采购单位 ID"),
  base_unit_id: uuid("无效的库存基础单位 ID"),
  conversions: z.array(SupplierSkuUnitConversionSchema).max(
    100,
    "单位换算不能超过 100 条",
  ),
}).strict();

export type SupplierProductListQuery =
  z.infer<typeof SupplierProductListQuerySchema>;
export type PlatformSupplierProductListQuery =
  z.infer<typeof PlatformSupplierProductListQuerySchema>;
export type SupplierSkuListQuery =
  z.infer<typeof SupplierSkuListQuerySchema>;
export type SupplierProductCreateInput =
  z.infer<typeof SupplierProductCreateSchema>;
export type PlatformSupplierProductCreateInput =
  z.infer<typeof PlatformSupplierProductCreateSchema>;
export type SupplierProductUpdateInput =
  z.infer<typeof SupplierProductUpdateSchema>;
export type SupplierProductCommandInput =
  z.infer<typeof SupplierProductCommandSchema>;
export type PlatformSupplierProductCommandInput =
  z.infer<typeof PlatformSupplierProductCommandSchema>;
export type SupplierSkuCreateInput =
  z.infer<typeof SupplierSkuCreateSchema>;
export type PlatformSupplierSkuCreateInput =
  z.infer<typeof PlatformSupplierSkuCreateSchema>;
export type SupplierSkuUpdateInput =
  z.infer<typeof SupplierSkuUpdateSchema>;
export type SupplierSkuUnitConversionsReplaceInput =
  z.infer<typeof SupplierSkuUnitConversionsReplaceSchema>;
