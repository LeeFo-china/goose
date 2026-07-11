import { createHmac } from "node:crypto";
import { describe, expect, test } from "bun:test";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

describe("SiteContentController routes", () => {
  test("registers the fixed public, platform and internal route contract", async () => {
    const { default: controller } = await import(".");
    const routes: Array<{ method: string; path: string }> = [];
    const fastify = {
      get: (path: string) => routes.push({ method: "GET", path }),
      post: (path: string) => routes.push({ method: "POST", path }),
      patch: (path: string) => routes.push({ method: "PATCH", path }),
    };

    controller.registerExtraRoutes(fastify as never);

    expect(routes).toEqual([
      { method: "GET", path: "/public/site/articles" },
      { method: "GET", path: "/public/site/articles/:slug" },
      { method: "GET", path: "/public/site/cases" },
      { method: "GET", path: "/public/site/cases/:slug" },
      { method: "GET", path: "/public/site/cities/:slug" },
      { method: "GET", path: "/platform/site-content" },
      { method: "POST", path: "/platform/site-content" },
      { method: "GET", path: "/platform/site-content/:id" },
      { method: "PATCH", path: "/platform/site-content/:id" },
      { method: "GET", path: "/platform/site-content/:id/versions" },
      { method: "POST", path: "/platform/site-content/:id/versions" },
      { method: "POST", path: "/platform/site-content/:id/publish" },
      { method: "POST", path: "/platform/site-content/:id/rollback" },
      { method: "POST", path: "/platform/site-content/:id/archive" },
      { method: "POST", path: "/platform/site-content/:id/preview-token" },
      { method: "POST", path: "/internal/site-content/preview/consume" },
      { method: "GET", path: "/internal/site-content/versions/:id/preview" },
    ]);
  });

  test("rejects an invalid preview signature independently of admin auth", async () => {
    const { default: controller } = await import(".");
    const previous = process.env.GOOES_PREVIEW_SHARED_SECRET;
    process.env.GOOES_PREVIEW_SHARED_SECRET = "preview-secret-that-is-at-least-32-bytes";
    try {
      await expect(controller.consumePreviewToken({
        headers: { "x-gooes-preview-signature": "bad" },
        body: { token: "plain-preview-token" },
      } as never, {} as never)).rejects.toMatchObject({ code: "INVALID_PREVIEW_SIGNATURE" });

      const body = { token: "plain-preview-token" };
      const signature = createHmac("sha256", process.env.GOOES_PREVIEW_SHARED_SECRET)
        .update(JSON.stringify(body))
        .digest("hex");
      expect(signature).toHaveLength(64);
    } finally {
      if (previous === undefined) delete process.env.GOOES_PREVIEW_SHARED_SECRET;
      else process.env.GOOES_PREVIEW_SHARED_SECRET = previous;
    }
  });
});
