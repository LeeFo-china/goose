import { z } from "zod";

export const SystemSettingKeyParamsSchema = z.object({
  key: z.string().trim().min(1, "配置 Key 不能为空").max(120, "配置 Key 过长"),
});

export const UpdateSystemSettingSchema = z.object({
  value: z.string().nullable(),
});

export type UpdateSystemSettingInput = z.infer<typeof UpdateSystemSettingSchema>;
