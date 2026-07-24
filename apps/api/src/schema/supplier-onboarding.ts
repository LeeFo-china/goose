import { z } from "zod";
import { SupplierTypeSchema } from "./platform-suppliers";

const creditCode = z.string().trim().toUpperCase().regex(
  /^[0-9A-HJ-NPQRTUWXY]{18}$/,
  "统一社会信用代码格式无效",
);

export const SupplierOnboardingCreateSchema = z.object({
  name: z.string().trim().min(1, "供应商名称不能为空").max(120),
  legal_name: z.string().trim().min(1, "法定名称不能为空").max(160),
  unified_social_credit_code: creditCode,
  supplier_type: SupplierTypeSchema,
  legal_representative_name: z.string().trim().min(1).max(80).nullable()
    .optional(),
  registered_address_text: z.string().trim().min(1).max(300).nullable()
    .optional(),
  license_file_id: z.uuid("营业执照文件 ID 格式无效"),
  ocr_recognition_id: z.uuid("OCR 识别记录 ID 格式无效").nullable().optional(),
  license_valid_from: z.iso.date({ message: "营业执照有效期开始日期格式无效" }).nullable()
    .optional(),
  license_valid_until: z.iso.date({ message: "营业执照有效期结束日期格式无效" }).nullable()
    .optional(),
  primary_contact: z.object({
    name: z.string().trim().min(1, "主要联系人姓名不能为空").max(80),
    phone: z.string().trim().min(6, "主要联系人电话格式无效").max(40)
      .regex(/^[0-9+\-()\s]+$/, "主要联系人电话格式无效"),
    email: z.string().trim().email("主要联系人邮箱格式无效").max(160)
      .nullable().optional(),
  }).strict(),
}).strict().superRefine((value, context) => {
  if (
    value.license_valid_from &&
    value.license_valid_until &&
    value.license_valid_until < value.license_valid_from
  ) {
    context.addIssue({
      code: "custom",
      path: ["license_valid_until"],
      message: "营业执照有效期结束日期不能早于开始日期",
    });
  }
});

export const SupplierIdentityCheckQuerySchema = z.object({
  unified_social_credit_code: creditCode,
}).strict();

export type SupplierOnboardingCreateInput =
  z.infer<typeof SupplierOnboardingCreateSchema>;
