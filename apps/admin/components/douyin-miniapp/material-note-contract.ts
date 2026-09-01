import {
  DOUYIN_MATERIAL_NOTE_STATUS_VALUES,
  DouyinMaterialNoteTenantDetailSchema,
  DouyinMaterialNoteTenantListSchema,
  DouyinMaterialNoteTenantVersionListSchema,
  DouyinMaterialNoteTenantVersionSchema,
  DouyinMaterialNoteVersionDraftSchema,
  type DouyinMaterialNoteStatus,
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

export type MaterialNoteAction = "publish" | "archive" | "withdraw";

const idSchema = z.string().uuid();
const timestampSchema = z.string().datetime({ offset: true });

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
  string | undefined
>>): MaterialNoteFilters {
  const parsedPage = Number(input.page ?? 1);
  const parsedPageSize = Number(input.pageSize ?? MATERIAL_NOTE_DEFAULT_PAGE_SIZE);
  const status = input.status?.trim() ?? "";
  return {
    page: Number.isFinite(parsedPage) && parsedPage >= 1
      ? Math.floor(parsedPage)
      : 1,
    pageSize: Number.isFinite(parsedPageSize) && parsedPageSize >= 1
      ? Math.min(MATERIAL_NOTE_MAX_PAGE_SIZE, Math.floor(parsedPageSize))
      : MATERIAL_NOTE_DEFAULT_PAGE_SIZE,
    status: statusSet.has(status) ? status as DouyinMaterialNoteStatus : "",
    keyword: (input.keyword ?? "").trim().slice(0, 120),
  };
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

export function parseMaterialNoteDraft(value: unknown): DouyinMaterialNoteVersionDraft {
  return DouyinMaterialNoteVersionDraftSchema.parse(value);
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
