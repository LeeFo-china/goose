import { PaginationQuerySchema } from "@/schema/request";
import { z } from "zod";

export const PictureAssetStatusSchema = z.enum(["draft", "published", "hidden", "deleted"]);
export const PictureCategoryStatusSchema = z.enum(["active", "inactive"]);
export const PictureCommentStatusSchema = z.enum(["pending", "visible", "hidden", "rejected", "deleted"]);

export const PictureLibraryIdParamsSchema = z.object({
  id: z.uuid("无效的 ID"),
});

const OptionalTextSchema = (max: number, message: string) =>
  z.preprocess((value) => {
    if (value === undefined || value === null) return undefined;
    if (typeof value === "string" && value.trim() === "") return undefined;
    return value;
  }, z.string().trim().max(max, message).optional());

const NullableTextSchema = (max: number, message: string) =>
  z.preprocess((value) => {
    if (value === undefined || value === "") return undefined;
    if (value === null) return null;
    return value;
  }, z.string().trim().max(max, message).nullable().optional());

const SortOrderSchema = z.coerce.number().int("排序值必须是整数").min(0, "排序值不能小于 0").max(999999, "排序值过大");

export const PictureCategoryListQuerySchema = z.object({
  status: PictureCategoryStatusSchema.optional(),
  keyword: z.string().trim().max(80, "关键词不能超过 80 个字符").optional(),
});

export const CreatePictureCategorySchema = z.object({
  parent_id: z.uuid("无效的父级分类 ID").nullable().optional(),
  name: z.string().trim().min(1, "请输入分类名称").max(80, "分类名称不能超过 80 个字符"),
  slug: z.string()
    .trim()
    .min(2, "分类标识不能少于 2 个字符")
    .max(80, "分类标识不能超过 80 个字符")
    .regex(/^[a-z0-9][a-z0-9_-]*[a-z0-9]$/, "分类标识只能包含小写字母、数字、下划线和中划线")
    .transform((value) => value.toLowerCase()),
  description: NullableTextSchema(500, "分类说明不能超过 500 个字符"),
  cover_asset_id: z.uuid("无效的封面图片 ID").nullable().optional(),
  sort_order: SortOrderSchema.optional().default(100),
  status: PictureCategoryStatusSchema.optional().default("active"),
});

export const UpdatePictureCategorySchema = z.object({
  parent_id: z.uuid("无效的父级分类 ID").nullable().optional(),
  name: z.string().trim().min(1, "请输入分类名称").max(80, "分类名称不能超过 80 个字符").optional(),
  slug: z.string()
    .trim()
    .min(2, "分类标识不能少于 2 个字符")
    .max(80, "分类标识不能超过 80 个字符")
    .regex(/^[a-z0-9][a-z0-9_-]*[a-z0-9]$/, "分类标识只能包含小写字母、数字、下划线和中划线")
    .transform((value) => value.toLowerCase())
    .optional(),
  description: NullableTextSchema(500, "分类说明不能超过 500 个字符"),
  cover_asset_id: z.uuid("无效的封面图片 ID").nullable().optional(),
  sort_order: SortOrderSchema.optional(),
  status: PictureCategoryStatusSchema.optional(),
}).refine((value) => Object.keys(value).length > 0, {
  message: "至少需要提交一个更新字段",
});

export const PictureAssetListQuerySchema = PaginationQuerySchema.extend({
  status: z.union([PictureAssetStatusSchema, z.literal("all")]).optional(),
  category_id: z.uuid("无效的分类 ID").optional(),
  keyword: z.string().trim().max(80, "关键词不能超过 80 个字符").optional(),
});

export const PictureCommentListQuerySchema = PaginationQuerySchema.extend({
  status: z.union([PictureCommentStatusSchema, z.literal("all")]).optional(),
  asset_id: z.uuid("无效的图片 ID").optional(),
  keyword: z.string().trim().max(80, "关键词不能超过 80 个字符").optional(),
});

export const PictureLibraryHealthQuerySchema = z.object({
  issue_limit: z.coerce.number()
    .int("异常数量必须是整数")
    .min(1, "异常数量必须大于 0")
    .max(100, "异常数量不能超过 100")
    .optional()
    .default(20),
});

const CategoryIdsSchema = z.array(z.uuid("无效的分类 ID")).max(20, "单张图片最多关联 20 个分类");

export const CreatePictureAssetSchema = z.object({
  file_object_id: z.uuid("缺少图片文件"),
  title: z.string().trim().min(1, "请输入图片标题").max(120, "图片标题不能超过 120 个字符"),
  description: NullableTextSchema(1000, "图片说明不能超过 1000 个字符"),
  category_ids: CategoryIdsSchema.default([]),
  status: PictureAssetStatusSchema.exclude(["deleted"]).optional().default("draft"),
  sort_order: SortOrderSchema.optional().default(100),
});

export const UpdatePictureAssetSchema = z.object({
  title: z.string().trim().min(1, "请输入图片标题").max(120, "图片标题不能超过 120 个字符").optional(),
  description: NullableTextSchema(1000, "图片说明不能超过 1000 个字符"),
  category_ids: CategoryIdsSchema.optional(),
  status: PictureAssetStatusSchema.exclude(["deleted"]).optional(),
  sort_order: SortOrderSchema.optional(),
}).refine((value) => Object.keys(value).length > 0, {
  message: "至少需要提交一个更新字段",
});

export type PictureAssetStatus = z.infer<typeof PictureAssetStatusSchema>;
export type PictureCategoryStatus = z.infer<typeof PictureCategoryStatusSchema>;
export type PictureCommentStatus = z.infer<typeof PictureCommentStatusSchema>;
export type PictureCategoryListQuery = z.infer<typeof PictureCategoryListQuerySchema>;
export type CreatePictureCategoryInput = z.infer<typeof CreatePictureCategorySchema>;
export type UpdatePictureCategoryInput = z.infer<typeof UpdatePictureCategorySchema>;
export type PictureAssetListQuery = z.infer<typeof PictureAssetListQuerySchema>;
export type PictureCommentListQuery = z.infer<typeof PictureCommentListQuerySchema>;
export type PictureLibraryHealthQuery = z.infer<typeof PictureLibraryHealthQuerySchema>;
export type CreatePictureAssetInput = z.infer<typeof CreatePictureAssetSchema>;
export type UpdatePictureAssetInput = z.infer<typeof UpdatePictureAssetSchema>;
