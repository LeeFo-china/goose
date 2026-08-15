import {
  SUPPLIER_ONBOARDING_STATUS_VALUES,
  SUPPLIER_OPERATIONAL_STATUS_VALUES,
  SUPPLIER_QUALIFICATION_HEALTH_VALUES,
  SUPPLIER_QUALIFICATION_VERIFICATION_STATUS_VALUES,
  SUPPLIER_TYPE_VALUES,
} from "@gooes/domain";
import { z } from "zod";

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
const optionalNullableNumber = (schema: z.ZodNumber) =>
  z.preprocess(parseOptionalNumber, schema.nullable().optional());
const expectedVersion = requiredNumber(
  z.number().int().positive("版本号必须是正整数"),
);
const initializableExpectedVersion = requiredNumber(
  z.number().int().nonnegative("版本号不能为负数"),
);
const keyword = z.string().trim().max(80, "关键词不能超过 80 个字符");
const requiredText = (
  max: number,
  emptyMessage: string,
  maxMessage: string,
) => z.string().trim().min(1, emptyMessage).max(max, maxMessage);
const optionalText = (max: number, message: string) =>
  z.string().trim().min(1, "字段不能为空").max(max, message).nullable().optional();
const optionalDate = (message: string) =>
  z.iso.date({ message }).nullable().optional();
const hasDateOrder = (
  validFrom: string | null | undefined,
  validUntil: string | null | undefined,
) => !validFrom || !validUntil || validFrom <= validUntil;
const addDateOrderIssue = (
  input: { valid_from?: string | null; valid_until?: string | null },
  context: z.RefinementCtx,
) => {
  if (!hasDateOrder(input.valid_from, input.valid_until)) {
    context.addIssue({
      code: "custom",
      path: ["valid_until"],
      message: "有效期结束日期不能早于开始日期",
    });
  }
};
const hasUpdateField = (input: Record<string, unknown>) =>
  Object.entries(input).some(
    ([key, value]) => key !== "expected_version" && value !== undefined,
  );

export const SupplierTypeSchema = z.enum(SUPPLIER_TYPE_VALUES, {
  message: "无效的供应商类型",
});
export const SupplierOnboardingStatusSchema = z.enum(
  SUPPLIER_ONBOARDING_STATUS_VALUES,
  { message: "无效的供应商准入状态" },
);
export const SupplierOperationalStatusSchema = z.enum(
  SUPPLIER_OPERATIONAL_STATUS_VALUES,
  { message: "无效的供应商运营状态" },
);
export const SupplierQualificationHealthSchema = z.enum(
  SUPPLIER_QUALIFICATION_HEALTH_VALUES,
  { message: "无效的资质健康状态" },
);
export const SupplierQualificationVerificationStatusSchema = z.enum(
  SUPPLIER_QUALIFICATION_VERIFICATION_STATUS_VALUES,
  { message: "无效的资质核验状态" },
);
export const SupplierRecordStatusSchema = z.enum(["active", "inactive"], {
  message: "无效的记录状态",
});

export const PlatformSupplierListQuerySchema = PaginationQuerySchema.extend({
  keyword: keyword.optional(),
  supplier_type: SupplierTypeSchema.optional(),
  onboarding_status: SupplierOnboardingStatusSchema.optional(),
  operational_status: SupplierOperationalStatusSchema.optional(),
  qualification_health: SupplierQualificationHealthSchema.optional(),
}).strict();

export const SupplierQualificationTypeListQuerySchema =
  PaginationQuerySchema.extend({
    keyword: keyword.optional(),
    supplier_type: SupplierTypeSchema.optional(),
    status: SupplierRecordStatusSchema.optional(),
  }).strict();

export const SupplierChildListQuerySchema = PaginationQuerySchema.strict();
export const SupplierEventListQuerySchema = PaginationQuerySchema.extend({
  command: z.string().trim().max(120, "命令名称不能超过 120 个字符").optional(),
}).strict();

export const PlatformSupplierIdParamSchema = z.object({
  id: uuid("无效的供应商 ID"),
}).strict();
export const SupplierQualificationParamSchema = z.object({
  id: uuid("无效的供应商 ID"),
  qualificationId: uuid("无效的资质 ID"),
}).strict();
export const SupplierServiceRegionParamSchema = z.object({
  id: uuid("无效的供应商 ID"),
  regionId: uuid("无效的服务区域 ID"),
}).strict();
export const SupplierAddressParamSchema = z.object({
  id: uuid("无效的供应商 ID"),
  addressId: uuid("无效的地址 ID"),
}).strict();
export const SupplierContactParamSchema = z.object({
  id: uuid("无效的供应商 ID"),
  contactId: uuid("无效的联系人 ID"),
}).strict();
export const PlatformTenantSupplierSettingsParamSchema = z.object({
  tenantId: uuid("无效的租户 ID"),
}).strict();

const supplierWritableFields = {
  code: requiredText(64, "供应商编码不能为空", "供应商编码不能超过 64 个字符"),
  name: requiredText(120, "供应商名称不能为空", "供应商名称不能超过 120 个字符"),
  legal_name: requiredText(160, "供应商法定名称不能为空", "供应商法定名称不能超过 160 个字符"),
  unified_social_credit_code: optionalText(
    64,
    "统一社会信用代码不能超过 64 个字符",
  ),
  supplier_type: SupplierTypeSchema,
};

export const PlatformSupplierCreateSchema = z.object(
  supplierWritableFields,
).strict();

export const PlatformSupplierUpdateSchema = z.object({
  expected_version: expectedVersion,
  code: supplierWritableFields.code.optional(),
  name: supplierWritableFields.name.optional(),
  legal_name: supplierWritableFields.legal_name.optional(),
  unified_social_credit_code:
    supplierWritableFields.unified_social_credit_code,
  supplier_type: SupplierTypeSchema.optional(),
}).strict().refine(hasUpdateField, {
  message: "至少需要提交一个供应商更新字段",
});

export const SupplierCommandSchema = z.object({
  expected_version: expectedVersion,
  reason: z.string().trim().min(1).max(500).optional(),
}).strict();

export const SupplierRequiredReasonCommandSchema = z.object({
  expected_version: expectedVersion,
  reason: requiredText(500, "操作原因不能为空", "操作原因不能超过 500 个字符"),
}).strict();

export const SupplierRejectCommandSchema = SupplierRequiredReasonCommandSchema;
export const SupplierSuspendCommandSchema = SupplierRequiredReasonCommandSchema;
export const SupplierBlacklistCommandSchema = SupplierRequiredReasonCommandSchema;

export const PlatformSupplierLifecycleCommandSchema =
  SupplierCommandSchema.extend({
    supplier_id: uuid("无效的供应商 ID"),
    action: z.enum([
      "submit",
      "approve",
      "reject",
      "suspend",
      "resume",
      "blacklist",
    ]),
  }).superRefine((input, context) => {
    if (
      ["reject", "suspend", "blacklist"].includes(input.action) &&
      !input.reason
    ) {
      context.addIssue({
        code: "custom",
        path: ["reason"],
        message: "该操作必须填写原因",
      });
    }
  });

const qualificationTypeFields = {
  code: requiredText(64, "资质类型编码不能为空", "资质类型编码不能超过 64 个字符"),
  name: requiredText(120, "资质类型名称不能为空", "资质类型名称不能超过 120 个字符"),
  applicable_supplier_types: z.array(SupplierTypeSchema)
    .max(SUPPLIER_TYPE_VALUES.length, "适用供应商类型数量过多"),
  warning_days: z.number().int().min(0, "预警天数不能为负数")
    .max(3650, "预警天数不能超过 3650 天"),
  is_required: z.boolean(),
  blocks_new_orders: z.boolean(),
  status: SupplierRecordStatusSchema,
  sort_order: z.number().int(),
};

export const SupplierQualificationTypeCreateSchema = z.object({
  ...qualificationTypeFields,
  applicable_supplier_types:
    qualificationTypeFields.applicable_supplier_types.default([]),
  warning_days:
    optionalNumber(qualificationTypeFields.warning_days).default(30),
  is_required: qualificationTypeFields.is_required.default(false),
  blocks_new_orders: qualificationTypeFields.blocks_new_orders.default(false),
  status: qualificationTypeFields.status.default("active"),
  sort_order: optionalNumber(qualificationTypeFields.sort_order).default(100),
}).strict();
export const SupplierQualificationTypeUpdateSchema = z.object({
  expected_version: expectedVersion,
  code: qualificationTypeFields.code.optional(),
  name: qualificationTypeFields.name.optional(),
  applicable_supplier_types:
    qualificationTypeFields.applicable_supplier_types.optional(),
  warning_days: optionalNumber(qualificationTypeFields.warning_days),
  is_required: qualificationTypeFields.is_required.optional(),
  blocks_new_orders: qualificationTypeFields.blocks_new_orders.optional(),
  status: qualificationTypeFields.status.optional(),
  sort_order: optionalNumber(qualificationTypeFields.sort_order),
}).strict().refine(hasUpdateField, {
  message: "至少需要提交一个资质类型更新字段",
});

const qualificationFields = {
  qualification_type_id: uuid("无效的资质类型 ID"),
  document_file_id: uuid("无效的资质文件 ID"),
  certificate_no: optionalText(120, "证书编号不能超过 120 个字符"),
  valid_from: optionalDate("资质有效期开始日期格式无效"),
  valid_until: optionalDate("资质有效期结束日期格式无效"),
};

export const SupplierQualificationCreateSchema = z.object(
  qualificationFields,
).strict().superRefine(addDateOrderIssue);
export const SupplierQualificationUpdateSchema = z.object({
  expected_version: expectedVersion,
  qualification_type_id: qualificationFields.qualification_type_id.optional(),
  document_file_id: qualificationFields.document_file_id.optional(),
  certificate_no: qualificationFields.certificate_no,
  valid_from: qualificationFields.valid_from,
  valid_until: qualificationFields.valid_until,
}).strict().superRefine(addDateOrderIssue).refine(hasUpdateField, {
  message: "至少需要提交一个资质更新字段",
});

export const SupplierQualificationRejectCommandSchema =
  SupplierRequiredReasonCommandSchema;
export const SupplierQualificationReviewCommandSchema =
  SupplierCommandSchema.extend({
    supplier_id: uuid("无效的供应商 ID"),
    qualification_id: uuid("无效的资质 ID"),
    verification_status: z.enum(["verified", "rejected"]),
  }).superRefine((input, context) => {
    if (input.verification_status === "rejected" && !input.reason) {
      context.addIssue({
        code: "custom",
        path: ["reason"],
        message: "驳回资质必须填写原因",
      });
    }
  });

const serviceRegionFields = {
  region_code: requiredText(20, "行政区划编码不能为空", "行政区划编码不能超过 20 个字符"),
  region_level: z.enum(["province", "city", "district"], {
    message: "无效的行政区划级别",
  }),
  status: SupplierRecordStatusSchema,
  valid_from: optionalDate("服务区域生效日期格式无效"),
  valid_until: optionalDate("服务区域失效日期格式无效"),
};
export const SupplierServiceRegionCreateSchema = z.object({
  ...serviceRegionFields,
  status: serviceRegionFields.status.default("active"),
}).strict().superRefine(addDateOrderIssue);
export const SupplierServiceRegionUpdateSchema = z.object({
  expected_version: expectedVersion,
  region_code: serviceRegionFields.region_code.optional(),
  region_level: serviceRegionFields.region_level.optional(),
  status: serviceRegionFields.status.optional(),
  valid_from: serviceRegionFields.valid_from,
  valid_until: serviceRegionFields.valid_until,
}).strict().superRefine(addDateOrderIssue).refine(hasUpdateField, {
  message: "至少需要提交一个服务区域更新字段",
});

const addressFields = {
  address_type: z.enum(["registered", "shipping", "return", "other"], {
    message: "无效的地址类型",
  }),
  province: optionalText(60, "省份名称不能超过 60 个字符"),
  city: optionalText(60, "城市名称不能超过 60 个字符"),
  district: optionalText(60, "区县名称不能超过 60 个字符"),
  region_code: requiredText(20, "行政区划编码不能为空", "行政区划编码不能超过 20 个字符"),
  address_detail: requiredText(300, "详细地址不能为空", "详细地址不能超过 300 个字符"),
  longitude: optionalNullableNumber(
    z.number().min(-180, "经度不能小于 -180")
      .max(180, "经度不能大于 180"),
  ),
  latitude: optionalNullableNumber(
    z.number().min(-90, "纬度不能小于 -90")
      .max(90, "纬度不能大于 90"),
  ),
  is_default: z.boolean(),
  status: SupplierRecordStatusSchema,
};
export const SupplierAddressCreateSchema = z.object({
  ...addressFields,
  is_default: addressFields.is_default.default(false),
  status: addressFields.status.default("active"),
}).strict();
export const SupplierAddressUpdateSchema = z.object({
  expected_version: expectedVersion,
  address_type: addressFields.address_type.optional(),
  province: addressFields.province,
  city: addressFields.city,
  district: addressFields.district,
  region_code: addressFields.region_code.optional(),
  address_detail: addressFields.address_detail.optional(),
  longitude: addressFields.longitude,
  latitude: addressFields.latitude,
  is_default: addressFields.is_default.optional(),
  status: addressFields.status.optional(),
}).strict().refine(hasUpdateField, {
  message: "至少需要提交一个地址更新字段",
});

const contactFields = {
  contact_type: z.enum(
    ["primary", "sales", "finance", "logistics", "after_sales"],
    { message: "无效的联系人类型" },
  ),
  name: requiredText(80, "联系人姓名不能为空", "联系人姓名不能超过 80 个字符"),
  phone: optionalText(40, "联系电话不能超过 40 个字符"),
  email: z.string().trim().email("联系人邮箱格式无效")
    .max(160, "联系人邮箱不能超过 160 个字符").nullable().optional(),
  is_public: z.boolean(),
  is_primary: z.boolean(),
  status: SupplierRecordStatusSchema,
};
export const SupplierContactCreateSchema = z.object({
  ...contactFields,
  is_public: contactFields.is_public.default(false),
  is_primary: contactFields.is_primary.default(false),
  status: contactFields.status.default("active"),
}).strict();
export const SupplierContactUpdateSchema = z.object({
  expected_version: expectedVersion,
  contact_type: contactFields.contact_type.optional(),
  name: contactFields.name.optional(),
  phone: contactFields.phone,
  email: contactFields.email,
  is_public: contactFields.is_public.optional(),
  is_primary: contactFields.is_primary.optional(),
  status: contactFields.status.optional(),
}).strict().refine(hasUpdateField, {
  message: "至少需要提交一个联系人更新字段",
});

export const PlatformTenantSupplierSettingsCommandSchema = z.object({
  module_enabled: z.boolean(),
  require_active_contract_for_new_order: z.boolean(),
  ownership_reads_enabled: z.boolean(),
  private_supplier_writes_enabled: z.boolean(),
  private_catalog_writes_enabled: z.boolean(),
  procurement_snapshot_v1_enabled: z.boolean(),
  expected_version: initializableExpectedVersion,
  reason: SupplierCommandSchema.shape.reason,
}).strict().superRefine((input, context) => {
  if (!input.module_enabled && !input.reason) {
    context.addIssue({
      code: "custom",
      path: ["reason"],
      message: "停用供应商模块必须填写原因",
    });
  }
});

export const SupplierChildPageQuerySchema =
  SupplierChildListQuerySchema.extend({
    supplier_id: uuid("无效的供应商 ID"),
  });
export const SupplierEventPageQuerySchema =
  SupplierEventListQuerySchema.extend({
    supplier_id: uuid("无效的供应商 ID"),
  });

export type PlatformSupplierListQuery =
  z.infer<typeof PlatformSupplierListQuerySchema>;
export type SupplierQualificationTypeListQuery =
  z.infer<typeof SupplierQualificationTypeListQuerySchema>;
export type SupplierChildPageQuery =
  z.infer<typeof SupplierChildPageQuerySchema>;
export type SupplierEventPageQuery =
  z.infer<typeof SupplierEventPageQuerySchema>;
export type SupplierCommandContext = {
  actor_user_id: string;
  actor_employee_id: string;
  idempotency_key: string;
};
export type SupplierCreateAuditContext = {
  created_by_employee_id: string;
  updated_by_employee_id: string;
};
export type SupplierUpdateAuditContext = {
  updated_by_employee_id: string;
};
export type PlatformSupplierCreateCommand =
  z.infer<typeof PlatformSupplierCreateSchema> & {
    supplier_id: string;
  } & SupplierCommandContext;
export type PlatformSupplierUpdateCommand =
  z.infer<typeof PlatformSupplierUpdateSchema> & {
    supplier_id: string;
  } & SupplierUpdateAuditContext;
export type PlatformSupplierCreateInput =
  z.infer<typeof PlatformSupplierCreateSchema>;
export type PlatformSupplierUpdateInput =
  z.infer<typeof PlatformSupplierUpdateSchema>;
export type PlatformSupplierLifecycleCommand =
  z.infer<typeof PlatformSupplierLifecycleCommandSchema> &
  SupplierCommandContext;
export type SupplierQualificationTypeCreateRecord =
  z.infer<typeof SupplierQualificationTypeCreateSchema>;
export type SupplierQualificationTypeUpdateRecord =
  z.infer<typeof SupplierQualificationTypeUpdateSchema> & {
    qualification_type_id: string;
  };
export type SupplierQualificationCreateRecord =
  z.infer<typeof SupplierQualificationCreateSchema> & {
    supplier_id: string;
  } & SupplierCreateAuditContext;
export type SupplierQualificationUpdateRecord =
  z.infer<typeof SupplierQualificationUpdateSchema> & {
    supplier_id: string;
    qualification_id: string;
  } & SupplierUpdateAuditContext;
export type SupplierQualificationReviewCommand =
  z.infer<typeof SupplierQualificationReviewCommandSchema> &
  SupplierCommandContext;
export type SupplierServiceRegionWrite =
  | (z.infer<typeof SupplierServiceRegionCreateSchema> & {
    supplier_id: string;
  } & SupplierCreateAuditContext)
  | (z.infer<typeof SupplierServiceRegionUpdateSchema> & {
    supplier_id: string;
    region_id: string;
  } & SupplierUpdateAuditContext);
export type SupplierAddressWrite =
  | (z.infer<typeof SupplierAddressCreateSchema> & {
    supplier_id: string;
  } & SupplierCreateAuditContext)
  | (z.infer<typeof SupplierAddressUpdateSchema> & {
    supplier_id: string;
    address_id: string;
  } & SupplierUpdateAuditContext);
export type SupplierContactWrite =
  | (z.infer<typeof SupplierContactCreateSchema> & {
    supplier_id: string;
  } & SupplierCreateAuditContext)
  | (z.infer<typeof SupplierContactUpdateSchema> & {
    supplier_id: string;
    contact_id: string;
  } & SupplierUpdateAuditContext);
export type PlatformTenantSupplierSettingsCommand =
  z.infer<typeof PlatformTenantSupplierSettingsCommandSchema> & {
    tenant_id: string;
  } & SupplierCommandContext;
