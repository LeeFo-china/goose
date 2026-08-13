import {
  SUPPLIER_CONTRACT_LIFECYCLE_STATUS_VALUES,
  TENANT_SUPPLIER_RELATIONSHIP_STATUS_VALUES,
} from "@gooes/domain";
import { z } from "zod";

import {
  SupplierCommandSchema,
  SupplierRequiredReasonCommandSchema,
  SupplierTypeSchema,
  type SupplierCommandContext,
  type SupplierCreateAuditContext,
  type SupplierUpdateAuditContext,
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
const optionalBooleanQuery = z.preprocess((value) => {
  if (value === undefined) return undefined;
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  return value;
}, z.boolean({ message: "布尔参数必须是 true 或 false" }).optional());
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
  startedAt: string | null | undefined,
  endedAt: string | null | undefined,
) => !startedAt || !endedAt || startedAt <= endedAt;
const addRelationshipDateOrderIssue = (
  input: { started_at?: string | null; ended_at?: string | null },
  context: z.RefinementCtx,
) => {
  if (!hasDateOrder(input.started_at, input.ended_at)) {
    context.addIssue({
      code: "custom",
      path: ["ended_at"],
      message: "合作结束日期不能早于开始日期",
    });
  }
};
const addContractDateOrderIssue = (
  input: { valid_from?: string; valid_until?: string },
  context: z.RefinementCtx,
) => {
  if (
    input.valid_from &&
    input.valid_until &&
    input.valid_from > input.valid_until
  ) {
    context.addIssue({
      code: "custom",
      path: ["valid_until"],
      message: "合同结束日期不能早于开始日期",
    });
  }
};
const hasUpdateField = (input: Record<string, unknown>) =>
  Object.entries(input).some(
    ([key, value]) => key !== "expected_version" && value !== undefined,
  );

export const TenantSupplierRelationshipStatusSchema = z.enum(
  TENANT_SUPPLIER_RELATIONSHIP_STATUS_VALUES,
  { message: "无效的供应商合作状态" },
);
export const SupplierContractLifecycleStatusSchema = z.enum(
  SUPPLIER_CONTRACT_LIFECYCLE_STATUS_VALUES,
  { message: "无效的供应商合同状态" },
);

export const TenantSupplierListQuerySchema = PaginationQuerySchema.extend({
  keyword: keyword.optional(),
  relationship_status: TenantSupplierRelationshipStatusSchema.optional(),
  eligible: optionalBooleanQuery,
}).strict();
export const TenantSupplierDirectoryQuerySchema =
  PaginationQuerySchema.extend({
    keyword: keyword.optional(),
  }).strict();
export const TenantSupplierChildListQuerySchema =
  PaginationQuerySchema.strict();
export const TenantSupplierEventListQuerySchema =
  PaginationQuerySchema.extend({
    command: z.string().trim().max(120, "命令名称不能超过 120 个字符").optional(),
  }).strict();

export const TenantSupplierIdParamSchema = z.object({
  id: uuid("无效的租户供应商关系 ID"),
}).strict();
export const TenantSupplierEligibilityParamSchema =
  TenantSupplierIdParamSchema;
export const SupplierContractParamSchema = z.object({
  id: uuid("无效的租户供应商关系 ID"),
  contractId: uuid("无效的供应商合同 ID"),
}).strict();

export const TenantSupplierContractPolicySchema = z.object({
  require_active_contract_for_new_order: z.boolean(),
  expected_version: expectedVersion,
}).strict();

export const TenantSupplierCreateSchema = z.object({
  supplier_id: uuid("无效的供应商 ID"),
}).strict();

const internalSupplierCode = z.string()
  .trim()
  .toUpperCase()
  .regex(
    /^[A-Z0-9_-]{2,64}$/,
    "租户内部供应商编码必须为 2 到 64 位大写字母、数字、下划线或连字符",
  );
const generatedInternalSupplierCodeFields = {
  code_source: z.literal("generated"),
  internal_supplier_code: internalSupplierCode,
  allocation_id: uuid("无效的供应商编码分配 ID"),
};
const manualInternalSupplierCodeFields = {
  code_source: z.literal("manual"),
  internal_supplier_code: internalSupplierCode,
};
const privateSupplierMasterFields = {
  name: requiredText(
    120,
    "供应商名称不能为空",
    "供应商名称不能超过 120 个字符",
  ),
  legal_name: requiredText(
    160,
    "供应商法定名称不能为空",
    "供应商法定名称不能超过 160 个字符",
  ),
  supplier_type: SupplierTypeSchema,
};
const primaryContact = z.object({
  name: requiredText(
    80,
    "联系人姓名不能为空",
    "联系人姓名不能超过 80 个字符",
  ),
  phone: optionalText(40, "联系电话不能超过 40 个字符"),
  email: z.string().trim().email("联系人邮箱格式无效")
    .max(160, "联系人邮箱不能超过 160 个字符").nullable().optional(),
}).strict();
const privateSupplierAddress = z.object({
  province: optionalText(60, "省份名称不能超过 60 个字符"),
  city: optionalText(60, "城市名称不能超过 60 个字符"),
  district: optionalText(60, "区县名称不能超过 60 个字符"),
  region_code: requiredText(
    20,
    "行政区划编码不能为空",
    "行政区划编码不能超过 20 个字符",
  ),
  address_detail: requiredText(
    300,
    "详细地址不能为空",
    "详细地址不能超过 300 个字符",
  ),
}).strict();
const privateSupplierCreateFields = {
  ...privateSupplierMasterFields,
  primary_contact: primaryContact.optional(),
  address: privateSupplierAddress.optional(),
};

export const TenantSupplierCodeAllocationSchema = z.object({}).strict();

export const TenantSupplierSharedCreateSchema = z.discriminatedUnion(
  "code_source",
  [
    z.object({
      supplier_id: uuid("无效的供应商 ID"),
      ...generatedInternalSupplierCodeFields,
    }).strict(),
    z.object({
      supplier_id: uuid("无效的供应商 ID"),
      ...manualInternalSupplierCodeFields,
    }).strict(),
  ],
);

export const TenantSupplierPrivateCreateSchema = z.discriminatedUnion(
  "code_source",
  [
    z.object({
      ...privateSupplierCreateFields,
      ...generatedInternalSupplierCodeFields,
    }).strict(),
    z.object({
      ...privateSupplierCreateFields,
      ...manualInternalSupplierCodeFields,
    }).strict(),
  ],
);

export const TenantPrivateSupplierUpdateSchema = z.object({
  expected_version: expectedVersion,
  name: privateSupplierMasterFields.name.optional(),
  legal_name: privateSupplierMasterFields.legal_name.optional(),
  supplier_type: SupplierTypeSchema.optional(),
}).strict().refine(hasUpdateField, {
  message: "至少需要提交一个私有供应商主档更新字段",
});

const relationshipFields = {
  settlement_term_days: z.number().int()
    .min(0, "结算账期不能为负数")
    .max(3650, "结算账期不能超过 3650 天"),
  credit_limit_minor: z.number().int()
    .nonnegative("授信额度不能为负数"),
  invoice_required_before_payment: z.boolean(),
  default_currency: z.string().regex(
    /^[A-Z]{3}$/,
    "默认币种必须是三个大写英文字母",
  ),
  default_tax_inclusive: z.boolean(),
  tenant_owner_employee_id: uuid("无效的租户负责人 ID").nullable(),
  started_at: optionalDate("合作开始日期格式无效"),
  ended_at: optionalDate("合作结束日期格式无效"),
  remark: optionalText(500, "合作备注不能超过 500 个字符"),
};

export const TenantSupplierUpdateSchema = z.object({
  expected_version: expectedVersion,
  settlement_term_days: optionalNumber(relationshipFields.settlement_term_days),
  credit_limit_minor: optionalNumber(relationshipFields.credit_limit_minor),
  invoice_required_before_payment:
    relationshipFields.invoice_required_before_payment.optional(),
  default_currency: relationshipFields.default_currency.optional(),
  default_tax_inclusive: relationshipFields.default_tax_inclusive.optional(),
  tenant_owner_employee_id:
    relationshipFields.tenant_owner_employee_id.optional(),
  started_at: relationshipFields.started_at,
  ended_at: relationshipFields.ended_at,
  remark: relationshipFields.remark,
}).strict().superRefine(addRelationshipDateOrderIssue).refine(hasUpdateField, {
  message: "至少需要提交一个合作关系更新字段",
});

export const TenantSupplierSuspendCommandSchema =
  SupplierRequiredReasonCommandSchema;
export const TenantSupplierTerminateCommandSchema =
  SupplierRequiredReasonCommandSchema;
export const TenantSupplierBlacklistCommandSchema =
  SupplierRequiredReasonCommandSchema;
export const TenantSupplierLifecycleCommandSchema =
  SupplierCommandSchema.extend({
    tenant_id: uuid("无效的租户 ID"),
    tenant_supplier_id: uuid("无效的租户供应商关系 ID"),
    action: z.enum(["activate", "suspend", "terminate", "blacklist"]),
  }).superRefine((input, context) => {
    if (
      ["suspend", "terminate", "blacklist"].includes(input.action) &&
      !input.reason
    ) {
      context.addIssue({
        code: "custom",
        path: ["reason"],
        message: "该操作必须填写原因",
      });
    }
  });

const contractFields = {
  contract_no: requiredText(80, "合同编号不能为空", "合同编号不能超过 80 个字符"),
  name: requiredText(160, "合同名称不能为空", "合同名称不能超过 160 个字符"),
  valid_from: z.iso.date({ message: "合同开始日期格式无效" }),
  valid_until: z.iso.date({ message: "合同结束日期格式无效" }),
  settlement_term_days: requiredNumber(
    z.number().int()
      .min(0, "合同结算账期不能为负数")
      .max(3650, "合同结算账期不能超过 3650 天"),
  ),
  invoice_required_before_payment: z.boolean(),
  document_file_id: uuid("无效的合同文件 ID"),
};

export const SupplierContractCreateSchema = z.object(
  contractFields,
).strict().superRefine(addContractDateOrderIssue);

export const SupplierContractUpdateSchema = z.object({
  expected_version: expectedVersion,
  contract_no: contractFields.contract_no.optional(),
  name: contractFields.name.optional(),
  valid_from: contractFields.valid_from.optional(),
  valid_until: contractFields.valid_until.optional(),
  settlement_term_days: optionalNumber(
    z.number().int()
      .min(0, "合同结算账期不能为负数")
      .max(3650, "合同结算账期不能超过 3650 天"),
  ),
  invoice_required_before_payment:
    contractFields.invoice_required_before_payment.optional(),
  document_file_id: contractFields.document_file_id.optional(),
}).strict().superRefine(addContractDateOrderIssue).refine(hasUpdateField, {
  message: "至少需要提交一个合同更新字段",
});

export const SupplierContractTerminateCommandSchema =
  SupplierRequiredReasonCommandSchema;
export const SupplierContractLifecycleCommandSchema =
  SupplierCommandSchema.extend({
    tenant_id: uuid("无效的租户 ID"),
    contract_id: uuid("无效的供应商合同 ID"),
    action: z.enum(["activate", "terminate"]),
  }).superRefine((input, context) => {
    if (input.action === "terminate" && !input.reason) {
      context.addIssue({
        code: "custom",
        path: ["reason"],
        message: "终止合同必须填写原因",
      });
    }
  });

export const TenantSupplierListInputSchema =
  TenantSupplierListQuerySchema.extend({
    tenant_id: uuid("无效的租户 ID"),
  });
export const TenantSupplierDirectoryInputSchema =
  TenantSupplierDirectoryQuerySchema.extend({
    tenant_id: uuid("无效的租户 ID"),
  });
export const TenantOwnedIdSchema = z.object({
  tenant_id: uuid("无效的租户 ID"),
  id: uuid("无效的租户供应商关系 ID"),
}).strict();
export const TenantSupplierChildPageInputSchema =
  TenantSupplierChildListQuerySchema.extend({
    tenant_id: uuid("无效的租户 ID"),
    tenant_supplier_id: uuid("无效的租户供应商关系 ID"),
  });
export const TenantSupplierEventPageInputSchema =
  TenantSupplierEventListQuerySchema.extend({
    tenant_id: uuid("无效的租户 ID"),
    tenant_supplier_id: uuid("无效的租户供应商关系 ID"),
  });

export type TenantSupplierContractPolicyCommand =
  z.infer<typeof TenantSupplierContractPolicySchema> & {
    tenant_id: string;
  };
export type TenantSupplierContractPolicyInput =
  z.infer<typeof TenantSupplierContractPolicySchema>;
export type TenantSupplierListQuery =
  z.infer<typeof TenantSupplierListQuerySchema>;
export type TenantSupplierDirectoryQuery =
  z.infer<typeof TenantSupplierDirectoryQuerySchema>;
export type TenantSupplierListInput =
  z.infer<typeof TenantSupplierListInputSchema>;
export type TenantSupplierDirectoryInput =
  z.infer<typeof TenantSupplierDirectoryInputSchema>;
export type TenantOwnedId = z.infer<typeof TenantOwnedIdSchema>;
export type TenantSupplierChildPageInput =
  z.infer<typeof TenantSupplierChildPageInputSchema>;
export type TenantSupplierCreateCommand =
  z.infer<typeof TenantSupplierCreateSchema> & {
    tenant_id: string;
    tenant_supplier_id: string;
  } & SupplierCommandContext;
export type TenantSupplierUpdateCommand =
  z.infer<typeof TenantSupplierUpdateSchema> & {
    tenant_id: string;
    tenant_supplier_id: string;
  } & SupplierUpdateAuditContext;
export type TenantSupplierCreateInput =
  z.infer<typeof TenantSupplierCreateSchema>;
export type TenantSupplierCodeAllocationInput =
  z.infer<typeof TenantSupplierCodeAllocationSchema>;
export type TenantSupplierSharedCreateInput =
  z.infer<typeof TenantSupplierSharedCreateSchema>;
export type TenantSupplierPrivateCreateInput =
  z.infer<typeof TenantSupplierPrivateCreateSchema>;
export type TenantPrivateSupplierUpdateInput =
  z.infer<typeof TenantPrivateSupplierUpdateSchema>;
export type TenantSupplierUpdateInput =
  z.infer<typeof TenantSupplierUpdateSchema>;
export type TenantSupplierLifecycleCommand =
  z.infer<typeof TenantSupplierLifecycleCommandSchema> &
  SupplierCommandContext;
export type SupplierContractCreateCommand =
  z.infer<typeof SupplierContractCreateSchema> & {
    tenant_id: string;
    tenant_supplier_id: string;
  } & SupplierCreateAuditContext;
export type SupplierContractUpdateCommand =
  z.infer<typeof SupplierContractUpdateSchema> & {
    tenant_id: string;
    tenant_supplier_id: string;
    contract_id: string;
  } & SupplierUpdateAuditContext;
export type SupplierContractCreateInput =
  z.infer<typeof SupplierContractCreateSchema>;
export type SupplierContractUpdateInput =
  z.infer<typeof SupplierContractUpdateSchema>;
export type SupplierContractLifecycleCommand =
  z.infer<typeof SupplierContractLifecycleCommandSchema> &
  SupplierCommandContext;
