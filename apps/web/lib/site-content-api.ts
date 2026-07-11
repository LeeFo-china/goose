import { createHash, createHmac } from "node:crypto";
import {
  SiteContentPublicDetailSchema,
  SiteContentPublicListSchema,
  type SiteContentPublicDetail,
  type SiteContentType,
} from "@gooes/domain";
import { z } from "zod";

import { buildBackendUrl } from "./backend";
import { readPreviewSession } from "./preview-session";

const PUBLIC_CACHE_SECONDS = 300;
export const SITE_CONTENT_PREVIEW_TIMEOUT_MS = 5_000;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const COLLECTIONS: Record<SiteContentType, "articles" | "cases" | "cities"> = {
  article: "articles",
  case: "cases",
  city: "cities",
};

type Fetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
type NextRequestInit = RequestInit & {
  next?: { readonly revalidate: number; readonly tags: readonly string[] };
};

const ApiEnvelopeSchema = z.strictObject({
  data: z.unknown(),
  message: z.string(),
});
const ApiErrorEnvelopeSchema = z.strictObject({
  success: z.literal(false),
  message: z.string().max(1_000),
  code: z.string().min(1).max(120),
  details: z.unknown().optional(),
  requestId: z.string().max(200).optional(),
});
const PreviewTokenResultSchema = z.strictObject({
  entryId: z.uuid(),
  versionId: z.uuid(),
  path: z.string().regex(/^\/(?:articles|cases|cities)\/[a-z0-9]+(?:-[a-z0-9]+)*$/).max(220),
  expiresAt: z.iso.datetime({ offset: true }),
});

interface PublicListOptions {
  readonly page?: number;
  readonly pageSize?: number;
  readonly fetcher?: Fetcher;
}

interface PublicDetailOptions {
  readonly fetcher?: Fetcher;
}

interface PreviewHeadersInput {
  readonly secret: string;
  readonly timestamp: string;
  readonly method: string;
  readonly path: string;
  readonly body: string;
}

interface PreviewFetchOptions {
  readonly sessionValue: string;
  readonly sessionSecret: string;
  readonly previewSecret: string;
  readonly fetcher?: Fetcher;
  readonly nowMs?: number;
}

export class SiteContentApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId?: string;

  constructor(status: number, code: string, requestId?: string) {
    super("官网内容服务暂时不可用");
    this.name = "SiteContentApiError";
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}

export async function getPublicSiteContentList(
  contentType: SiteContentType,
  options: PublicListOptions = {},
) {
  const page = options.page ?? 1;
  const pageSize = options.pageSize ?? 20;
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    throw new Error("官网内容分页参数无效");
  }
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  const path = `/public/site/${COLLECTIONS[contentType]}?${params.toString()}`;
  const response = await (options.fetcher ?? fetch)(buildBackendUrl(path), {
    method: "GET",
    next: {
      revalidate: PUBLIC_CACHE_SECONDS,
      tags: [`site-content:${contentType}`],
    },
  } as NextRequestInit);
  const data = await parseApiData(response, SiteContentPublicListSchema);
  if (data.list.some((item) => item.contentType !== contentType)) {
    throw new Error("官网内容响应格式无效");
  }
  return data;
}

export async function getPublicSiteContentDetail(
  contentType: SiteContentType,
  slug: string,
  options: PublicDetailOptions = {},
): Promise<SiteContentPublicDetail> {
  if (!SLUG_PATTERN.test(slug) || slug.length > 200) throw new Error("官网内容 slug 无效");
  const path = `/public/site/${COLLECTIONS[contentType]}/${encodeURIComponent(slug)}`;
  const response = await (options.fetcher ?? fetch)(buildBackendUrl(path), {
    method: "GET",
    next: {
      revalidate: PUBLIC_CACHE_SECONDS,
      tags: [`site-content-path:${contentType}:${slug}`],
    },
  } as NextRequestInit);
  const detail = await parseApiData(response, SiteContentPublicDetailSchema);
  if (detail.contentType !== contentType) {
    throw new Error("官网内容响应格式无效");
  }
  return detail;
}

export function buildPreviewInternalHeaders(input: PreviewHeadersInput): Headers {
  if (input.secret.trim().length < 32) throw new Error("Preview 内部签名未配置");
  if (!/^\d{10}$/.test(input.timestamp)) throw new Error("Preview 内部签名时间无效");
  const bodyHash = createHash("sha256").update(input.body).digest("hex");
  const canonical = [
    input.timestamp,
    input.method.toUpperCase(),
    input.path,
    bodyHash,
  ].join("\n");
  const signature = createHmac("sha256", input.secret).update(canonical).digest("hex");
  return new Headers({
    "x-gooes-preview-signature": signature,
    "x-gooes-preview-timestamp": input.timestamp,
  });
}

export async function consumeSitePreviewToken(input: {
  readonly token: string;
  readonly secret: string;
  readonly fetcher?: Fetcher;
  readonly nowMs?: number;
}) {
  const path = "/internal/site-content/preview/consume";
  const body = JSON.stringify({ token: input.token });
  const timestamp = String(Math.floor((input.nowMs ?? Date.now()) / 1_000));
  const headers = buildPreviewInternalHeaders({
    secret: input.secret,
    timestamp,
    method: "POST",
    path,
    body,
  });
  headers.set("content-type", "application/json");
  let response: Response;
  try {
    response = await (input.fetcher ?? fetch)(buildBackendUrl(path), {
      method: "POST",
      headers,
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(SITE_CONTENT_PREVIEW_TIMEOUT_MS),
    });
  } catch {
    throw new SiteContentApiError(502, "SITE_CONTENT_PREVIEW_UNAVAILABLE");
  }
  return parseApiData(response, PreviewTokenResultSchema);
}

export async function getPreviewSiteContentForPath(
  path: string,
  options: PreviewFetchOptions,
) {
  const session = readPreviewSession(
    options.sessionValue,
    options.sessionSecret,
    options.nowMs,
  );
  if (!session || session.path !== path) return null;

  const internalPath = `/internal/site-content/versions/${session.versionId}/preview`;
  const timestamp = String(Math.floor((options.nowMs ?? Date.now()) / 1_000));
  const headers = buildPreviewInternalHeaders({
    secret: options.previewSecret,
    timestamp,
    method: "GET",
    path: internalPath,
    body: "",
  });
  let response: Response;
  try {
    response = await (options.fetcher ?? fetch)(buildBackendUrl(internalPath), {
      method: "GET",
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(SITE_CONTENT_PREVIEW_TIMEOUT_MS),
    });
  } catch {
    throw new SiteContentApiError(502, "SITE_CONTENT_PREVIEW_UNAVAILABLE");
  }
  const envelope = await parseEnvelope(response);
  const raw = envelope.data;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("官网内容响应格式无效");
  }
  const { preview, versionId, ...detailInput } = raw as Record<string, unknown>;
  const detail = SiteContentPublicDetailSchema.safeParse(detailInput);
  if (!detail.success || preview !== true || versionId !== session.versionId) {
    throw new Error("官网内容响应格式无效");
  }
  const detailPath = `/${COLLECTIONS[detail.data.contentType]}/${detail.data.slug}`;
  if (detail.data.id !== session.entryId || detailPath !== session.path) {
    throw new Error("Preview 内容与会话不匹配");
  }
  return { ...detail.data, preview: true as const, versionId: session.versionId };
}

async function parseApiData<T>(response: Response, schema: z.ZodType<T>): Promise<T> {
  const envelope = await parseEnvelope(response);
  const result = schema.safeParse(envelope.data);
  if (!result.success) throw new Error("官网内容响应格式无效");
  return result.data;
}

async function parseEnvelope(response: Response) {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error("官网内容响应格式无效");
  }
  if (!response.ok) {
    const errorEnvelope = ApiErrorEnvelopeSchema.safeParse(payload);
    throw new SiteContentApiError(
      response.status,
      errorEnvelope.success ? errorEnvelope.data.code : "SITE_CONTENT_UPSTREAM_ERROR",
      errorEnvelope.success ? errorEnvelope.data.requestId : undefined,
    );
  }
  const envelope = ApiEnvelopeSchema.safeParse(payload);
  if (!envelope.success) throw new Error("官网内容响应格式无效");
  return envelope.data;
}
