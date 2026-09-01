import { z } from "zod";

const uuid = (message: string) => z.uuid(message);
const requiredText = (
  max: number,
  emptyMessage: string,
  maxMessage: string,
) => z.string().trim().min(1, emptyMessage).max(max, maxMessage);
const optionalText = (max: number, message: string) =>
  z.string().trim().min(1, "字段不能为空").max(max, message)
    .nullable().optional();

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
    /^(?:0(?:\.\d{1,6})?|1(?:\.0{1,6})?)$/,
    "税率必须是 0 到 1 且最多 6 位小数的十进制数",
  );

const SupplierSpecValueSchema = z.union([
  z.string(),
  z.number().finite(),
  z.boolean(),
  z.array(z.string()),
]);

const skuFields = {
  name: requiredText(
    160,
    "SKU 名称不能为空",
    "SKU 名称不能超过 160 个字符",
  ),
  purchase_unit_id: uuid("无效的采购单位 ID"),
  specification: optionalText(240, "SKU 规格不能超过 240 个字符"),
  model: optionalText(160, "SKU 型号不能超过 160 个字符"),
  batch_managed: z.boolean(),
  color_managed: z.boolean(),
  serial_managed: z.boolean(),
  spec_values: z.record(z.string(), SupplierSpecValueSchema),
};

const SupplierPurchasableSkuCreateFieldsSchema = z.object({
  ...skuFields,
  batch_managed: skuFields.batch_managed.default(false),
  color_managed: skuFields.color_managed.default(false),
  serial_managed: skuFields.serial_managed.default(false),
  spec_values: skuFields.spec_values.default({}),
}).strict();

const SupplierPurchasableSkuUpdateFieldsSchema = z.object({
  expected_version: z.number().int().positive("SKU 版本号必须是正整数"),
  name: skuFields.name.optional(),
  purchase_unit_id: skuFields.purchase_unit_id.optional(),
  specification: skuFields.specification,
  model: skuFields.model,
  batch_managed: skuFields.batch_managed.optional(),
  color_managed: skuFields.color_managed.optional(),
  serial_managed: skuFields.serial_managed.optional(),
  spec_values: skuFields.spec_values.optional(),
}).strict();

const priceFields = {
  unit_price: unitPrice,
  tax_rate: taxRate,
  tax_inclusive: z.boolean().default(false),
};

const SupplierPurchasableSkuUpdatePriceSchema = z.object({
  ...priceFields,
  expected_price_list_id: uuid("无效的供应商价格簿 ID").nullable(),
  expected_price_list_version: z.number().int()
    .positive("价格簿版本号必须是正整数").nullable(),
}).strict().superRefine((price, context) => {
  const hasPriceListId = price.expected_price_list_id !== null;
  const hasPriceListVersion = price.expected_price_list_version !== null;

  if (hasPriceListId !== hasPriceListVersion) {
    const missingField = hasPriceListId
      ? "expected_price_list_version"
      : "expected_price_list_id";
    context.addIssue({
      code: "custom",
      message: "价格簿 ID 和版本号必须同时为空或同时提供",
      path: [missingField],
    });
  }
});

export const SupplierPurchasableSkuCreateSchema = z.object({
  sku: SupplierPurchasableSkuCreateFieldsSchema,
  price: z.object(priceFields).strict(),
}).strict();

export const SupplierPurchasableSkuUpdateSchema = z.object({
  sku: SupplierPurchasableSkuUpdateFieldsSchema,
  price: SupplierPurchasableSkuUpdatePriceSchema,
}).strict();

export const SupplierPurchasableSkuPriceParamSchema = z.object({
  productId: uuid("无效的供应商商品 ID"),
  skuId: uuid("无效的供应商 SKU ID"),
}).strict();

export const SupplierPurchasableSkuScopeQuerySchema = z.object({
  tenantSupplierId: uuid("无效的租户供应商关系 ID"),
}).strict();

export type SupplierPurchasableSkuCreateInput =
  z.infer<typeof SupplierPurchasableSkuCreateSchema>;
export type SupplierPurchasableSkuUpdateInput =
  z.infer<typeof SupplierPurchasableSkuUpdateSchema>;
