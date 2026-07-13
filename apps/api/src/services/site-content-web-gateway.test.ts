import { createHash, createHmac } from "node:crypto";
import { describe, expect, mock, test } from "bun:test";

import {
  buildSiteContentRevalidationCanonical,
  WebSiteContentRevalidator,
} from "./site-content-web-gateway";

const secret = "revalidation-secret-that-is-at-least-32-bytes";
const timestamp = "1783821600";
const body = JSON.stringify({
  entryId: "123e4567-e89b-42d3-a456-426614174000",
  paths: ["/articles/safe-article"],
  tags: ["site-content:article", "site-content-path:article:safe-article"],
});

describe("site content Web revalidation gateway", () => {
  test("uses timestamp, uppercase method, exact endpoint path and raw body hash", async () => {
    const fetcher = mock(async (_input: string | URL | Request, init?: RequestInit) => {
      const headers = init?.headers as Record<string, string>;
      const bodyHash = createHash("sha256").update(body).digest("hex");
      const expected = createHmac("sha256", secret)
        .update(`${timestamp}\nPOST\n/api/revalidate\n${bodyHash}`)
        .digest("hex");
      expect(headers["x-gooes-revalidation-timestamp"]).toBe(timestamp);
      expect(headers["x-gooes-revalidation-signature"]).toBe(expected);
      expect(init?.body).toBe(body);
      return new Response(null, { status: 200 });
    });
    const revalidator = new WebSiteContentRevalidator({
      endpoint: "https://www.goodcms.cn/api/revalidate",
      secret,
      nowMs: 1_783_821_600_000,
      fetcher,
    });

    await revalidator.revalidate(JSON.parse(body));
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  test("shares a deterministic canonical vector and rejects ambiguous endpoints", async () => {
    expect(buildSiteContentRevalidationCanonical({
      timestamp,
      method: "post",
      path: "/api/revalidate",
      body,
    })).toBe(`${timestamp}\nPOST\n/api/revalidate\n${createHash("sha256").update(body).digest("hex")}`);

    const fetcher = mock(async () => new Response(null, { status: 200 }));
    for (const endpoint of [
      "https://www.goodcms.cn/api/revalidate?mode=all",
      "https://www.goodcms.cn/api/revalidate/other",
      "https://user:pass@www.goodcms.cn/api/revalidate",
    ]) {
      await expect(new WebSiteContentRevalidator({ endpoint, secret, fetcher }).revalidate(JSON.parse(body)))
        .rejects.toMatchObject({ code: "SITE_CONTENT_REVALIDATION_UNAVAILABLE" });
    }
    expect(fetcher).not.toHaveBeenCalled();
  });
});
