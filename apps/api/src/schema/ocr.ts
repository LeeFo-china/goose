import {
  OCR_DOCUMENT_TYPE_VALUES,
  OCR_RECOGNITION_STATUS_VALUES,
  OCR_SCENE_VALUES,
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
