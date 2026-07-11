import type {
  SiteContentDraftBlock,
  SiteContentMetadata,
  SiteContentStatus,
  SiteContentType,
} from "@gooes/domain";

export const SITE_CONTENT_DEFAULT_PAGE_SIZE = 20;
export const SITE_CONTENT_MAX_PAGE_SIZE = 100;

export type SiteContentPermission =
  | "platform.site_content.read"
  | "platform.site_content.manage"
  | "platform.site_content.publish";

export type SiteContentPagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};
export type SiteContentEntry = {
  id: string;
  content_type: SiteContentType;
  slug: string;
  status: SiteContentStatus;
  published_version_id: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

export type SiteContentListItem = SiteContentEntry & {
  title: string | null;
};

export type SiteContentVersion = {
  id: string;
  entry_id: string;
  version_no: number;
  title: string;
  summary: string | null;
  cover_file_id: string | null;
  content_blocks: SiteContentDraftBlock[];
  seo_title: string | null;
  seo_description: string | null;
  canonical_url: string | null;
  metadata: SiteContentMetadata;
  created_by: string | null;
  created_at: string;
};

export type SiteContentListData = {
  list: SiteContentListItem[];
  pagination: SiteContentPagination;
};

export type SiteContentVersionListData = {
  list: SiteContentVersion[];
  pagination: SiteContentPagination;
};

export type SiteContentDetail = {
  entry: SiteContentEntry;
  latestVersion: SiteContentVersion | null;
};

export type SiteContentPublicationResult = {
  entry: SiteContentDetail;
  cache_revalidation: {
    status: "succeeded" | "failed";
    requestId?: string;
  };
};

export type SiteContentPreviewResult = {
  previewUrl: string;
  expiresAt: string;
};

export function normalizeSiteContentPageSize(value: string | undefined) {
  const parsed = Number(value ?? SITE_CONTENT_DEFAULT_PAGE_SIZE);
  if (!Number.isFinite(parsed)) return SITE_CONTENT_DEFAULT_PAGE_SIZE;
  return Math.min(SITE_CONTENT_MAX_PAGE_SIZE, Math.max(1, Math.floor(parsed)));
}

export function readPositivePage(value: string | undefined) {
  const parsed = Number(value ?? 1);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

export function hasSiteContentPermission(
  permissions: ReadonlyArray<{ code: string }>,
  permission: SiteContentPermission,
) {
  return permissions.some((item) => item.code === permission);
}

export const siteContentTypeLabels: Record<SiteContentType, string> = {
  article: "文章",
  case: "案例",
  city: "城市页",
};

export const siteContentStatusLabels: Record<SiteContentStatus, string> = {
  draft: "草稿",
  published: "已发布",
  archived: "已归档",
};
