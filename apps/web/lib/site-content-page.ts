import type { Metadata } from "next";
import { unstable_noStore as noStore } from "next/cache";
import { notFound } from "next/navigation";
import { cache } from "react";
import type { SiteContentPublicDetail, SiteContentType } from "@gooes/domain";

import {
  SiteContentApiError,
  getPublicSiteContentDetail,
} from "@/lib/site-content-api";
import {
  getPreviewSiteContentForServerPath,
  withPreviewRobots,
} from "@/lib/site-content-preview";

const COLLECTIONS: Record<SiteContentType, "articles" | "cases" | "cities"> = {
  article: "articles",
  case: "cases",
  city: "cities",
};
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type SiteContentPageDetail = SiteContentPublicDetail & {
  readonly preview?: boolean;
  readonly versionId?: string;
};

export const getSiteContentDetailForPage = cache(
  async (contentType: SiteContentType, slug: string): Promise<SiteContentPageDetail> => {
    if (!SLUG_PATTERN.test(slug) || slug.length > 200) notFound();

    const path = `/${COLLECTIONS[contentType]}/${slug}`;
    const preview = await getPreviewSiteContentForServerPath(path);
    if (preview) {
      noStore();
      if (preview.contentType !== contentType) notFound();
      return preview;
    }

    try {
      const detail = await getPublicSiteContentDetail(contentType, slug);
      if (detail.contentType !== contentType) notFound();
      return detail;
    } catch (error) {
      if (error instanceof SiteContentApiError && error.status === 404) notFound();
      throw error;
    }
  },
);

export function buildSiteContentMetadata(
  content: SiteContentPageDetail,
  path: string,
): Metadata {
  const description = content.seoDescription ?? content.summary ?? content.title;
  const metadata: Metadata = {
    title: content.seoTitle ?? content.title,
    description,
    alternates: { canonical: content.canonicalUrl ?? path },
    openGraph: {
      title: content.seoTitle ?? content.title,
      description,
      type: content.contentType === "article" ? "article" : "website",
      url: content.canonicalUrl ?? path,
      ...(content.cover
        ? {
            images: [
              {
                url: content.cover.src,
                width: content.cover.width,
                height: content.cover.height,
                alt: content.cover.alt,
              },
            ],
          }
        : {}),
    },
  };

  return withPreviewRobots(metadata, content);
}

export function parseContentListPage(
  value: string | readonly string[] | undefined,
): number {
  if (typeof value !== "string" || !/^\d+$/.test(value)) return 1;
  const page = Number(value);
  return Number.isSafeInteger(page) && page >= 1 ? page : 1;
}
