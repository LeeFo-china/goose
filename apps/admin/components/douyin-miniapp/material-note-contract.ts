import {
  DOUYIN_MATERIAL_NOTE_STATUS_VALUES,
  DOUYIN_MATERIAL_NOTE_CATEGORY_STATUS_VALUES,
  DouyinMaterialNoteCategoryListSchema,
  DouyinMaterialNoteCategorySchema,
  DouyinMaterialNoteTenantDetailSchema,
  DouyinMaterialNoteTenantListSchema,
  DouyinMaterialNoteTenantVersionListSchema,
  DouyinMaterialNoteTenantVersionSchema,
  DouyinMaterialNoteVersionDraftSchema,
  type DouyinMaterialNoteStatus,
  type DouyinMaterialNoteCategory,
  type DouyinMaterialNoteCategoryList,
  type DouyinMaterialNoteCategoryStatus,
  type DouyinMaterialNoteTenantDetail,
  type DouyinMaterialNoteTenantList,
  type DouyinMaterialNoteTenantVersion,
  type DouyinMaterialNoteTenantVersionList,
  type DouyinMaterialNoteVersionDraft,
} from "@gooes/domain";
import { z } from "zod";

export const MATERIAL_NOTE_DEFAULT_PAGE_SIZE = 20;
export const MATERIAL_NOTE_MAX_PAGE_SIZE = 100;

export type MaterialNoteFilters = {
  page: number;
  pageSize: number;
  status: DouyinMaterialNoteStatus | "";
  keyword: string;
};

export type MaterialNoteCategoryFilters = {
  page: number;
  pageSize: number;
  keyword: string;
  status: DouyinMaterialNoteCategoryStatus | "";
};

export type MaterialNoteAction = "publish" | "archive" | "withdraw";

const idSchema = z.string().uuid();
const timestampSchema = z.string().datetime({ offset: true });
const categoryStatusSet = new Set<string>(DOUYIN_MATERIAL_NOTE_CATEGORY_STATUS_VALUES);

export const MaterialNoteCategoryCreateSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.preprocess((value) => {
    if (typeof value !== "string") return value;
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }, z.string().trim().min(1).max(300).nullable()).optional().default(null),
  sort_order: z.number().int().min(0).max(100_000).optional().default(0),
}).strict();

export const MaterialNoteCreateResultSchema = z.object({
  note_id: idSchema,
  version_id: idSchema,
  version_no: z.number().int().positive(),
  status: z.literal("draft"),
}).strict();

export const MaterialNoteAppendResultSchema = MaterialNoteCreateResultSchema.extend({
  status: z.enum(DOUYIN_MATERIAL_NOTE_STATUS_VALUES),
}).strict();

export const MaterialNoteTransitionResultSchema = z.object({
  note_id: idSchema,
  status: z.enum(DOUYIN_MATERIAL_NOTE_STATUS_VALUES),
  published_version_id: idSchema.nullable(),
  published_at: timestampSchema.nullable(),
}).strict().superRefine((value, context) => {
  const hasPublishedVersion = value.published_version_id !== null;
  const hasPublishedAt = value.published_at !== null;
  const isInvalid = value.status === "draft"
    ? hasPublishedVersion || hasPublishedAt
    : value.status === "published"
      ? !hasPublishedVersion || !hasPublishedAt
      : hasPublishedVersion !== hasPublishedAt;
  if (isInvalid) {
    context.addIssue({
      code: "custom",
      path: ["published_version_id"],
      message: "资料发布版本和时间组合无效",
    });
  }
});

const statusSet = new Set<string>(DOUYIN_MATERIAL_NOTE_STATUS_VALUES);

export const materialNoteStatusLabels: Record<DouyinMaterialNoteStatus, string> = {
  draft: "草稿",
  published: "已发布",
  archived: "已归档",
  withdrawn: "已撤回",
};

export function normalizeMaterialNoteFilters(input: Partial<Record<
  "page" | "pageSize" | "status" | "keyword",
  unknown
>>): MaterialNoteFilters {
  const pageValue = firstSearchParamString(input.page);
  const pageSizeValue = firstSearchParamString(input.pageSize);
  const status = firstSearchParamString(input.status)?.trim() ?? "";
  const keyword = firstSearchParamString(input.keyword) ?? "";
  const parsedPage = Number(pageValue ?? 1);
  const parsedPageSize = Number(pageSizeValue ?? MATERIAL_NOTE_DEFAULT_PAGE_SIZE);
  return {
    page: Number.isFinite(parsedPage) && parsedPage >= 1
      ? Math.floor(parsedPage)
      : 1,
    pageSize: Number.isFinite(parsedPageSize) && parsedPageSize >= 1
      ? Math.min(MATERIAL_NOTE_MAX_PAGE_SIZE, Math.floor(parsedPageSize))
      : MATERIAL_NOTE_DEFAULT_PAGE_SIZE,
    status: statusSet.has(status) ? status as DouyinMaterialNoteStatus : "",
    keyword: keyword.trim().slice(0, 120),
  };
}

function firstSearchParamString(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return undefined;
  return typeof value[0] === "string" ? value[0] : undefined;
}

export function buildMaterialNoteListQuery(filters: MaterialNoteFilters): URLSearchParams {
  const query = new URLSearchParams({
    page: String(filters.page),
    pageSize: String(filters.pageSize),
  });
  if (filters.status) query.set("status", filters.status);
  if (filters.keyword) query.set("keyword", filters.keyword);
  return query;
}

export function buildMaterialNoteCategoryListQuery(
  filters: MaterialNoteCategoryFilters,
): URLSearchParams {
  const query = new URLSearchParams({
    page: String(filters.page),
    pageSize: String(Math.min(MATERIAL_NOTE_MAX_PAGE_SIZE, filters.pageSize)),
  });
  if (filters.keyword) query.set("keyword", filters.keyword);
  if (categoryStatusSet.has(filters.status)) query.set("status", filters.status);
  return query;
}

export function assertMaterialNoteRequestedPage(
  actual: { page: number; pageSize: number },
  requested: { page: number; pageSize: number },
): void {
  if (actual.page !== requested.page || actual.pageSize !== requested.pageSize) {
    throw new Error("分页响应与请求不一致");
  }
}

export function parseMaterialNoteList(value: unknown): DouyinMaterialNoteTenantList {
  return DouyinMaterialNoteTenantListSchema.parse(value);
}

export function parseMaterialNoteDetail(value: unknown): DouyinMaterialNoteTenantDetail {
  return DouyinMaterialNoteTenantDetailSchema.parse(value);
}

export function parseMaterialNoteVersionList(
  value: unknown,
): DouyinMaterialNoteTenantVersionList {
  return DouyinMaterialNoteTenantVersionListSchema.parse(value);
}

export function parseMaterialNoteVersion(value: unknown): DouyinMaterialNoteTenantVersion {
  return DouyinMaterialNoteTenantVersionSchema.parse(value);
}

export function parseMaterialNoteCategory(value: unknown): DouyinMaterialNoteCategory {
  return DouyinMaterialNoteCategorySchema.parse(value);
}

export function parseMaterialNoteCategoryList(value: unknown): DouyinMaterialNoteCategoryList {
  return DouyinMaterialNoteCategoryListSchema.parse(value);
}

export function parseMaterialNoteDraft(value: unknown): DouyinMaterialNoteVersionDraft {
  return DouyinMaterialNoteVersionDraftSchema.parse(value);
}

export function parseMaterialNoteCategoryCreate(value: unknown) {
  return MaterialNoteCategoryCreateSchema.parse(value);
}

export function parseMaterialNoteCreateResult(value: unknown) {
  return MaterialNoteCreateResultSchema.parse(value);
}

export function parseMaterialNoteAppendResult(value: unknown) {
  return MaterialNoteAppendResultSchema.parse(value);
}

export function parseMaterialNoteTransitionResult(value: unknown) {
  return MaterialNoteTransitionResultSchema.parse(value);
}

export function getMaterialNotePermissions(permissions: readonly string[]) {
  const permissionSet = new Set(permissions);
  return {
    canRead: permissionSet.has("douyin_material_note.read"),
    canManage: permissionSet.has("douyin_material_note.manage"),
    canPublish: permissionSet.has("douyin_material_note.publish"),
  };
}

export function getMaterialNoteActions(
  status: DouyinMaterialNoteStatus,
  canPublish: boolean,
): MaterialNoteAction[] {
  if (!canPublish || status === "withdrawn") return [];
  if (status === "draft") return ["publish", "archive"];
  if (status === "published") return ["publish", "archive", "withdraw"];
  return ["publish", "withdraw"];
}
