import type {
  SiteContentDraftBlock,
  SiteContentMetadata,
  SiteContentType,
} from "@gooes/domain";

import { requestBackendJson } from "@/lib/backend-client";
import type {
  SiteContentDetail,
  SiteContentListData,
  SiteContentPreviewResult,
  SiteContentPublicationResult,
  SiteContentVersion,
  SiteContentVersionListData,
} from "@/components/site-content/site-content-types";

export type SiteContentVersionPayload = {
  title: string;
  summary: string | null;
  coverFileId: string | null;
  blocks: SiteContentDraftBlock[];
  seoTitle: string | null;
  seoDescription: string | null;
  canonicalUrl: string | null;
  metadata: SiteContentMetadata;
};

type SiteContentRequestError = Error & {
  status?: number;
  code?: string;
  requestId?: string;
};

export function getSiteContentErrorMessage(error: unknown, fallback: string) {
  const requestError = error as SiteContentRequestError;
  if (requestError.code === "SITE_CONTENT_SLUG_CONFLICT" || requestError.status === 409) {
    return "该类型下的 slug 已存在，请更换后重试";
  }
  if (requestError.code === "SITE_CONTENT_NOT_FOUND" || requestError.status === 404) {
    return "内容不存在或已被删除，请返回列表刷新";
  }
  if (requestError.status === 403) return "当前账号没有执行此操作的权限";
  if (requestError.status === 400 || requestError.status === 422) {
    return requestError.message || "提交内容未通过校验，请检查标记字段";
  }
  return requestError instanceof Error && requestError.message
    ? requestError.message
    : fallback;
}

export function listSiteContent(path: string) {
  return requestBackendJson<SiteContentListData>(path, {
    cache: "no-store",
    fallbackMessage: "官网内容列表加载失败",
  });
}

export function getSiteContent(id: string) {
  return requestBackendJson<SiteContentDetail>(`/platform/site-content/${id}`, {
    cache: "no-store",
    fallbackMessage: "官网内容加载失败",
  });
}

export function createSiteContent(input: {
  contentType: SiteContentType;
  slug: string;
  version: SiteContentVersionPayload;
}) {
  return requestBackendJson<SiteContentDetail>("/platform/site-content", {
    method: "POST",
    body: JSON.stringify(input),
    fallbackMessage: "创建官网内容失败",
  });
}

export function updateSiteContentSlug(id: string, slug: string) {
  return requestBackendJson(`/platform/site-content/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ slug }),
    fallbackMessage: "更新 slug 失败",
  });
}

export function createSiteContentVersion(id: string, version: SiteContentVersionPayload) {
  return requestBackendJson<SiteContentVersion>(`/platform/site-content/${id}/versions`, {
    method: "POST",
    body: JSON.stringify(version),
    fallbackMessage: "保存内容版本失败",
  });
}

export function listSiteContentVersions(id: string, page: number) {
  const query = new URLSearchParams({ page: String(page), pageSize: "20" });
  return requestBackendJson<SiteContentVersionListData>(
    `/platform/site-content/${id}/versions?${query}`,
    { cache: "no-store", fallbackMessage: "版本历史加载失败" },
  );
}

export function createSiteContentPreview(id: string, versionId: string) {
  return requestBackendJson<SiteContentPreviewResult>(
    `/platform/site-content/${id}/preview-token`,
    {
      method: "POST",
      body: JSON.stringify({ versionId }),
      fallbackMessage: "生成预览地址失败",
    },
  );
}

export function mutateSiteContentPublication(input: {
  id: string;
  action: "publish" | "rollback" | "archive";
  versionId?: string;
}) {
  return requestBackendJson<SiteContentPublicationResult>(
    `/platform/site-content/${input.id}/${input.action}`,
    {
      method: "POST",
      body: input.action === "archive"
        ? JSON.stringify({})
        : JSON.stringify({ versionId: input.versionId }),
      fallbackMessage: "官网内容状态更新失败",
    },
  );
}
