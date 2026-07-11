import {
  SITE_CONTENT_STATUS_VALUES,
  SITE_CONTENT_TYPE_VALUES,
  SiteContentDraftSchema,
} from "@gooes/domain";
import { z } from "zod";

import { PaginationQuerySchema } from "@/schema/request";

const SlugSchema = z
  .string()
  .trim()
  .min(1, "内容 slug 不能为空")
  .max(200, "内容 slug 不能超过 200 个字符")
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "内容 slug 格式无效");

const ShortTextSchema = z.string().trim().min(1).max(300);

export const SiteContentArticleMetadataSchema = z.strictObject({
  category: ShortTextSchema,
  author: ShortTextSchema,
  displayPublishedAt: z.iso.datetime({ offset: true }),
});

export const SiteContentCaseMetadataSchema = z.strictObject({
  city: ShortTextSchema,
  areaSquareMeters: z.number().positive().max(100_000),
  decorationType: ShortTextSchema,
  metrics: z
    .array(z.strictObject({ label: ShortTextSchema, value: ShortTextSchema }))
    .max(24)
    .default([]),
});

export const SiteContentCityMetadataSchema = z.strictObject({
  administrativeCode: z.string().trim().regex(/^\d{6,12}$/, "行政区编码格式无效"),
  cityName: ShortTextSchema,
  localServiceIntroduction: z.string().trim().min(1).max(5_000),
});

export const SiteContentMetadataSchema = z.union([
  SiteContentArticleMetadataSchema,
  SiteContentCaseMetadataSchema,
  SiteContentCityMetadataSchema,
]);

export const SiteContentIdParamSchema = z.strictObject({
  id: z.uuid("无效的官网内容 ID"),
});

export const SiteContentSlugParamSchema = z.strictObject({ slug: SlugSchema });

export const SiteContentListQuerySchema = PaginationQuerySchema.extend({
  contentType: z.enum(SITE_CONTENT_TYPE_VALUES).optional(),
  status: z.enum(SITE_CONTENT_STATUS_VALUES).optional(),
  keyword: z.string().trim().max(120, "关键词不能超过 120 个字符").optional(),
});

export const SiteContentPaginationQuerySchema = PaginationQuerySchema;

export const CreateSiteContentVersionSchema = SiteContentDraftSchema.extend({
  metadata: SiteContentMetadataSchema.optional(),
}).strict();

const ArticleVersionSchema = SiteContentDraftSchema.extend({
  metadata: SiteContentArticleMetadataSchema,
}).strict();
const CaseVersionSchema = SiteContentDraftSchema.extend({
  metadata: SiteContentCaseMetadataSchema,
}).strict();
const CityVersionSchema = SiteContentDraftSchema.extend({
  metadata: SiteContentCityMetadataSchema,
}).strict();

export const CreateSiteContentEntrySchema = z.discriminatedUnion("contentType", [
  z.strictObject({ contentType: z.literal("article"), slug: SlugSchema, version: ArticleVersionSchema }),
  z.strictObject({ contentType: z.literal("case"), slug: SlugSchema, version: CaseVersionSchema }),
  z.strictObject({ contentType: z.literal("city"), slug: SlugSchema, version: CityVersionSchema }),
]);

export const UpdateSiteContentEntrySchema = z
  .strictObject({ slug: SlugSchema.optional() })
  .refine((value) => value.slug !== undefined, "至少提供一个可更新字段");

export const SiteContentVersionActionSchema = z.strictObject({
  versionId: z.uuid("无效的官网内容版本 ID"),
});

export const CreateSitePreviewTokenSchema = z.strictObject({
  versionId: z.uuid("无效的官网内容版本 ID"),
});

export const ConsumeSitePreviewTokenSchema = z.strictObject({
  token: z.string().trim().min(32, "Preview token 格式无效").max(512),
});

export type SiteContentListQuery = z.infer<typeof SiteContentListQuerySchema>;
export type CreateSiteContentEntryInput = z.infer<typeof CreateSiteContentEntrySchema>;
export type UpdateSiteContentEntryInput = z.infer<typeof UpdateSiteContentEntrySchema>;
export type CreateSiteContentVersionInput = z.infer<typeof CreateSiteContentVersionSchema>;
export type SiteContentVersionActionInput = z.infer<typeof SiteContentVersionActionSchema>;
