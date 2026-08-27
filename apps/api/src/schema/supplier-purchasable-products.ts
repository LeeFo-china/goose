import { z } from "zod";

const uuid = (message: string) => z.uuid(message);
const requiredText = (
  max: number,
  emptyMessage: string,
  maxMessage: string,
) => z.string().trim().min(1, emptyMessage).max(max, maxMessage);

const unitPrice = z.string().trim()
  .regex(
    /^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/,
    "单价整数最多 12 位且小数最多 2 位",
  )
  .refine((value) => value !== "0" && !/^0\.0+$/.test(value), {
    message: "单价必须大于 0",
  });

const taxRate = z.string().trim()
  .regex(
    /^(?:0|1)(?:\.\d{1,6})?$/,
    "税率必须是不含指数且最多 6 位小数的十进制数",
  )
  .refine((value) => Number(value) <= 1, {
    message: "税率不能超过 1",
  });

const SupplierSpecValueSchema = z.union([
  z.string(),
  z.number().finite(),
  z.boolean(),
  z.array(z.string()),
]);

const SupplierPurchasableProductSchema = z.object({
  name: requiredText(
    160,
    "商品名称不能为空",
    "商品名称不能超过 160 个字符",
  ),
  category_id: uuid("无效的目录分类 ID"),
  brand_id: uuid("无效的目录品牌 ID"),
}).strict();

const SupplierPurchasableSkuSchema = z.object({
  name: requiredText(
    160,
    "SKU 名称不能为空",
    "SKU 名称不能超过 160 个字符",
  ),
  purchase_unit_id: uuid("无效的采购单位 ID"),
  spec_values: z.record(z.string(), SupplierSpecValueSchema),
}).strict();

const SupplierPurchasablePriceSchema = z.object({
  unit_price: unitPrice,
  tax_rate: taxRate,
  tax_inclusive: z.boolean(),
}).strict();

export const SupplierPurchasableProductParamSchema = z.object({
  id: uuid("无效的供应商商品 ID"),
}).strict();

export const SupplierPurchasableProductCreateSchema = z.object({
  sku_id: uuid("无效的供应商 SKU ID"),
  product: SupplierPurchasableProductSchema,
  sku: SupplierPurchasableSkuSchema,
  price: SupplierPurchasablePriceSchema,
}).strict();

export type SupplierPurchasableProductCreateInput =
  z.infer<typeof SupplierPurchasableProductCreateSchema>;
