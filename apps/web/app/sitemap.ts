import type { MetadataRoute } from "next";
import type { SiteContentType } from "@gooes/domain";

import {
  SiteContentApiError,
  getPublicSiteContentList,
} from "@/lib/site-content-api";

const SITE_URL = "https://www.goodcms.cn";
const SITEMAP_PAGE_SIZE = 100;
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
      entries.push(...await readPublishedCollection(contentType));
    } catch (error) {
      const requestId = error instanceof SiteContentApiError
        ? error.requestId ?? "unavailable"
        : "unavailable";
      console.error("官网 Sitemap 内容读取失败", { contentType, requestId });
    }
  }

  return entries;
}

async function readPublishedCollection(
  contentType: SiteContentType,
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
