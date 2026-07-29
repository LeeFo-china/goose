import { z } from "zod";

export const CreateTenantOnboardingOcrRecognitionSchema = z.object({
  file_object_id: z.uuid("文件 ID 格式无效"),
  idempotency_key: z.uuidv4("幂等键必须是 UUID v4"),
}).strict();

export const TenantOnboardingOcrRecognitionParamsSchema = z.object({
  id: z.uuid("识别记录 ID 格式无效"),
}).strict();

export type CreateTenantOnboardingOcrRecognitionInput = z.infer<
  typeof CreateTenantOnboardingOcrRecognitionSchema
>;
