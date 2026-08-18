import { CATALOG_SPEC_VALUE_TYPE_VALUES } from "@gooes/domain";
import { z } from "zod";

import { PaginationQuerySchema } from "./request";

const uuid = (message: string) => z.uuid(message);
const text = (max: number, empty: string, tooLong: string) =>
  z.string().trim().min(1, empty).max(max, tooLong);
const nullableText = (max: number, tooLong: string) =>
  z.string().trim().min(1, "字段不能为空").max(max, tooLong)
    .nullable().optional();
const expectedVersion = z.coerce.number().int().positive("版本号必须是正整数");
const status = z.enum(["active", "inactive"], { message: "无效的目录状态" });
const hasPatch = (input: Record<string, unknown>) =>
  Object.entries(input).some(
    ([key, value]) => key !== "expected_version" && value !== undefined,
  );

const tenantCategoryFields = {
  parent_id: uuid("无效的父目录分类 ID").nullable(),
  code: text(64, "目录分类编码不能为空", "目录分类编码不能超过 64 个字符"),
  name: text(120, "目录分类名称不能为空", "目录分类名称不能超过 120 个字符"),
  status,
  sort_order: z.coerce.number().int(),
  mapped_platform_category_id:
    uuid("无效的平台目录分类 ID").nullable(),
};

export const TenantCatalogCategoryCreateSchema = z.object({
  ...tenantCategoryFields,
  parent_id: tenantCategoryFields.parent_id.default(null),
  status: status.default("active"),
  sort_order: tenantCategoryFields.sort_order.default(100),
  mapped_platform_category_id:
    tenantCategoryFields.mapped_platform_category_id.default(null),
}).strict();

export const TenantCatalogCategoryUpdateSchema = z.object({
  expected_version: expectedVersion,
  parent_id: tenantCategoryFields.parent_id.optional(),
  code: tenantCategoryFields.code.optional(),
  name: tenantCategoryFields.name.optional(),
  status: status.optional(),
  sort_order: tenantCategoryFields.sort_order.optional(),
  mapped_platform_category_id:
    tenantCategoryFields.mapped_platform_category_id.optional(),
}).strict().refine(hasPatch, {
  message: "至少需要提交一个目录分类更新字段",
});

const tenantBrandFields = {
  code: text(64, "目录品牌编码不能为空", "目录品牌编码不能超过 64 个字符"),
  name: text(120, "目录品牌名称不能为空", "目录品牌名称不能超过 120 个字符"),
  legal_name: nullableText(160, "品牌法定名称不能超过 160 个字符"),
  logo_file_id: uuid("无效的品牌 Logo 文件 ID").nullable().optional(),
  status,
  sort_order: z.coerce.number().int(),
  mapped_platform_brand_id: uuid("无效的平台品牌 ID").nullable(),
};

export const TenantCatalogBrandCreateSchema = z.object({
  ...tenantBrandFields,
  status: status.default("active"),
  sort_order: tenantBrandFields.sort_order.default(100),
  mapped_platform_brand_id:
    tenantBrandFields.mapped_platform_brand_id.default(null),
}).strict();

export const TenantCatalogBrandUpdateSchema = z.object({
  expected_version: expectedVersion,
  code: tenantBrandFields.code.optional(),
  name: tenantBrandFields.name.optional(),
  legal_name: tenantBrandFields.legal_name,
  logo_file_id: tenantBrandFields.logo_file_id,
  status: status.optional(),
  sort_order: tenantBrandFields.sort_order.optional(),
  mapped_platform_brand_id:
    tenantBrandFields.mapped_platform_brand_id.optional(),
}).strict().refine(hasPatch, {
  message: "至少需要提交一个目录品牌更新字段",
});

export const CatalogSpecDefinitionListQuerySchema =
  PaginationQuerySchema.extend({ status: status.optional() }).strict();

const enumOption = text(120, "枚举选项不能为空", "枚举选项不能超过 120 个字符");
const specFields = {
  code: text(64, "规格编码不能为空", "规格编码不能超过 64 个字符"),
  name: text(120, "规格名称不能为空", "规格名称不能超过 120 个字符"),
  value_type: z.enum(CATALOG_SPEC_VALUE_TYPE_VALUES, {
    message: "无效的规格值类型",
  }),
  enum_options: z.array(enumOption).max(100, "枚举选项不能超过 100 个"),
  unit_dimension: nullableText(64, "规格计量维度不能超过 64 个字符"),
  is_required: z.boolean(),
  participates_in_sku_name: z.boolean(),
  is_filterable: z.boolean(),
  sort_order: z.coerce.number().int(),
  status,
};

function validateSpec(
  input: { value_type?: string; enum_options?: string[]; unit_dimension?: string | null },
  context: z.RefinementCtx,
) {
  const options = input.enum_options ?? [];
  const isEnum = input.value_type === "single_enum" ||
    input.value_type === "multi_enum";
  if (isEnum && options.length === 0) {
    context.addIssue({
      code: "custom",
      path: ["enum_options"],
      message: "枚举规格必须提供选项",
    });
  }
  if (!isEnum && options.length > 0) {
    context.addIssue({
      code: "custom",
      path: ["enum_options"],
      message: "非枚举规格不能提供选项",
    });
  }
  if (new Set(options).size !== options.length) {
    context.addIssue({
      code: "custom",
      path: ["enum_options"],
      message: "枚举选项不能重复",
    });
  }
  if (input.value_type !== "number" && input.unit_dimension != null) {
    context.addIssue({
      code: "custom",
      path: ["unit_dimension"],
      message: "只有数值规格可以设置计量维度",
    });
  }
}

export const CatalogSpecDefinitionCreateSchema = z.object({
  ...specFields,
  enum_options: specFields.enum_options.default([]),
  unit_dimension: specFields.unit_dimension.default(null),
  is_required: specFields.is_required.default(false),
  participates_in_sku_name: specFields.participates_in_sku_name.default(false),
  is_filterable: specFields.is_filterable.default(false),
  sort_order: specFields.sort_order.default(100),
  status: status.default("active"),
}).strict().superRefine(validateSpec);

export const CatalogSpecDefinitionUpdateSchema = z.object({
  expected_version: expectedVersion,
  code: specFields.code.optional(),
  name: specFields.name.optional(),
  value_type: specFields.value_type.optional(),
  enum_options: specFields.enum_options.optional(),
  unit_dimension: specFields.unit_dimension,
  is_required: specFields.is_required.optional(),
  participates_in_sku_name: specFields.participates_in_sku_name.optional(),
  is_filterable: specFields.is_filterable.optional(),
  sort_order: specFields.sort_order.optional(),
  status: status.optional(),
}).strict().superRefine(validateSpec).refine(hasPatch, {
  message: "至少需要提交一个规格定义更新字段",
});

export const CatalogSpecDefinitionParamSchema = z.object({
  id: uuid("无效的目录分类 ID"),
  definitionId: uuid("无效的规格定义 ID"),
}).strict();

export const CopyPlatformSpecDefinitionsSchema = z.object({
  platform_category_id: uuid("无效的平台目录分类 ID"),
  expected_version: expectedVersion,
}).strict();

export const CatalogUnitSuggestionStatusSchema = z.enum([
  "submitted", "approved", "rejected",
]);
export const CatalogUnitSuggestionListQuerySchema =
  PaginationQuerySchema.extend({
    status: CatalogUnitSuggestionStatusSchema.optional(),
  }).strict();
export const PlatformCatalogUnitSuggestionListQuerySchema =
  CatalogUnitSuggestionListQuerySchema.extend({
    tenant_id: uuid("无效的租户 ID").optional(),
  }).strict();

export const CatalogUnitSuggestionCreateSchema = z.object({
  suggested_code: z.string().trim().toUpperCase()
    .regex(/^[A-Z0-9_-]{2,64}$/, "单位建议编码格式无效"),
  suggested_name: text(80, "单位建议名称不能为空", "单位建议名称不能超过 80 个字符"),
  suggested_symbol: text(32, "单位建议符号不能为空", "单位建议符号不能超过 32 个字符"),
  unit_dimension: text(64, "单位建议计量维度不能为空", "单位建议计量维度不能超过 64 个字符"),
  reason: nullableText(500, "单位建议原因不能超过 500 个字符"),
}).strict();

export const CatalogUnitSuggestionParamSchema = z.object({
  id: uuid("无效的单位建议 ID"),
}).strict();

export const CatalogUnitSuggestionReviewSchema = z.object({
  action: z.enum(["approved", "rejected"]),
  approved_catalog_unit_id: uuid("无效的标准单位 ID").nullable().optional(),
  review_remark: nullableText(500, "审核备注不能超过 500 个字符"),
  expected_version: expectedVersion,
}).strict().superRefine((input, context) => {
  if (input.action === "approved" && !input.approved_catalog_unit_id) {
    context.addIssue({
      code: "custom",
      path: ["approved_catalog_unit_id"],
      message: "通过建议时必须选择标准单位",
    });
  }
  if (
    input.action === "rejected" &&
    (!input.review_remark || input.approved_catalog_unit_id)
  ) {
    context.addIssue({
      code: "custom",
      path: ["review_remark"],
      message: "拒绝建议时必须填写原因且不能选择标准单位",
    });
  }
});

export type TenantCatalogCategoryCreateInput =
  z.infer<typeof TenantCatalogCategoryCreateSchema>;
export type TenantCatalogCategoryUpdateInput =
  z.infer<typeof TenantCatalogCategoryUpdateSchema>;
export type TenantCatalogBrandCreateInput =
  z.infer<typeof TenantCatalogBrandCreateSchema>;
export type TenantCatalogBrandUpdateInput =
  z.infer<typeof TenantCatalogBrandUpdateSchema>;
export type CatalogSpecDefinitionListQuery =
  z.infer<typeof CatalogSpecDefinitionListQuerySchema>;
export type CatalogSpecDefinitionCreateInput =
  z.infer<typeof CatalogSpecDefinitionCreateSchema>;
export type CatalogSpecDefinitionUpdateInput =
  z.infer<typeof CatalogSpecDefinitionUpdateSchema>;
export type CopyPlatformSpecDefinitionsInput =
  z.infer<typeof CopyPlatformSpecDefinitionsSchema>;
export type CatalogUnitSuggestionListQuery =
  z.infer<typeof CatalogUnitSuggestionListQuerySchema>;
export type PlatformCatalogUnitSuggestionListQuery =
  z.infer<typeof PlatformCatalogUnitSuggestionListQuerySchema>;
export type CatalogUnitSuggestionCreateInput =
  z.infer<typeof CatalogUnitSuggestionCreateSchema>;
export type CatalogUnitSuggestionReviewInput =
  z.infer<typeof CatalogUnitSuggestionReviewSchema>;
