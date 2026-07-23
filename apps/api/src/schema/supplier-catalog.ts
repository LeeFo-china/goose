import { z } from "zod";

import type {
  SupplierCreateAuditContext,
  SupplierUpdateAuditContext,
} from "./platform-suppliers";
import { PaginationQuerySchema } from "./request";

const uuid = (message: string) => z.uuid(message);
const parseRequiredNumber = (value: unknown) => {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return value;

  const normalized = value.trim();
  if (!normalized) return value;

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : value;
};
const parseOptionalNumber = (value: unknown) =>
  typeof value === "string" && !value.trim()
    ? undefined
    : parseRequiredNumber(value);
const requiredNumber = (schema: z.ZodNumber) =>
  z.preprocess(parseRequiredNumber, schema);
const optionalNumber = (schema: z.ZodNumber) =>
  z.preprocess(parseOptionalNumber, schema.optional());
const expectedVersion = requiredNumber(
  z.number().int().positive("版本号必须是正整数"),
);
const keyword = z.string().trim().max(80, "关键词不能超过 80 个字符");
const requiredText = (
  max: number,
  emptyMessage: string,
  maxMessage: string,
) => z.string().trim().min(1, emptyMessage).max(max, maxMessage);
const optionalText = (max: number, message: string) =>
  z.string().trim().min(1, "字段不能为空").max(max, message).nullable().optional();
const hasUpdateField = (input: Record<string, unknown>) =>
  Object.entries(input).some(
    ([key, value]) => key !== "expected_version" && value !== undefined,
  );

export const CatalogStatusSchema = z.enum(["active", "inactive"], {
  message: "无效的目录状态",
});
const catalogCategoryLevel = z.number().int()
  .min(1, "目录分类层级不能小于 1")
  .max(6, "目录分类层级不能超过 6");
export const CatalogCategoryLevelSchema =
  requiredNumber(catalogCategoryLevel);

const catalogListFields = {
  keyword: keyword.optional(),
  status: CatalogStatusSchema.optional(),
};

export const CatalogCategoryListQuerySchema =
  PaginationQuerySchema.extend({
    ...catalogListFields,
    parent_id: uuid("无效的父目录分类 ID").nullable().optional(),
    level: optionalNumber(catalogCategoryLevel),
  }).strict();
export const CatalogBrandListQuerySchema = PaginationQuerySchema.extend(
  catalogListFields,
).strict();
export const CatalogUnitListQuerySchema = PaginationQuerySchema.extend({
  ...catalogListFields,
  base_unit_id: uuid("无效的基准单位 ID").nullable().optional(),
}).strict();

export const CatalogCategoryParamSchema = z.object({
  id: uuid("无效的目录分类 ID"),
}).strict();
export const CatalogBrandParamSchema = z.object({
  id: uuid("无效的目录品牌 ID"),
}).strict();
export const CatalogUnitParamSchema = z.object({
  id: uuid("无效的目录单位 ID"),
}).strict();

const categoryFields = {
  parent_id: uuid("无效的父目录分类 ID").nullable(),
  code: requiredText(64, "目录分类编码不能为空", "目录分类编码不能超过 64 个字符"),
  name: requiredText(120, "目录分类名称不能为空", "目录分类名称不能超过 120 个字符"),
  level: CatalogCategoryLevelSchema,
  status: CatalogStatusSchema,
  sort_order: z.number().int(),
};

export const CatalogCategoryCreateSchema = z.object({
  ...categoryFields,
  parent_id: categoryFields.parent_id.default(null),
  status: categoryFields.status.default("active"),
  sort_order: optionalNumber(categoryFields.sort_order).default(100),
}).strict();
export const CatalogCategoryUpdateSchema = z.object({
  expected_version: expectedVersion,
  parent_id: categoryFields.parent_id.optional(),
  code: categoryFields.code.optional(),
  name: categoryFields.name.optional(),
  level: optionalNumber(catalogCategoryLevel),
  status: categoryFields.status.optional(),
  sort_order: optionalNumber(categoryFields.sort_order),
}).strict().refine(hasUpdateField, {
  message: "至少需要提交一个目录分类更新字段",
});

const brandFields = {
  code: requiredText(64, "目录品牌编码不能为空", "目录品牌编码不能超过 64 个字符"),
  name: requiredText(120, "目录品牌名称不能为空", "目录品牌名称不能超过 120 个字符"),
  legal_name: optionalText(160, "品牌法定名称不能超过 160 个字符"),
  logo_file_id: uuid("无效的品牌 Logo 文件 ID").nullable().optional(),
  status: CatalogStatusSchema,
  sort_order: z.number().int(),
};

export const CatalogBrandCreateSchema = z.object({
  ...brandFields,
  status: brandFields.status.default("active"),
  sort_order: optionalNumber(brandFields.sort_order).default(100),
}).strict();
export const CatalogBrandUpdateSchema = z.object({
  expected_version: expectedVersion,
  code: brandFields.code.optional(),
  name: brandFields.name.optional(),
  legal_name: brandFields.legal_name,
  logo_file_id: brandFields.logo_file_id,
  status: brandFields.status.optional(),
  sort_order: optionalNumber(brandFields.sort_order),
}).strict().refine(hasUpdateField, {
  message: "至少需要提交一个目录品牌更新字段",
});

const decimalPattern = /^\d+(?:\.\d+)?$/;
const normalizeDecimal = (value: string) => {
  const [rawInteger = "", rawFraction = ""] = value.trim().split(".");
  const integer = rawInteger.replace(/^0+(?=\d)/, "");
  const fraction = rawFraction.replace(/0+$/, "");
  return fraction ? `${integer}.${fraction}` : integer;
};
const decimalString = z.string().trim().superRefine((value, context) => {
  if (!decimalPattern.test(value)) {
    context.addIssue({
      code: "custom",
      message: "单位换算系数必须是不含指数的十进制数",
    });
    return;
  }

  const [rawInteger = "", fraction = ""] = value.split(".");
  const integer = rawInteger.replace(/^0+(?=\d)/, "");
  if (integer.length > 12) {
    context.addIssue({
      code: "custom",
      message: "单位换算系数整数部分不能超过 12 位",
    });
  }
  if (fraction.length > 6) {
    context.addIssue({
      code: "custom",
      message: "单位换算系数最多保留 6 位小数",
    });
  }
  if (integer.length + fraction.length > 18) {
    context.addIssue({
      code: "custom",
      message: "单位换算系数总精度不能超过 18 位",
    });
  }
  if (!/[1-9]/.test(`${integer}${fraction}`)) {
    context.addIssue({
      code: "custom",
      message: "单位换算系数必须大于 0",
    });
  }
}).transform(normalizeDecimal);
const losslessDecimalNumber = z.number().refine((value) => {
  const text = value.toString();
  if (!decimalPattern.test(text)) return false;

  const [, fraction = ""] = text.split(".");
  const scale = 10 ** fraction.length;
  const scaled = value * scale;
  return Number.isSafeInteger(scaled) && scaled / scale === value;
}, "数字类型的单位换算系数无法无损转换，请改用十进制字符串")
  .transform((value) => value.toString())
  .pipe(decimalString);
const conversionFactor = z.union([decimalString, losslessDecimalNumber]);
const optionalConversionFactor = z.preprocess(
  (value) =>
    typeof value === "string" && !value.trim() ? undefined : value,
  conversionFactor.optional(),
);
const addUnitBaseIssue = (
  input: {
    base_unit_id?: string | null;
    conversion_factor?: string;
  },
  context: z.RefinementCtx,
) => {
  if (
    input.base_unit_id === null &&
    input.conversion_factor !== "1"
  ) {
    context.addIssue({
      code: "custom",
      path: ["conversion_factor"],
      message: "基准单位的换算系数必须为 1",
    });
  }
};

const unitFields = {
  code: requiredText(64, "目录单位编码不能为空", "目录单位编码不能超过 64 个字符"),
  name: requiredText(80, "目录单位名称不能为空", "目录单位名称不能超过 80 个字符"),
  symbol: requiredText(32, "目录单位符号不能为空", "目录单位符号不能超过 32 个字符"),
  base_unit_id: uuid("无效的基准单位 ID").nullable(),
  conversion_factor: conversionFactor,
  status: CatalogStatusSchema,
  sort_order: z.number().int(),
};

export const CatalogUnitCreateSchema = z.object({
  ...unitFields,
  base_unit_id: unitFields.base_unit_id.default(null),
  conversion_factor: optionalConversionFactor.default("1"),
  status: unitFields.status.default("active"),
  sort_order: optionalNumber(unitFields.sort_order).default(100),
}).strict().superRefine(addUnitBaseIssue);
export const CatalogUnitUpdateSchema = z.object({
  expected_version: expectedVersion,
  code: unitFields.code.optional(),
  name: unitFields.name.optional(),
  symbol: unitFields.symbol.optional(),
  base_unit_id: unitFields.base_unit_id.optional(),
  conversion_factor: optionalConversionFactor,
  status: unitFields.status.optional(),
  sort_order: optionalNumber(unitFields.sort_order),
}).strict().superRefine(addUnitBaseIssue).refine(hasUpdateField, {
  message: "至少需要提交一个目录单位更新字段",
});

export type CatalogCategoryListQuery =
  z.infer<typeof CatalogCategoryListQuerySchema>;
export type CatalogBrandListQuery =
  z.infer<typeof CatalogBrandListQuerySchema>;
export type CatalogUnitListQuery =
  z.infer<typeof CatalogUnitListQuerySchema>;
export type CatalogCategoryCreateRecord =
  z.infer<typeof CatalogCategoryCreateSchema> & SupplierCreateAuditContext;
export type CatalogCategoryUpdateRecord =
  z.infer<typeof CatalogCategoryUpdateSchema> & {
    category_id: string;
  } & SupplierUpdateAuditContext;
export type CatalogBrandCreateRecord =
  z.infer<typeof CatalogBrandCreateSchema> & SupplierCreateAuditContext;
export type CatalogBrandUpdateRecord =
  z.infer<typeof CatalogBrandUpdateSchema> & {
    brand_id: string;
  } & SupplierUpdateAuditContext;
export type CatalogUnitCreateRecord =
  z.infer<typeof CatalogUnitCreateSchema> & SupplierCreateAuditContext;
export type CatalogUnitUpdateRecord =
  z.infer<typeof CatalogUnitUpdateSchema> & {
    unit_id: string;
  } & SupplierUpdateAuditContext;
export type CatalogCategoryCreateInput =
  z.infer<typeof CatalogCategoryCreateSchema>;
export type CatalogCategoryUpdateInput =
  z.infer<typeof CatalogCategoryUpdateSchema>;
export type CatalogBrandCreateInput =
  z.infer<typeof CatalogBrandCreateSchema>;
export type CatalogBrandUpdateInput =
  z.infer<typeof CatalogBrandUpdateSchema>;
export type CatalogUnitCreateInput =
  z.infer<typeof CatalogUnitCreateSchema>;
export type CatalogUnitUpdateInput =
  z.infer<typeof CatalogUnitUpdateSchema>;
