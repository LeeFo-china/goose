import { z } from "zod";

const optionalText = (max = 120) =>
  z.preprocess((value) => {
    if (value === undefined || value === null) return undefined;
    if (typeof value !== "string") return value;
    const normalized = value.trim();
    return normalized || undefined;
  }, z.string().trim().max(max).optional());

const nullableText = (max = 200) =>
  z.preprocess((value) => {
    if (value === undefined) return undefined;
    if (value === null) return null;
    if (typeof value !== "string") return value;
    const normalized = value.trim();
    return normalized || null;
  }, z.string().trim().max(max).nullable().optional());

const StatusSchema = z.enum(["active", "inactive"], {
  message: "状态无效",
});

export const AiConfigIdParamsSchema = z.object({
  id: z.uuid("无效的配置 ID"),
});

export const AiProviderPayloadSchema = z.object({
  code: z.string().trim().min(1, "供应商编码不能为空").max(80, "供应商编码过长"),
  name: z.string().trim().min(1, "供应商名称不能为空").max(120, "供应商名称过长"),
  provider_type: z.enum(["openai_compatible"], {
    message: "供应商类型无效",
  }).default("openai_compatible"),
  endpoint_url: nullableText(300),
  api_key_setting_key: nullableText(120),
  status: StatusSchema.default("active"),
  sort_order: z.coerce.number().int().min(0).max(100000).default(0),
});

export const UpdateAiProviderPayloadSchema = AiProviderPayloadSchema.partial();

export const AiModelPayloadSchema = z.object({
  provider_id: z.uuid("无效的供应商 ID"),
  code: z.string().trim().min(1, "模型编码不能为空").max(120, "模型编码过长"),
  name: z.string().trim().min(1, "模型名称不能为空").max(120, "模型名称过长"),
  model_name: z.string().trim().min(1, "模型调用名称不能为空").max(200, "模型调用名称过长"),
  status: StatusSchema.default("active"),
  sort_order: z.coerce.number().int().min(0).max(100000).default(0),
});

export const UpdateAiModelPayloadSchema = AiModelPayloadSchema.partial();

export const AiSceneRoutePayloadSchema = z.object({
  scene_code: z.string().trim().min(1, "场景编码不能为空").max(120, "场景编码过长"),
  name: z.string().trim().min(1, "场景名称不能为空").max(120, "场景名称过长"),
  primary_model_id: z.uuid("无效的主模型 ID").nullable().optional(),
  fallback_model_id: z.uuid("无效的备用模型 ID").nullable().optional(),
  temperature: z.coerce.number().min(0).max(2).nullable().optional(),
  response_format: z.enum(["json_object", "text"], {
    message: "响应格式无效",
  }).nullable().optional(),
  timeout_ms: z.coerce.number().int().min(1000).max(300000).nullable().optional(),
  status: StatusSchema.default("active"),
});

export const UpdateAiSceneRoutePayloadSchema = AiSceneRoutePayloadSchema.partial();

export type AiProviderPayload = z.infer<typeof AiProviderPayloadSchema>;
export type UpdateAiProviderPayload = z.infer<typeof UpdateAiProviderPayloadSchema>;
export type AiModelPayload = z.infer<typeof AiModelPayloadSchema>;
export type UpdateAiModelPayload = z.infer<typeof UpdateAiModelPayloadSchema>;
export type AiSceneRoutePayload = z.infer<typeof AiSceneRoutePayloadSchema>;
export type UpdateAiSceneRoutePayload = z.infer<typeof UpdateAiSceneRoutePayloadSchema>;
