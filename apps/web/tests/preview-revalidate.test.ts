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
  buildRevalidationCanonical,
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
      author: "好店智装云",
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
    let detailInit: RequestInit | undefined;
    const taggedFetcher: typeof fetch = Object.assign(async (_input: string | URL | Request, init?: RequestInit) => {
      detailInit = init;
      return apiResponse(articleDetail());
    }, { preconnect: fetch.preconnect });
    await getPublicSiteContentDetail("article", "safe-article", { fetcher: taggedFetcher });
    expect(detailInit?.next).toEqual({
      revalidate: 300,
      tags: ["site-content-path:article:safe-article"],
    });

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
        expect(init?.signal).toBeInstanceOf(AbortSignal);
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
    expect(init?.signal).toBeInstanceOf(AbortSignal);
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

  test("preview activation times out safely without retaining an old session", async () => {
    const response = await createPreviewHandler({
      fetcher: Object.assign(async (_input: string | URL | Request, init?: RequestInit) => {
        expect(init?.signal).toBeInstanceOf(AbortSignal);
        throw init?.signal?.reason ?? new DOMException("timeout", "TimeoutError");
      }, { preconnect: fetch.preconnect }),
      previewSecret,
      sessionSecret,
      nowMs: 1_783_821_600_000,
    })(new Request(`https://www.goodcms.cn/api/preview?token=${"x".repeat(43)}`));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/preview-error");
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
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

    const unavailable = getPreviewSiteContentForServerPath("/articles/safe-article", {
      cookieStore: { get: () => ({ value: session }) },
      sessionSecret,
      previewSecret,
      fetcher: Object.assign(async () => { throw new DOMException("timeout", "TimeoutError"); }, { preconnect: fetch.preconnect }),
      nowMs: 1_783_821_600_001,
    });
    await expect(unavailable).rejects.toMatchObject({
      name: "SiteContentApiError",
      code: "SITE_CONTENT_PREVIEW_UNAVAILABLE",
    });
  });
});

describe("preview deployment configuration", () => {
  test("requires real secrets only for selected API or Web services", () => {
    const repositoryRoot = new URL("../../../", import.meta.url).pathname;
    const script = `${repositoryRoot}scripts/prepare-site-content-deployment-secrets.sh`;
    const run = (services: string, env: Record<string, string> = {}) => Bun.spawnSync({
      cmd: ["bash", "-c", `set -e; source "${script}" "${services}"; printf '%s|%s|%s' "$GOOES_PREVIEW_SHARED_SECRET" "$GOOES_PREVIEW_SESSION_SECRET" "$GOOES_WEB_REVALIDATE_SHARED_SECRET"`],
      env: { PATH: process.env.PATH ?? "", ...env },
    });
    const admin = run("admin");
    expect(admin.exitCode).toBe(0);
    expect(admin.stdout.toString()).toContain("unused-not-deployed-");
    expect(run("api").exitCode).toBe(1);
    const api = run("api", {
      GOOES_PREVIEW_SHARED_SECRET: previewSecret,
      GOOES_WEB_REVALIDATE_SHARED_SECRET: revalidationSecret,
    });
    expect(api.exitCode).toBe(0);
    expect(api.stdout.toString()).toContain("unused-not-deployed-session-");
    expect(run("web", {
      GOOES_PREVIEW_SHARED_SECRET: previewSecret,
      GOOES_WEB_REVALIDATE_SHARED_SECRET: revalidationSecret,
    }).exitCode).toBe(1);
    expect(run("web", {
      GOOES_PREVIEW_SHARED_SECRET: previewSecret,
      GOOES_PREVIEW_SESSION_SECRET: sessionSecret,
      GOOES_WEB_REVALIDATE_SHARED_SECRET: revalidationSecret,
    }).exitCode).toBe(0);
  });

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
    }
    expect(devWorkflow).toContain("prepare-site-content-deployment-secrets.sh");
    expect(devWorkflow).toContain('source scripts/prepare-site-content-deployment-secrets.sh');
    expect(devWorkflow).not.toContain("DEV_DEPLOY_KEY_PATH");
    const productionWorkflow = readFileSync(
      new URL(".github/workflows/deploy-docker-services.yml", repositoryRoot),
      "utf8",
    );
    expect(productionWorkflow).toContain("prepare-site-content-deployment-secrets.sh");
    for (const secret of [
      "GOOES_PREVIEW_SHARED_SECRET",
      "GOOES_PREVIEW_SESSION_SECRET",
      "GOOES_WEB_REVALIDATE_SHARED_SECRET",
    ]) {
      expect(productionWorkflow).toContain(`secrets.${secret}`);
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
  const nowSeconds = 1_783_821_600;
  function signedRequest(body: string, options: {
    signature?: string;
    timestamp?: string;
    path?: string;
  } = {}): Request {
    return new Request(`https://www.goodcms.cn${options.path ?? "/api/revalidate"}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(options.signature ? { "x-gooes-revalidation-signature": options.signature } : {}),
        ...(options.timestamp ? { "x-gooes-revalidation-timestamp": options.timestamp } : {}),
      },
      body,
    });
  }

  const validPayload = {
    entryId,
    paths: ["/articles/safe-article"],
    tags: ["site-content:article", "site-content-path:article:safe-article"],
  };

  function signature(body: string, timestamp = String(nowSeconds), path = "/api/revalidate") {
    return createHmac("sha256", revalidationSecret)
      .update(buildRevalidationCanonical({ timestamp, method: "POST", path, body }))
      .digest("hex");
  }

  test("verifies HMAC over the exact raw body with timing-safe comparison", async () => {
    const body = JSON.stringify(validPayload);
    const calls: string[] = [];
    const handler = createRevalidateHandler({
      secret: revalidationSecret,
      nowMs: nowSeconds * 1_000,
      revalidatePath: (path) => calls.push(`path:${path}`),
      revalidateTag: (tag) => calls.push(`tag:${tag}`),
    });
    expect((await handler(signedRequest(body))).status).toBe(401);
    expect((await handler(signedRequest(body, { signature: "0".repeat(64), timestamp: String(nowSeconds) }))).status).toBe(401);

    const signed = signature(body);
    const response = await handler(signedRequest(body, { signature: signed, timestamp: String(nowSeconds) }));
    expect(response.status).toBe(200);
    expect(calls).toEqual([
      "tag:site-content:article",
      "tag:site-content-path:article:safe-article",
      "path:/articles/safe-article",
    ]);

    const spacedBody = JSON.stringify(validPayload, null, 2);
    expect((await handler(signedRequest(spacedBody, { signature: signed, timestamp: String(nowSeconds) }))).status).toBe(401);
  });

  test("rejects stale, future, wrong-path and wrong-body signatures", async () => {
    const body = JSON.stringify(validPayload);
    const handler = createRevalidateHandler({
      secret: revalidationSecret,
      nowMs: nowSeconds * 1_000,
      revalidatePath: () => undefined,
      revalidateTag: () => undefined,
    });
    for (const timestamp of [String(nowSeconds - 301), String(nowSeconds + 301)]) {
      expect((await handler(signedRequest(body, {
        timestamp,
        signature: signature(body, timestamp),
      }))).status).toBe(401);
    }
    expect((await handler(signedRequest(body, {
      timestamp: String(nowSeconds),
      path: "/api/revalidate/other",
      signature: signature(body),
    }))).status).toBe(401);
    expect((await handler(signedRequest(`${body} `, {
      timestamp: String(nowSeconds),
      signature: signature(body),
    }))).status).toBe(401);
  });

  test("binds every same-type path to its own cache tag", async () => {
    const payload = {
      entryId,
      paths: ["/articles/safe-article", "/articles/second-article"],
      tags: [
        "site-content:article",
        "site-content-path:article:safe-article",
        "site-content-path:article:second-article",
      ],
    };
    const calls: string[] = [];
    const handler = createRevalidateHandler({
      secret: revalidationSecret,
      nowMs: nowSeconds * 1_000,
      revalidatePath: (path) => calls.push(`path:${path}`),
      revalidateTag: (tag) => calls.push(`tag:${tag}`),
    });
    const body = JSON.stringify(payload);
    expect((await handler(signedRequest(body, {
      signature: signature(body),
      timestamp: String(nowSeconds),
    }))).status).toBe(200);
    expect(calls).toContain("tag:site-content-path:article:second-article");
    const missingTagBody = JSON.stringify({ ...payload, tags: payload.tags.slice(0, 2) });
    expect((await handler(signedRequest(missingTagBody, {
      signature: signature(missingTagBody),
      timestamp: String(nowSeconds),
    }))).status).toBe(400);
  });

  test("enforces the 32 KiB streaming byte boundary including multibyte input", async () => {
    const handler = createRevalidateHandler({
      secret: revalidationSecret,
      nowMs: nowSeconds * 1_000,
      revalidatePath: () => undefined,
      revalidateTag: () => undefined,
    });
    const exactBytes = " ".repeat(MAX_REVALIDATION_BODY_BYTES - 2);
    const exactBody = `{${exactBytes}}`;
    const exactSignature = signature(exactBody);
    expect((await handler(signedRequest(exactBody, { signature: exactSignature, timestamp: String(nowSeconds) }))).status).toBe(400);

    const oversizedBody = `"${"鹅".repeat(Math.ceil(MAX_REVALIDATION_BODY_BYTES / 3))}"`;
    const oversizedSignature = signature(oversizedBody);
    expect(new TextEncoder().encode(oversizedBody).byteLength).toBeGreaterThan(MAX_REVALIDATION_BODY_BYTES);
    expect((await handler(signedRequest(oversizedBody, { signature: oversizedSignature, timestamp: String(nowSeconds) }))).status).toBe(413);
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
    const signed = signature(body);
    const response = await createRevalidateHandler({
      secret: revalidationSecret,
      nowMs: nowSeconds * 1_000,
      revalidatePath: () => { throw new Error("must not run"); },
      revalidateTag: () => { throw new Error("must not run"); },
    })(signedRequest(body, { signature: signed, timestamp: String(nowSeconds) }));
    expect(response.status).toBe(400);
  });

  test("rejects unknown fields, invalid UUIDs and unbounded tags", async () => {
    for (const payload of [
      { ...validPayload, extra: true },
      { ...validPayload, entryId: "not-a-uuid" },
      { ...validPayload, tags: ["other:tag"] },
      { ...validPayload, tags: Array.from({ length: 21 }, (_, index) => `site-content:${index}`) },
      { ...validPayload, tags: ["site-content:article", "site-content-path:article:other"] },
      { ...validPayload, tags: ["site-content:case", "site-content-path:case:safe-article"] },
      { ...validPayload, paths: ["/articles/safe-article", "/cases/safe-case"], tags: ["site-content:article", "site-content-path:article:safe-article"] },
    ]) {
      const body = JSON.stringify(payload);
      const signed = signature(body);
      expect((await createRevalidateHandler({
        secret: revalidationSecret,
        nowMs: nowSeconds * 1_000,
        revalidatePath: () => undefined,
        revalidateTag: () => undefined,
      })(signedRequest(body, { signature: signed, timestamp: String(nowSeconds) }))).status).toBe(400);
    }
  });
});
