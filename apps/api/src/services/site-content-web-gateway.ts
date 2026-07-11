import { createHmac } from "node:crypto";
import type { SiteContentType } from "@gooes/domain";

import { Errors } from "@/errors/error-factory";

export type SiteContentRevalidatorPort = {
  revalidate(input: {
    entryId: string;
    paths: string[];
    tags: string[];
  }): Promise<{ requestId?: string }>;
};

class WebSiteContentRevalidator implements SiteContentRevalidatorPort {
  async revalidate(input: { entryId: string; paths: string[]; tags: string[] }) {
    const endpoint = process.env.GOOES_WEB_REVALIDATE_URL?.trim();
    const secret = process.env.GOOES_WEB_REVALIDATE_SHARED_SECRET?.trim();
    if (!endpoint || !secret || secret.length < 32) {
      throw Errors.business(
        503,
        "官网缓存失效服务未配置",
        "SITE_CONTENT_REVALIDATION_UNAVAILABLE",
      );
    }
    const body = JSON.stringify(input);
    const signature = createHmac("sha256", secret).update(body).digest("hex");
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-gooes-revalidation-signature": signature,
      },
      body,
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) {
      throw Errors.business(
        502,
        "官网缓存失效请求失败",
        "SITE_CONTENT_REVALIDATION_FAILED",
        { status: response.status },
      );
    }
    return { requestId: response.headers.get("x-request-id") ?? undefined };
  }
}

export function buildSiteContentPreviewUrl(baseUrl: string | undefined, token: string) {
  if (!baseUrl) {
    throw Errors.business(503, "官网 Preview 地址未配置", "SITE_PREVIEW_URL_UNAVAILABLE");
  }
  let url: URL;
  try {
    url = new URL("/api/preview", baseUrl);
  } catch {
    throw Errors.business(503, "官网 Preview 地址配置无效", "SITE_PREVIEW_URL_UNAVAILABLE");
  }
  if ((url.protocol !== "https:" && url.protocol !== "http:") || url.username || url.password) {
    throw Errors.business(503, "官网 Preview 地址配置无效", "SITE_PREVIEW_URL_UNAVAILABLE");
  }
  url.searchParams.set("token", token);
  return url.toString();
}

export function buildSiteContentPublicPath(entry: {
  content_type: SiteContentType;
  slug: string;
}) {
  const collection = entry.content_type === "article"
    ? "articles"
    : entry.content_type === "case"
      ? "cases"
      : "cities";
  return `/${collection}/${entry.slug}`;
}

export const webSiteContentRevalidator = new WebSiteContentRevalidator();
