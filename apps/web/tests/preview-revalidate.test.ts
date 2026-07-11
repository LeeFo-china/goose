import { createHash, createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, test } from "bun:test";

import {
  buildPreviewInternalHeaders,
  getPreviewSiteContentForPath,
  getPublicSiteContentDetail,
  getPublicSiteContentList,
  SiteContentApiError,
} from "../lib/site-content-api";
import {
  PREVIEW_SESSION_COOKIE_NAME,
  createPreviewSession,
  readPreviewSession,
} from "../lib/preview-session";
import {
  getPreviewSiteContentForServerPath,
  withPreviewRobots,
} from "../lib/site-content-preview";
import { createPreviewHandler } from "../lib/preview-route";
import {
  MAX_REVALIDATION_BODY_BYTES,
  createRevalidateHandler,
} from "../lib/revalidate-route";

const previousEnvironment = { ...process.env };
const previewSecret = "preview-secret-that-is-at-least-32-bytes";
const sessionSecret = "session-secret-that-is-at-least-32-bytes";
const revalidationSecret = "revalidation-secret-that-is-at-least-32-bytes";
const entryId = "123e4567-e89b-42d3-a456-426614174000";
const versionId = "123e4567-e89b-42d3-a456-426614174001";
const publishedAt = "2026-07-12T08:00:00+08:00";

afterEach(() => {
  process.env = { ...previousEnvironment };
});

function articleDetail(overrides: Record<string, unknown> = {}) {
  return {
    id: entryId,
    contentType: "article",
    slug: "safe-article",
    title: "安全预览",
    summary: "仅供发布前核对",
    cover: null,
    publishedAt,
    metadata: {
      category: "指南",
      author: "鹅班长",
      displayPublishedAt: publishedAt,
    },
    seoTitle: null,
    seoDescription: null,
    canonicalUrl: null,
    blocks: [],
    ...overrides,
  };
}

function apiResponse(data: unknown, status = 200): Response {
  return Response.json({ data, message: "success" }, { status });
}

describe("site content API client", () => {
  test("validates paginated public lists and applies collection cache tags", async () => {
    let requestedUrl = "";
    let requestedInit: RequestInit | undefined;
    const fetcher: typeof fetch = Object.assign(async (input: string | URL | Request, init?: RequestInit) => {
      requestedUrl = String(input);
      requestedInit = init;
      return apiResponse({
        list: [],
        pagination: { page: 2, pageSize: 20, total: 0, totalPages: 0 },
      });
    }, { preconnect: fetch.preconnect });

    await expect(getPublicSiteContentList("article", { page: 2, pageSize: 20, fetcher }))
      .rejects.toThrow("官网内容响应格式无效");

    const validFetcher: typeof fetch = Object.assign(async () => apiResponse({
      list: [],
      pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
    }), { preconnect: fetch.preconnect });
    const result = await getPublicSiteContentList("article", { page: 1, pageSize: 20, fetcher: validFetcher });
    expect(result.pagination.page).toBe(1);
    expect(requestedUrl).toContain("/public/site/articles?page=2&pageSize=20");
    expect(requestedInit?.next).toEqual({ revalidate: 300, tags: ["site-content:article"] });
  });

  test("validates public detail DTOs and rejects dirty upstream data", async () => {
    const validFetcher: typeof fetch = Object.assign(async () => apiResponse(articleDetail()), { preconnect: fetch.preconnect });
    expect((await getPublicSiteContentDetail("article", "safe-article", { fetcher: validFetcher })).id).toBe(entryId);

    const dirtyFetcher: typeof fetch = Object.assign(async () => apiResponse({ ...articleDetail(), created_by: "secret" }), { preconnect: fetch.preconnect });
    await expect(getPublicSiteContentDetail("article", "safe-article", { fetcher: dirtyFetcher }))
      .rejects.toThrow("官网内容响应格式无效");

    const missingFetcher: typeof fetch = Object.assign(async () => Response.json({
      success: false,
      message: "官网内容不存在",
      code: "SITE_CONTENT_NOT_FOUND",
      requestId: "request-1",
    }, { status: 404 }), { preconnect: fetch.preconnect });
    const missing = getPublicSiteContentDetail("article", "missing", { fetcher: missingFetcher });
    await expect(missing).rejects.toBeInstanceOf(SiteContentApiError);
    await expect(missing).rejects.toMatchObject({ status: 404, code: "SITE_CONTENT_NOT_FOUND" });
  });
});

describe("preview internal signing and session", () => {
  test("matches the API canonical golden vector exactly", () => {
    const timestamp = "1783821600";
    const path = "/internal/site-content/preview/consume";
    const body = JSON.stringify({ token: "preview-token" });
    const bodyHash = createHash("sha256").update(body).digest("hex");
    const expected = createHmac("sha256", previewSecret)
      .update(`${timestamp}\nPOST\n${path}\n${bodyHash}`)
      .digest("hex");

    expect(buildPreviewInternalHeaders({
      secret: previewSecret,
      timestamp,
      method: "post",
      path,
      body,
    }).get("x-gooes-preview-signature")).toBe(expected);
  });

  test("rejects missing secrets and creates tamper-proof expiring sessions", () => {
    expect(() => buildPreviewInternalHeaders({
      secret: "short",
      timestamp: "1783821600",
      method: "POST",
      path: "/internal/site-content/preview/consume",
      body: "{}",
    })).toThrow("Preview 内部签名未配置");

    const value = createPreviewSession({
      entryId,
      versionId,
      path: "/articles/safe-article",
      secret: sessionSecret,
      nowMs: 1_783_821_600_000,
    });
    expect(readPreviewSession(value, sessionSecret, 1_783_821_600_001)).toMatchObject({ entryId, versionId });
    expect(readPreviewSession(`${value.slice(0, -1)}x`, sessionSecret, 1_783_821_600_001)).toBeNull();
    expect(readPreviewSession(value, sessionSecret, 1_783_822_501_000)).toBeNull();
  });

  test("activates preview with secure cookie and never redirects or renders the token", async () => {
    const token = "sensitive-preview-token-that-must-not-leak";
    const handler = createPreviewHandler({
      fetcher: Object.assign(async (_input: string | URL | Request, init?: RequestInit) => {
        expect(init?.headers).toBeInstanceOf(Headers);
        expect((init?.headers as Headers).get("x-gooes-preview-signature")).toMatch(/^[0-9a-f]{64}$/);
        return apiResponse({ entryId, versionId, path: "/articles/safe-article", expiresAt: "2026-07-12T10:10:00.000Z" });
      }, { preconnect: fetch.preconnect }),
      previewSecret,
      sessionSecret,
      nowMs: 1_783_821_600_000,
    });
    const response = await handler(new Request(`https://www.goodcms.cn/api/preview?token=${token}`));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/articles/safe-article");
    expect(response.headers.get("location")).not.toContain(token);
    expect(response.headers.get("set-cookie")).toContain(`${PREVIEW_SESSION_COOKIE_NAME}=`);
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")).toContain("Secure");
    expect(response.headers.get("set-cookie")).toContain("SameSite=Lax");
    expect(response.headers.get("set-cookie")).toContain("Max-Age=900");

    const failed = await createPreviewHandler({
      fetcher: Object.assign(async () => apiResponse({ code: "INVALID" }, 401), { preconnect: fetch.preconnect }),
      previewSecret,
      sessionSecret,
      nowMs: 1_783_821_600_000,
    })(new Request(`https://www.goodcms.cn/api/preview?token=${token}`));
    expect(failed.status).toBe(303);
    expect(failed.headers.get("location")).toBe("/preview-error");
    expect(failed.headers.get("location")).not.toContain(token);
    expect(failed.headers.get("set-cookie")).toContain(`${PREVIEW_SESSION_COOKIE_NAME}=`);
    expect(failed.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(await failed.text()).not.toContain(token);
  });

  test("removes the token when the API rejects a wrong or stale internal signature", async () => {
    const token = "sensitive-preview-token-that-must-not-leak";
    const currentSeconds = 1_783_821_600;
    const strictApi: typeof fetch = Object.assign(async (_input: string | URL | Request, init?: RequestInit) => {
      const headers = init?.headers as Headers;
      const timestamp = headers.get("x-gooes-preview-timestamp") ?? "";
      const body = String(init?.body ?? "");
      const bodyHash = createHash("sha256").update(body).digest("hex");
      const expected = createHmac("sha256", previewSecret)
        .update(`${timestamp}\nPOST\n/internal/site-content/preview/consume\n${bodyHash}`)
        .digest("hex");
      const isFresh = Math.abs(currentSeconds - Number(timestamp)) <= 300;
      return headers.get("x-gooes-preview-signature") === expected && isFresh
        ? apiResponse({ entryId, versionId, path: "/articles/safe-article", expiresAt: "2026-07-12T10:10:00.000Z" })
        : apiResponse(null, 401);
    }, { preconnect: fetch.preconnect });

    for (const [secret, nowMs] of [
      ["wrong-preview-secret-that-is-at-least-32-bytes", currentSeconds * 1_000],
      [previewSecret, (currentSeconds - 301) * 1_000],
    ] as const) {
      const response = await createPreviewHandler({
        fetcher: strictApi,
        previewSecret: secret,
        sessionSecret,
        nowMs,
      })(new Request(`https://www.goodcms.cn/api/preview?token=${token}`));
      expect(response.status).toBe(303);
      expect(response.headers.get("location")).toBe("/preview-error");
      expect(response.headers.get("location")).not.toContain(token);
    }
  });

  test("fetches only the session-bound version, entry and public path without cache", async () => {
    const session = createPreviewSession({
      entryId,
      versionId,
      path: "/articles/safe-article",
      secret: sessionSecret,
      nowMs: 1_783_821_600_000,
    });
    let init: RequestInit | undefined;
    const fetcher: typeof fetch = Object.assign(async (_input: string | URL | Request, inputInit?: RequestInit) => {
      init = inputInit;
      return apiResponse(articleDetail({ preview: true, versionId }));
    }, { preconnect: fetch.preconnect });

    expect((await getPreviewSiteContentForPath("/articles/safe-article", {
      sessionValue: session,
      sessionSecret,
      previewSecret,
      fetcher,
      nowMs: 1_783_821_600_001,
    }))?.versionId).toBe(versionId);
    expect(init?.cache).toBe("no-store");
    expect(await getPreviewSiteContentForPath("/articles/other", {
      sessionValue: session,
      sessionSecret,
      previewSecret,
      fetcher,
      nowMs: 1_783_821_600_001,
    })).toBeNull();

    const wrongEntryFetcher: typeof fetch = Object.assign(async () => apiResponse(articleDetail({
      id: "123e4567-e89b-42d3-a456-426614174099",
      preview: true,
      versionId,
    })), { preconnect: fetch.preconnect });
    await expect(getPreviewSiteContentForPath("/articles/safe-article", {
      sessionValue: session,
      sessionSecret,
      previewSecret,
      fetcher: wrongEntryFetcher,
      nowMs: 1_783_821_600_001,
    })).rejects.toThrow("Preview 内容与会话不匹配");
  });

  test("server helper reads the signed cookie and applies fixed noindex metadata", async () => {
    const session = createPreviewSession({
      entryId,
      versionId,
      path: "/articles/safe-article",
      secret: sessionSecret,
      nowMs: 1_783_821_600_000,
    });
    let fetchCalls = 0;
    const fetcher: typeof fetch = Object.assign(async () => {
      fetchCalls += 1;
      return apiResponse(articleDetail({ preview: true, versionId }));
    }, { preconnect: fetch.preconnect });
    const content = await getPreviewSiteContentForServerPath("/articles/safe-article", {
      cookieStore: { get: (name) => name === PREVIEW_SESSION_COOKIE_NAME ? { value: session } : undefined },
      sessionSecret,
      previewSecret,
      fetcher,
      nowMs: 1_783_821_600_001,
    });
    expect(content?.preview).toBe(true);
    expect(fetchCalls).toBe(1);
    expect(withPreviewRobots({ title: "草稿" }, content)).toEqual({
      title: "草稿",
      robots: { index: false, follow: false },
    });

    for (const value of [undefined, "tampered.cookie"]) {
      expect(await getPreviewSiteContentForServerPath("/articles/safe-article", {
        cookieStore: { get: () => value ? { value } : undefined },
        sessionSecret,
        previewSecret,
        fetcher,
        nowMs: 1_783_821_600_001,
      })).toBeNull();
    }
    expect(fetchCalls).toBe(1);
  });
});

describe("preview deployment configuration", () => {
  test("wires server-only preview and revalidation secrets for Web and API", () => {
    const repositoryRoot = new URL("../../../", import.meta.url);
    const files = [
      "deploy/docker-compose.web-dev.yml",
      "deploy/docker-compose.web.yml",
      "deploy/docker-compose.dev.yml",
      "deploy/docker-compose.api.yml",
    ].map((path) => readFileSync(new URL(path, repositoryRoot), "utf8"));
    const all = files.join("\n");
    expect(all).toContain("GOOES_PREVIEW_SHARED_SECRET");
    expect(all).toContain("GOOES_PREVIEW_SESSION_SECRET");
    expect(all).toContain("GOOES_WEB_REVALIDATE_SHARED_SECRET");
    expect(all).toContain("GOOES_WEB_REVALIDATE_URL");
    expect(all).toContain("GOOES_WEB_PUBLIC_URL");
    expect(all).not.toContain("NEXT_PUBLIC_GOOES_PREVIEW");
    expect(all).not.toContain("NEXT_PUBLIC_GOOES_WEB_REVALIDATE");

    const devWorkflow = readFileSync(new URL(".github/workflows/deploy-dev.yml", repositoryRoot), "utf8");
    for (const secret of [
      "GOOES_PREVIEW_SHARED_SECRET",
      "GOOES_PREVIEW_SESSION_SECRET",
      "GOOES_WEB_REVALIDATE_SHARED_SECRET",
    ]) {
      expect(devWorkflow).toContain(`secrets.${secret}`);
      expect(devWorkflow).toContain(`export ${secret}=`);
    }
    const productionWorkflow = readFileSync(
      new URL(".github/workflows/deploy-docker-services.yml", repositoryRoot),
      "utf8",
    );
    for (const secret of [
      "GOOES_PREVIEW_SHARED_SECRET",
      "GOOES_PREVIEW_SESSION_SECRET",
      "GOOES_WEB_REVALIDATE_SHARED_SECRET",
    ]) {
      expect(productionWorkflow).toContain(`secrets.${secret}`);
      expect(productionWorkflow).toContain(`test "\${#${secret}}" -ge 32`);
    }
  });

  test("keeps the preview error destination index-free and query-free", () => {
    const webRoot = new URL("../", import.meta.url);
    const page = readFileSync(new URL("app/(marketing)/preview-error/page.tsx", webRoot), "utf8");
    const config = readFileSync(new URL("next.config.ts", webRoot), "utf8");
    expect(page).toContain("robots: { index: false, follow: false }");
    expect(page).not.toContain("searchParams");
    expect(config).toContain('source: "/preview-error"');
    expect(config).toContain('value: "no-referrer"');
  });
});

describe("revalidation webhook", () => {
  function signedRequest(body: string, signature?: string): Request {
    return new Request("https://www.goodcms.cn/api/revalidate", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(signature ? { "x-gooes-revalidation-signature": signature } : {}),
      },
      body,
    });
  }

  const validPayload = {
    entryId,
    paths: ["/articles/safe-article"],
    tags: [`site-content:${entryId}`, "site-content:article"],
  };

  test("verifies HMAC over the exact raw body with timing-safe comparison", async () => {
    const body = JSON.stringify(validPayload);
    const calls: string[] = [];
    const handler = createRevalidateHandler({
      secret: revalidationSecret,
      revalidatePath: (path) => calls.push(`path:${path}`),
      revalidateTag: (tag) => calls.push(`tag:${tag}`),
    });
    expect((await handler(signedRequest(body))).status).toBe(401);
    expect((await handler(signedRequest(body, "0".repeat(64)))).status).toBe(401);

    const signature = createHmac("sha256", revalidationSecret).update(body).digest("hex");
    const response = await handler(signedRequest(body, signature));
    expect(response.status).toBe(200);
    expect(calls).toEqual([
      `tag:site-content:${entryId}`,
      "tag:site-content:article",
      "path:/articles/safe-article",
    ]);

    const spacedBody = JSON.stringify(validPayload, null, 2);
    expect((await handler(signedRequest(spacedBody, signature))).status).toBe(401);
  });

  test("enforces the 32 KiB streaming byte boundary including multibyte input", async () => {
    const handler = createRevalidateHandler({
      secret: revalidationSecret,
      revalidatePath: () => undefined,
      revalidateTag: () => undefined,
    });
    const exactBytes = " ".repeat(MAX_REVALIDATION_BODY_BYTES - 2);
    const exactBody = `{${exactBytes}}`;
    const exactSignature = createHmac("sha256", revalidationSecret).update(exactBody).digest("hex");
    expect((await handler(signedRequest(exactBody, exactSignature))).status).toBe(400);

    const oversizedBody = `"${"鹅".repeat(Math.ceil(MAX_REVALIDATION_BODY_BYTES / 3))}"`;
    const oversizedSignature = createHmac("sha256", revalidationSecret).update(oversizedBody).digest("hex");
    expect(new TextEncoder().encode(oversizedBody).byteLength).toBeGreaterThan(MAX_REVALIDATION_BODY_BYTES);
    expect((await handler(signedRequest(oversizedBody, oversizedSignature))).status).toBe(413);
  });

  test.each([
    "/articles/../admin",
    "/articles/a%2Fb",
    "/articles/a?draft=1",
    "/articles/a#draft",
    "https://evil.example/articles/a",
    "/articles/a/b",
    "/partners",
  ])("rejects unsafe invalidation path %s", async (path) => {
    const body = JSON.stringify({ ...validPayload, paths: [path] });
    const signature = createHmac("sha256", revalidationSecret).update(body).digest("hex");
    const response = await createRevalidateHandler({
      secret: revalidationSecret,
      revalidatePath: () => { throw new Error("must not run"); },
      revalidateTag: () => { throw new Error("must not run"); },
    })(signedRequest(body, signature));
    expect(response.status).toBe(400);
  });

  test("rejects unknown fields, invalid UUIDs and unbounded tags", async () => {
    for (const payload of [
      { ...validPayload, extra: true },
      { ...validPayload, entryId: "not-a-uuid" },
      { ...validPayload, tags: ["other:tag"] },
      { ...validPayload, tags: Array.from({ length: 21 }, (_, index) => `site-content:${index}`) },
      { ...validPayload, tags: ["site-content:123e4567-e89b-42d3-a456-426614174099", "site-content:article"] },
      { ...validPayload, tags: [`site-content:${entryId}`, "site-content:case"] },
      { ...validPayload, paths: ["/articles/safe-article", "/cases/safe-case"], tags: [`site-content:${entryId}`, "site-content:article", "site-content:case"] },
    ]) {
      const body = JSON.stringify(payload);
      const signature = createHmac("sha256", revalidationSecret).update(body).digest("hex");
      expect((await createRevalidateHandler({
        secret: revalidationSecret,
        revalidatePath: () => undefined,
        revalidateTag: () => undefined,
      })(signedRequest(body, signature))).status).toBe(400);
    }
  });
});
