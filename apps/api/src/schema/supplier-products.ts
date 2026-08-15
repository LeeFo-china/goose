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
const proxyReason = z.string().trim()
  .min(2, "请填写代录原因")
  .max(500, "代录原因不能超过 500 个字符");
const expectedVersion = z.coerce.number().int()
  .positive("版本号必须是正整数");
const keyword = z.string().trim().max(80, "关键词不能超过 80 个字符");
const hasBusinessUpdate = (input: Record<string, unknown>) =>
  Object.entries(input).some(
    ([key, value]) =>
      !["expected_version", "proxy_reason"].includes(key) &&
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
    supplier_id: uuid("无效的供应商 ID"),
    keyword: keyword.optional(),
    status: SupplierProductStatusSchema.optional(),
    category_id: uuid("无效的目录分类 ID").optional(),
    brand_id: uuid("无效的目录品牌 ID").optional(),
  }).strict();

export const PlatformSupplierProductScopeQuerySchema = z.object({
  supplierId: uuid("无效的供应商 ID"),
}).strict();

export const SupplierSkuListQuerySchema = PaginationQuerySchema.extend({
  keyword: keyword.optional(),
  status: SupplierSkuStatusSchema.optional(),
}).strict();

export const SupplierScopeQuerySchema = z.object({
  tenantSupplierId: uuid("无效的租户供应商关系 ID"),
}).strict();

export const SupplierSkuHttpListQuerySchema =
  SupplierSkuListQuerySchema.extend({
    tenantSupplierId: uuid("无效的租户供应商关系 ID"),
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
  proxy_reason: proxyReason.optional(),
}).strict();

export const SupplierProductUpdateSchema = z.object({
  expected_version: expectedVersion,
  product_code: productFields.product_code.optional(),
  name: productFields.name.optional(),
  category_id: productFields.category_id.optional(),
  brand_id: productFields.brand_id.optional(),
  description: productFields.description,
  proxy_reason: proxyReason.optional(),
}).strict().refine(hasBusinessUpdate, {
  message: "至少需要提交一个商品更新字段",
});

export const SupplierProductCommandSchema = z.object({
  expected_version: expectedVersion,
  proxy_reason: proxyReason.optional(),
}).strict();

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
};

const skuSpecValue = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.string()),
]);

const skuUnitConversion = z.object({
  from_unit_id: uuid("无效的换算来源单位 ID"),
  to_unit_id: uuid("无效的换算目标单位 ID"),
  factor: z.string().trim().min(1, "换算系数不能为空")
    .refine(
      (value) => /^\d+(?:\.\d+)?$/.test(value) && Number(value) > 0,
      "换算系数必须是不含指数的正十进制数",
    ),
}).strict();

export const SupplierSkuCreateSchema = z.object({
  ...skuFields,
  batch_managed: skuFields.batch_managed.default(false),
  color_managed: skuFields.color_managed.default(false),
  serial_managed: skuFields.serial_managed.default(false),
  spec_values: z.record(z.string(), skuSpecValue).optional(),
  unit_conversions: z.array(skuUnitConversion).optional(),
  proxy_reason: proxyReason.optional(),
}).strict();

export const SupplierSkuUpdateSchema = z.object({
  expected_version: expectedVersion,
  sku_code: skuFields.sku_code.optional(),
  name: skuFields.name.optional(),
  specification: skuFields.specification,
  model: skuFields.model,
  purchase_unit_id: skuFields.purchase_unit_id.optional(),
  batch_managed: skuFields.batch_managed.optional(),
  color_managed: skuFields.color_managed.optional(),
  serial_managed: skuFields.serial_managed.optional(),
  proxy_reason: proxyReason.optional(),
}).strict().refine(hasBusinessUpdate, {
  message: "至少需要提交一个 SKU 更新字段",
});

export type SupplierProductListQuery =
  z.infer<typeof SupplierProductListQuerySchema>;
export type PlatformSupplierProductListQuery =
  z.infer<typeof PlatformSupplierProductListQuerySchema>;
export type SupplierSkuListQuery =
  z.infer<typeof SupplierSkuListQuerySchema>;
export type SupplierProductCreateInput =
  z.infer<typeof SupplierProductCreateSchema>;
export type SupplierProductUpdateInput =
  z.infer<typeof SupplierProductUpdateSchema>;
export type SupplierProductCommandInput =
  z.infer<typeof SupplierProductCommandSchema>;
export type SupplierSkuCreateInput =
  z.infer<typeof SupplierSkuCreateSchema>;
export type SupplierSkuUpdateInput =
  z.infer<typeof SupplierSkuUpdateSchema>;
