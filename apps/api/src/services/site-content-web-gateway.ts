import { createHash, createHmac } from "node:crypto";
import type { SiteContentType } from "@gooes/domain";

import { Errors } from "@/errors/error-factory";

export type SiteContentRevalidatorPort = {
  revalidate(input: {
    entryId: string;
    paths: string[];
    tags: string[];
  }): Promise<{ requestId?: string }>;
};

type RevalidationGatewayDependencies = {
  endpoint?: string;
  secret?: string;
  nowMs?: number;
  fetcher?: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
};

export function buildSiteContentRevalidationCanonical(input: {
  timestamp: string;
  method: string;
  path: string;
  body: string;
}) {
  const bodyHash = createHash("sha256").update(input.body).digest("hex");
  return [input.timestamp, input.method.toUpperCase(), input.path, bodyHash].join("\n");
}

export class WebSiteContentRevalidator implements SiteContentRevalidatorPort {
  constructor(private readonly dependencies: RevalidationGatewayDependencies = {}) {}

  async revalidate(input: { entryId: string; paths: string[]; tags: string[] }) {
    const endpoint = this.dependencies.endpoint ?? process.env.GOOES_WEB_REVALIDATE_URL?.trim();
    const secret = this.dependencies.secret ?? process.env.GOOES_WEB_REVALIDATE_SHARED_SECRET?.trim();
    if (!endpoint || !secret || secret.length < 32) {
      throw Errors.business(
        503,
        "官网缓存失效服务未配置",
        "SITE_CONTENT_REVALIDATION_UNAVAILABLE",
      );
    }
    let endpointUrl: URL;
    try {
      endpointUrl = new URL(endpoint);
    } catch {
      throw Errors.business(503, "官网缓存失效服务未配置", "SITE_CONTENT_REVALIDATION_UNAVAILABLE");
    }
    if (
      !["http:", "https:"].includes(endpointUrl.protocol)
      || endpointUrl.username
      || endpointUrl.password
      || endpointUrl.search
      || endpointUrl.hash
      || endpointUrl.pathname !== "/api/revalidate"
    ) {
      throw Errors.business(503, "官网缓存失效服务未配置", "SITE_CONTENT_REVALIDATION_UNAVAILABLE");
    }
    const body = JSON.stringify(input);
    const timestamp = String(Math.floor((this.dependencies.nowMs ?? Date.now()) / 1_000));
    const canonical = buildSiteContentRevalidationCanonical({
      timestamp,
      method: "POST",
      path: endpointUrl.pathname,
      body,
    });
    const signature = createHmac("sha256", secret).update(canonical).digest("hex");
    const response = await (this.dependencies.fetcher ?? fetch)(endpointUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-gooes-revalidation-signature": signature,
        "x-gooes-revalidation-timestamp": timestamp,
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
