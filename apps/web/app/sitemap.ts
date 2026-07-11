import type { MetadataRoute } from "next";
import type { SiteContentType } from "@gooes/domain";

import {
  SiteContentApiError,
  getPublicSiteContentList,
} from "@/lib/site-content-api";

const SITE_URL = "https://www.goodcms.cn";
const SITEMAP_PAGE_SIZE = 100;
const SITEMAP_MAX_URLS = 49_000;
const SITEMAP_MAX_PAGES_PER_COLLECTION = 490;
const STATIC_PATHS = [
  "/",
  "/products",
  "/solutions",
  "/about",
  "/partners",
  "/articles",
  "/cases",
] as const;
const COLLECTION_PATHS: Record<SiteContentType, string> = {
  article: "articles",
  case: "cases",
  city: "cities",
};

export const revalidate = 300;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = STATIC_PATHS.map((path) => ({
    url: new URL(path, SITE_URL).toString(),
  }));

  for (const contentType of Object.keys(COLLECTION_PATHS) as SiteContentType[]) {
    try {
      entries.push(...await readPublishedCollection(
        contentType,
        SITEMAP_MAX_URLS - entries.length,
      ));
    } catch (error) {
      console.error("官网 Sitemap 内容读取失败", {
        contentType,
        ...describeSitemapError(error),
      });
    }
  }

  return entries;
}

async function readPublishedCollection(
  contentType: SiteContentType,
  remainingUrls: number,
): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    const result = await getPublicSiteContentList(contentType, {
      page,
      pageSize: SITEMAP_PAGE_SIZE,
    });
    totalPages = result.pagination.totalPages;
    if (totalPages > SITEMAP_MAX_PAGES_PER_COLLECTION) {
      throw new SitemapBoundaryError(
        "SITEMAP_PAGE_LIMIT_EXCEEDED",
        "page_limit",
      );
    }
    if (result.pagination.total > remainingUrls) {
      throw new SitemapBoundaryError(
        "SITEMAP_URL_LIMIT_EXCEEDED",
        "url_limit",
      );
    }
    entries.push(...result.list.map((content) => ({
      url: new URL(
        `/${COLLECTION_PATHS[contentType]}/${content.slug}`,
        SITE_URL,
      ).toString(),
      lastModified: new Date(content.publishedAt),
    })));
    page += 1;
  }

  return entries;
}

class SitemapBoundaryError extends Error {
  readonly status = 422;

  constructor(
    readonly code: "SITEMAP_PAGE_LIMIT_EXCEEDED" | "SITEMAP_URL_LIMIT_EXCEEDED",
    readonly category: "page_limit" | "url_limit",
  ) {
    super(code);
    this.name = "SitemapBoundaryError";
  }
}

function describeSitemapError(error: unknown) {
  if (error instanceof SiteContentApiError) {
    return {
      requestId: error.requestId ?? "unavailable",
      status: error.status,
      code: error.code,
      category: error.category,
    };
  }
  if (error instanceof SitemapBoundaryError) {
    return {
      requestId: "unavailable",
      status: error.status,
      code: error.code,
      category: error.category,
    };
  }
  return {
    requestId: "unavailable",
    status: 500,
    code: "SITEMAP_CONTENT_INVALID",
    category: "invalid_response",
  };
}
