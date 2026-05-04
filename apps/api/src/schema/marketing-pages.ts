import { z } from "zod";
import {
  MARKETING_PAGE_BLOCK_TYPE_VALUES,
  MARKETING_PAGE_DISPLAY_SCENE_VALUES,
  MARKETING_PAGE_EVENT_NAME_VALUES,
  MARKETING_PAGE_STATUS_VALUES,
  MARKETING_LEAD_STATUS_VALUES,
} from "@gooes/domain";
import { PaginationQuerySchema } from "@/schema/request";

function optionalQueryValue<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess((value) => {
    if (value == null) {
      return undefined;
    }

    if (typeof value === "string") {
      const normalized = value.trim();
      if (
        normalized === "" ||
        normalized === "undefined" ||
        normalized === "null" ||
        normalized === "all"
      ) {
        return undefined;
      }

      return normalized;
    }

    return value;
  }, schema.optional());
}

const JsonObjectSchema = z.record(z.string(), z.unknown());

const OptionalDateTimeSchema = z.preprocess((value) => {
  if (value == null || value === "") {
    return null;
  }

  return value;
}, z.iso.datetime("无效的时间").nullable());

export const MarketingPageSlugSchema = z
  .string("页面路径不能为空")
  .trim()
  .toLowerCase()
  .min(1, "页面路径不能为空")
  .max(80, "页面路径不能超过 80 个字符")
  .regex(
    /^[a-z0-9]([a-z0-9-]{0,78}[a-z0-9])?$/,
    "页面路径只能包含小写字母、数字和中划线，且不能以中划线开头或结尾",
  );

export const MarketingPageBlockSchema = z.object({
  id: z.string().trim().min(1, "模块 ID 不能为空").max(80, "模块 ID 过长"),
  type: z.enum(MARKETING_PAGE_BLOCK_TYPE_VALUES, {
    message: "无效的营销页模块类型",
  }),
  props: JsonObjectSchema.default({}),
});

export const MarketingPageConfigSchema = z.object({
  schemaVersion: z.coerce
    .number("配置版本必须是数字")
    .int("配置版本必须是整数")
    .min(1, "配置版本必须大于 0")
    .default(1),
  title: z.string().trim().max(120, "页面标题不能超过 120 个字符").optional(),
  theme: JsonObjectSchema.optional(),
  blocks: z
    .array(MarketingPageBlockSchema, {
      message: "页面模块配置必须是数组",
    })
    .max(80, "页面模块不能超过 80 个")
    .default([]),
}).passthrough();

export const MarketingPageBaseSchema = z.object({
  id: z.uuid("无效的营销页 ID").optional(),
  title: z
    .string("页面标题不能为空")
    .trim()
    .min(1, "页面标题不能为空")
    .max(120, "页面标题不能超过 120 个字符"),
  slug: MarketingPageSlugSchema,
  status: z.enum(MARKETING_PAGE_STATUS_VALUES, {
    message: "无效的营销页状态",
  }).default("draft"),
  description: z.string().trim().max(500, "页面描述不能超过 500 个字符").nullable().optional(),
  cover_image: z.string().trim().max(2048, "封面地址过长").nullable().optional(),
  display_scene: z.enum(MARKETING_PAGE_DISPLAY_SCENE_VALUES, {
    message: "无效的展示场景",
  }).default("all"),
  sort_order: z.coerce
    .number("排序值必须是数字")
    .int("排序值必须是整数")
    .min(0, "排序值不能小于 0")
    .max(9999, "排序值不能超过 9999")
    .default(100),
  start_at: OptionalDateTimeSchema.optional(),
  end_at: OptionalDateTimeSchema.optional(),
  published_version_id: z.uuid("无效的发布版本 ID").nullable().optional(),
  created_by: z.uuid("无效的创建人 ID").nullable().optional(),
  updated_by: z.uuid("无效的更新人 ID").nullable().optional(),
  published_by: z.uuid("无效的发布人 ID").nullable().optional(),
  published_at: z.iso.datetime("无效的发布时间").nullable().optional(),
  created_at: z.iso.datetime("无效的创建时间").nullable().optional(),
  updated_at: z.iso.datetime("无效的更新时间").nullable().optional(),
});

export const CreateMarketingPageSchema = MarketingPageBaseSchema.pick({
  title: true,
  slug: true,
  description: true,
  cover_image: true,
  display_scene: true,
  sort_order: true,
  start_at: true,
  end_at: true,
}).extend({
  config: MarketingPageConfigSchema.optional(),
});

export const UpdateMarketingPageSchema = MarketingPageBaseSchema.pick({
  title: true,
  slug: true,
  description: true,
  cover_image: true,
  display_scene: true,
  sort_order: true,
  start_at: true,
  end_at: true,
}).partial();

export const MarketingPageListQuerySchema = PaginationQuerySchema.extend({
  status: optionalQueryValue(
    z.enum(MARKETING_PAGE_STATUS_VALUES, {
      message: "无效的营销页状态",
    }),
  ),
  keyword: optionalQueryValue(z.string().trim().max(100, "关键词过长")),
});

export const PublicMarketingPageListQuerySchema = z.object({
  scene: optionalQueryValue(
    z.enum(MARKETING_PAGE_DISPLAY_SCENE_VALUES, {
      message: "无效的展示场景",
    }),
  ),
});

export const MarketingPageIdParamsSchema = z.object({
  id: z.uuid("无效的营销页 ID"),
});

export const MarketingPageSlugParamsSchema = z.object({
  slug: MarketingPageSlugSchema,
});

export const SaveMarketingPageDraftSchema = z.object({
  config: MarketingPageConfigSchema,
});

export const DuplicateMarketingPageSchema = z.object({
  title: z.string().trim().min(1, "页面标题不能为空").max(120, "页面标题不能超过 120 个字符").optional(),
  slug: MarketingPageSlugSchema.optional(),
});

export const MarketingLeadListQuerySchema = PaginationQuerySchema.extend({
  status: optionalQueryValue(
    z.enum(MARKETING_LEAD_STATUS_VALUES, {
      message: "无效的线索状态",
    }),
  ),
  page_id: optionalQueryValue(z.uuid("无效的活动页 ID")),
  keyword: optionalQueryValue(z.string().trim().max(100, "关键词过长")),
});

export const MarketingLeadIdParamsSchema = z.object({
  id: z.uuid("无效的营销线索 ID"),
});

export const UpdateMarketingLeadSchema = z.object({
  lead_status: z.enum(MARKETING_LEAD_STATUS_VALUES, {
    message: "无效的线索状态",
  }),
  follow_remark: z.string().trim().max(1000, "跟进备注不能超过 1000 个字符").nullable().optional(),
});

export const ConvertMarketingLeadSchema = z.object({
  follow_remark: z.string().trim().max(1000, "跟进备注不能超过 1000 个字符").nullable().optional(),
});

export const SubmitMarketingLeadSchema = z.object({
  name: z.string().trim().max(50, "姓名不能超过 50 个字符").nullable().optional(),
  phone: z
    .string()
    .trim()
    .min(1, "请输入有效的手机号")
    .regex(/^1[3-9]\d{9}$/, "请输入有效的手机号"),
  community: z.string().trim().max(120, "小区名称不能超过 120 个字符").nullable().optional(),
  city: z.string().trim().max(80, "城市不能超过 80 个字符").nullable().optional(),
  form_data: JsonObjectSchema.default({}),
  token: z.string().trim().max(2048, "身份凭证过长").optional(),
});

export const TrackMarketingEventSchema = z.object({
  event_name: z.enum(MARKETING_PAGE_EVENT_NAME_VALUES, {
    message: "无效的埋点事件",
  }),
  block_id: z.string().trim().max(80, "模块 ID 过长").nullable().optional(),
  payload: JsonObjectSchema.default({}),
  token: z.string().trim().max(2048, "身份凭证过长").optional(),
});

export type CreateMarketingPageInput = z.infer<typeof CreateMarketingPageSchema>;
export type UpdateMarketingPageInput = z.infer<typeof UpdateMarketingPageSchema>;
export type MarketingPageListQuery = z.infer<typeof MarketingPageListQuerySchema>;
export type PublicMarketingPageListQuery = z.infer<typeof PublicMarketingPageListQuerySchema>;
export type MarketingPageConfigInput = z.infer<typeof MarketingPageConfigSchema>;
export type DuplicateMarketingPageInput = z.infer<typeof DuplicateMarketingPageSchema>;
export type MarketingLeadListQuery = z.infer<typeof MarketingLeadListQuerySchema>;
export type UpdateMarketingLeadInput = z.infer<typeof UpdateMarketingLeadSchema>;
export type ConvertMarketingLeadInput = z.infer<typeof ConvertMarketingLeadSchema>;
export type SubmitMarketingLeadInput = z.infer<typeof SubmitMarketingLeadSchema>;
export type TrackMarketingEventInput = z.infer<typeof TrackMarketingEventSchema>;
