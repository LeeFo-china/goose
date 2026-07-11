import { describe, expect, test } from "bun:test";

import {
  buildSiteContentPreviewCanonical,
  signSiteContentPreviewRequest,
  verifySiteContentPreviewRequest,
} from "./site-content-preview-signature";

const secret = "preview-secret-that-is-at-least-32-bytes";
const timestamp = "1783821600";
const nowSeconds = 1783821600;
const path = "/internal/site-content/preview/consume";
const body = JSON.stringify({ token: "preview-token" });

describe("site content preview request signature", () => {
  test("uses timestamp, uppercase method, exact path and body SHA256", () => {
    const canonical = buildSiteContentPreviewCanonical({ timestamp, method: "post", path, body });
    expect(canonical).toContain(`${timestamp}\nPOST\n${path}\n`);
    expect(canonical.split("\n").at(-1)).toMatch(/^[0-9a-f]{64}$/);
  });

  test("accepts only fresh exact requests", () => {
    const signature = signSiteContentPreviewRequest({ secret, timestamp, method: "POST", path, body });
    expect(verifySiteContentPreviewRequest({ secret, signature, timestamp, method: "POST", path, body, nowSeconds })).toBe(true);
    expect(verifySiteContentPreviewRequest({ secret, signature, timestamp: String(nowSeconds - 301), method: "POST", path, body, nowSeconds })).toBe(false);
    expect(verifySiteContentPreviewRequest({ secret, signature, timestamp, method: "GET", path, body, nowSeconds })).toBe(false);
    expect(verifySiteContentPreviewRequest({ secret, signature, timestamp, method: "POST", path: `${path}/extra`, body, nowSeconds })).toBe(false);
    expect(verifySiteContentPreviewRequest({ secret, signature, timestamp, method: "POST", path, body: JSON.stringify({ token: "other" }), nowSeconds })).toBe(false);
  });
});
