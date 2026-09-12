import { z } from "zod";
import { AiModelCapabilitySchema } from "@gooes/domain";
import { PaginationQuerySchema } from "@/schema/request";
import { AiSecretSettingKeySchema } from "@/schema/ai-secret-settings";

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
const ModalitySchema = z.enum(["text", "image", "video", "speech"], {
  message: "模型模态无效",
});
const ProviderTypeSchema = z.enum(["openai_compatible", "openrouter"], {
  message: "供应商类型无效",
});
const QualityTierSchema = z.enum(["fast", "balanced", "quality"], {
  message: "质量档位无效",
});
const ProbeStatusSchema = z.enum(["unverified", "eligible", "ineligible", "stale"], {
  message: "探针状态无效",
});
const CatalogChangeTypeSchema = z.enum([
  "new",
  "changed",
  "unchanged",
  "removed",
], { message: "目录变更类型无效" });
const sha256HexSchema = z.string().regex(/^[a-f0-9]{64}$/i, "目录哈希无效");

export const AiConfigIdParamsSchema = z.object({
  id: z.uuid("无效的配置 ID"),
});

export const AiProviderPayloadSchema = z.strictObject({
  name: z.string().trim().min(1, "供应商名称不能为空").max(120, "供应商名称过长"),
  provider_type: ProviderTypeSchema.default("openai_compatible"),
  endpoint_url: nullableText(300),
  api_key_setting_key: AiSecretSettingKeySchema,
  status: StatusSchema.default("active"),
  sort_order: z.coerce.number().int().min(0).max(100000).default(0),
});

const ExpectedVersionSchema = z.coerce.number().int().min(1, "配置版本无效");

export const UpdateAiProviderPayloadSchema = z.strictObject({
  ...AiProviderPayloadSchema.partial().shape,
  provider_type: ProviderTypeSchema.optional(),
  status: StatusSchema.optional(),
  sort_order: z.coerce.number().int().min(0).max(100000).optional(),
  expected_version: ExpectedVersionSchema,
});

export const DeleteAiProviderPayloadSchema = z.strictObject({
  expected_version: z.number().int().min(1, "配置版本无效"),
});

export const DeleteAiProviderQuerySchema = z.strictObject({});

export const AiModelPayloadSchema = z.strictObject({
  provider_id: z.uuid("无效的供应商 ID"),
  name: z.string().trim().min(1, "模型名称不能为空").max(120, "模型名称过长"),
  model_name: z.string().trim().min(1, "模型调用名称不能为空").max(200, "模型调用名称过长"),
  modality: ModalitySchema.default("text"),
  input_modalities: z.array(ModalitySchema).min(1).max(4).optional(),
  status: StatusSchema.default("active"),
  sort_order: z.coerce.number().int().min(0).max(100000).default(0),
});

export const UpdateAiModelPayloadSchema = z.strictObject({
  ...AiModelPayloadSchema.partial().shape,
  modality: ModalitySchema.optional(),
  status: StatusSchema.optional(),
  sort_order: z.coerce.number().int().min(0).max(100000).optional(),
  expected_version: ExpectedVersionSchema,
});

const RegisteredAiSceneRoutePayloadSchema = z.strictObject({
  scene_code: z.string().trim().min(1, "场景编码不能为空").max(120, "场景编码过长"),
  name: z.string().trim().min(1, "场景名称不能为空").max(120, "场景名称过长").optional(),
  primary_model_id: z.uuid("无效的主模型 ID").nullable().optional(),
  fallback_model_id: z.uuid("无效的备用模型 ID").nullable().optional(),
  quality_tier: QualityTierSchema.default("balanced"),
  modality: ModalitySchema.optional(),
  temperature: z.coerce.number().min(0).max(2).nullable().optional(),
  response_format: z.enum(["json_object", "text"], {
    message: "响应格式无效",
  }).nullable().optional(),
  timeout_ms: z.coerce.number().int().min(1000).max(300000).nullable().optional(),
  status: StatusSchema.default("active"),
});

export const AiSceneRoutePayloadSchema = z.preprocess((value) => {
  // Remove this compatibility normalization after the redesigned Admin is deployed.
  if (value && typeof value === "object" && !Array.isArray(value)
    && !("scene_source" in value) && "scene_code" in value) {
    return { ...value, scene_source: "registered" };
  }
  return value;
}, z.discriminatedUnion("scene_source", [
  RegisteredAiSceneRoutePayloadSchema.extend({ scene_source: z.literal("registered") }),
  RegisteredAiSceneRoutePayloadSchema.omit({ scene_code: true, name: true }).extend({
    scene_source: z.literal("custom"),
    scene_name: z.string().trim().min(1).max(120),
    modality: ModalitySchema,
  }),
]));

export const UpdateAiSceneRoutePayloadSchema = RegisteredAiSceneRoutePayloadSchema.partial().extend({
  quality_tier: QualityTierSchema.optional(),
  status: StatusSchema.optional(),
  expected_version: ExpectedVersionSchema,
});

export const AiConfigListQuerySchema = PaginationQuerySchema;
export const AiModelListQuerySchema = PaginationQuerySchema.extend({
  providerId: z.uuid("无效的供应商 ID").optional(),
  modality: ModalitySchema.optional(),
  status: StatusSchema.optional(),
  keyword: optionalText(120),
});
export const AiRouteModelOptionListQuerySchema = PaginationQuerySchema.extend({
  view: z.enum(["inspect"], { message: "无效的模型查看方式" }).optional(),
  keyword: optionalText(120),
  modality: ModalitySchema.optional(),
  status: StatusSchema.optional(),
});
export const AiRouteModelOptionResolvePayloadSchema = z.discriminatedUnion("source", [
  z.strictObject({
    source: z.literal("catalog"),
    value: z.uuid("无效的目录模型 ID"),
  }),
  z.strictObject({
    source: z.literal("manual"),
    model_name: z.string().trim().min(1, "模型调用名称不能为空").max(200, "模型调用名称过长"),
    name: optionalText(120),
    modality: ModalitySchema,
    input_modalities: z.array(ModalitySchema).min(1).max(4).optional(),
  }),
]);
export const AiSceneRouteListQuerySchema = PaginationQuerySchema.extend({
  sceneCode: optionalText(120),
  qualityTier: QualityTierSchema.optional(),
});
export const AiSceneCodeParamsSchema = z.strictObject({ code: z.string().trim().min(1).max(120) });
export const UpdateAiCustomScenePayloadSchema = z.strictObject({
  name: z.string().trim().min(1).max(120).optional(),
  status: StatusSchema.optional(),
  expected_version: ExpectedVersionSchema,
});
export const DeleteAiCustomScenePayloadSchema = z.strictObject({ expected_version: ExpectedVersionSchema });
export const AiSceneListQuerySchema = z.strictObject({
  ...PaginationQuerySchema.shape,
  keyword: optionalText(120),
  source: z.enum(["system", "custom", "legacy"]).optional(),
  status: StatusSchema.optional(),
});
export const SystemAiSceneListQuerySchema = AiSceneListQuerySchema;
export const AiCatalogRunListQuerySchema = PaginationQuerySchema.extend({
  provider_id: z.uuid("无效的供应商 ID").optional(),
});
export const AiCatalogEntryListQuerySchema = PaginationQuerySchema.extend({
  changeType: CatalogChangeTypeSchema.optional(),
  keyword: optionalText(120),
  modality: ModalitySchema.optional(),
});

export const OpenRouterCatalogPreviewPayloadSchema = z.strictObject({
  provider_id: z.uuid("无效的 OpenRouter 供应商 ID"),
});
export const OpenRouterCatalogApplyPayloadSchema = z.strictObject({
  run_id: z.uuid("无效的目录同步 ID"),
  entry_ids: z.array(z.uuid("无效的目录条目 ID")).min(1, "请选择要应用的目录条目").max(100, "单次最多应用 100 个目录条目"),
  expected_catalog_hash: sha256HexSchema,
});
export const AiModelCapabilityPayloadSchema = z.strictObject({
  expected_version: z.coerce.number().int().min(1, "模型版本无效"),
  capability_payload: AiModelCapabilitySchema,
  probe_status: ProbeStatusSchema,
  probe_at: z.iso.datetime({ offset: true }).nullable().optional(),
});
export const OpenRouterProviderQuerySchema = z.strictObject({
  provider_id: z.uuid("无效的 OpenRouter 供应商 ID"),
});

export type AiProviderPayload = z.infer<typeof AiProviderPayloadSchema>;
export type UpdateAiProviderPayload = z.infer<typeof UpdateAiProviderPayloadSchema>;
export type DeleteAiProviderPayload = z.infer<typeof DeleteAiProviderPayloadSchema>;
export type AiModelPayload = z.infer<typeof AiModelPayloadSchema>;
export type UpdateAiModelPayload = z.infer<typeof UpdateAiModelPayloadSchema>;
export type AiSceneRoutePayload = z.infer<typeof RegisteredAiSceneRoutePayloadSchema>;
export type CreateAiSceneRoutePayload = z.infer<typeof AiSceneRoutePayloadSchema>;
export type AiSceneListQuery = z.infer<typeof AiSceneListQuerySchema>;
export type UpdateAiCustomScenePayload = z.infer<typeof UpdateAiCustomScenePayloadSchema>;
export type DeleteAiCustomScenePayload = z.infer<typeof DeleteAiCustomScenePayloadSchema>;
export type UpdateAiSceneRoutePayload = z.infer<typeof UpdateAiSceneRoutePayloadSchema>;
export type AiConfigListQuery = z.infer<typeof AiConfigListQuerySchema>;
export type AiModelListQuery = z.infer<typeof AiModelListQuerySchema>;
export type AiRouteModelOptionListQuery = z.infer<typeof AiRouteModelOptionListQuerySchema>;
export type AiRouteModelOptionResolvePayload = z.infer<typeof AiRouteModelOptionResolvePayloadSchema>;
export type AiSceneRouteListQuery = z.infer<typeof AiSceneRouteListQuerySchema>;
export type SystemAiSceneListQuery = z.infer<typeof SystemAiSceneListQuerySchema>;
export type AiCatalogRunListQuery = z.infer<typeof AiCatalogRunListQuerySchema>;
export type AiCatalogEntryListQuery = z.infer<typeof AiCatalogEntryListQuerySchema>;
export type OpenRouterCatalogPreviewPayload = z.infer<typeof OpenRouterCatalogPreviewPayloadSchema>;
export type OpenRouterCatalogApplyPayload = z.infer<typeof OpenRouterCatalogApplyPayloadSchema>;
export type AiModelCapabilityPayload = z.infer<typeof AiModelCapabilityPayloadSchema>;
export type OpenRouterProviderQuery = z.infer<typeof OpenRouterProviderQuerySchema>;
