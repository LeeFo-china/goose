import {
  OCR_DOCUMENT_TYPE_VALUES,
  OCR_RECOGNITION_STATUS_VALUES,
  OCR_SCENE_VALUES,
  OCR_TENANT_POLICY_DOCUMENT_TYPE_VALUES,
} from "@gooes/domain";
import { z } from "zod";

import { PaginationQuerySchema } from "@/schema/request";

export const OcrCapabilitiesQuerySchema = z.object({
  scene: z.enum(OCR_SCENE_VALUES).optional(),
});

export const CreateOcrRecognitionSchema = z.object({
  scene: z.enum(OCR_SCENE_VALUES),
  document_type: z.enum(OCR_DOCUMENT_TYPE_VALUES),
  file_object_id: z.uuid("文件 ID 格式无效"),
  subject_type: z.string().trim().min(1).max(80).nullable().optional(),
  subject_id: z.uuid("业务对象 ID 格式无效").nullable().optional(),
  idempotency_key: z.uuid("幂等键格式无效"),
}).strict().superRefine((value, context) => {
  if (Boolean(value.subject_type) !== Boolean(value.subject_id)) {
    context.addIssue({
      code: "custom",
      path: ["subject_id"],
      message: "业务对象类型和 ID 必须同时提供",
    });
  }
});

export const OcrRecognitionParamsSchema = z.object({
  id: z.uuid("识别记录 ID 格式无效"),
});

export const PlatformOcrRecognitionListQuerySchema = PaginationQuerySchema.extend({
  status: z.enum(OCR_RECOGNITION_STATUS_VALUES).optional(),
  document_type: z.enum(OCR_DOCUMENT_TYPE_VALUES).optional(),
  tenant_id: z.uuid("租户 ID 格式无效").optional(),
});

export const PlatformOcrTenantPolicyListQuerySchema = PaginationQuerySchema.extend({
  keyword: z.string().trim().max(80, "关键词不能超过 80 个字符").optional(),
  enabled: z.enum(["true", "false"]).transform((value) => value === "true").optional(),
});

export const PlatformOcrTenantPolicyParamsSchema = z.object({
  tenantId: z.uuid("租户 ID 格式无效"),
});

export const UpdatePlatformOcrTenantPolicySchema = z.object({
  enabled: z.boolean(),
  allowed_document_types: z.array(
    z.enum(OCR_TENANT_POLICY_DOCUMENT_TYPE_VALUES),
  ).max(4, "识别类型不能超过 4 个"),
  daily_limit: z.number().int().min(1).max(10000).nullable(),
  remark: z.string().trim().max(500, "备注不能超过 500 个字符").nullable(),
}).strict().superRefine((value, context) => {
  if (value.enabled && value.allowed_document_types.length === 0) {
    context.addIssue({
      code: "custom",
      path: ["allowed_document_types"],
      message: "启用租户 OCR 时至少选择一种识别类型",
    });
  }
  if (new Set(value.allowed_document_types).size !==
    value.allowed_document_types.length) {
    context.addIssue({
      code: "custom",
      path: ["allowed_document_types"],
      message: "识别类型不能重复",
    });
  }
});

export const PlatformOcrConfigTestSchema = z.object({
  mimetype: z.enum(["image/jpeg", "image/png"], {
    message: "测试图片仅支持 JPEG 或 PNG",
  }),
  size_bytes: z.number().int().positive("测试图片不能为空").max(
    2 * 1024 * 1024,
    "测试图片不能超过 2MB",
  ),
}).strict();

export type CreateOcrRecognitionInput = z.infer<typeof CreateOcrRecognitionSchema>;
