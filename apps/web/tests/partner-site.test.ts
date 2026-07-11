import { existsSync, readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

import {
  MAX_PUBLIC_BODY_BYTES,
  proxyPublicPost,
  proxyVisitorPublicPost,
} from "../lib/backend";

const webRoot = new URL("../", import.meta.url);
const repositoryRoot = new URL("../../../", import.meta.url);

function readWebFile(path: string): string {
  const file = new URL(path, webRoot);

  return existsSync(file) ? readFileSync(file, "utf8") : "";
}

function readRepositoryFile(path: string): string {
  const file = new URL(path, repositoryRoot);

  return existsSync(file) ? readFileSync(file, "utf8") : "";
}

const partnerPageFiles = [
  "app/(marketing)/partners/page.tsx",
  "components/official-site/partner-hero.tsx",
  "components/official-site/partner-revenue.tsx",
  "components/official-site/partner-process.tsx",
].map(readWebFile).join("\n");

describe("city partner public site", () => {
  test("publishes accurate recruitment metadata and commercial boundaries", () => {
    expect(partnerPageFiles).toContain("export const metadata");
    expect(partnerPageFiles).toContain("城市合伙人招募");
    expect(partnerPageFiles).toContain("合伙人只参与平台收益分成");
    expect(partnerPageFiles).toContain("装修公司自有业务财务独立");
    expect(partnerPageFiles).toContain("线索服务费默认 2.5%");
    expect(partnerPageFiles).toContain("首期按月人工结算");
    expect(partnerPageFiles).toContain("二维码绑定");
    expect(partnerPageFiles).toContain("平台留痕");
    expect(partnerPageFiles).toMatch(/提交申请[\s\S]*审核沟通[\s\S]*开通身份[\s\S]*二维码绑定/);
  });

  test("uses the generated construction hero with an above-fold application action", () => {
    const hero = readWebFile("components/official-site/partner-hero.tsx");

    expect(hero).toContain('src="/partner-hero-construction-team.png"');
    expect(hero).toMatch(/alt="[^"]*(装修|施工)[^"]*"/);
    expect(hero).toContain('href="#apply"');
    expect(hero).toContain("min-h-[calc(100dvh-4rem)]");
    expect(hero).not.toContain("HeroSignal");
    expect(hero).not.toMatch(/(?:sm|md|lg):grid-cols-3/);
  });

  test("provides accessible optional SMS and application submission states", () => {
    const form = [
      "components/official-site/partner-application-form.tsx",
      "components/official-site/partner-application-fields.tsx",
    ].map(readWebFile).join("\n");
    const formUtils = readWebFile(
      "components/official-site/partner-application-form-utils.ts",
    );
    const formContract = `${form}\n${formUtils}`;

    expect(form).toContain("FieldGroup");
    expect(form).toMatch(/<FieldLabel[^>]*htmlFor="phone"[\s\S]*?<Input[\s\S]*?id="phone"/);
    expect(form).toMatch(/id="phone"[\s\S]*?aria-invalid=[\s\S]*?<FieldError/);
    expect(form).toMatch(/id="sms_code"[\s\S]*?aria-invalid=[\s\S]*?<FieldError/);
    expect(form).toMatch(
      /fetch\(\s*"\/api\/public\/partner-applications\/send-code"/,
    );
    expect(form).toMatch(/fetch\(\s*"\/api\/public\/partner-applications"/);
    expect(formContract).toContain('source_channel: "official_website"');
    expect(formContract).toContain("source_url:");
    expect(formContract).toMatch(/sms_code:\s*optionalString/);
    expect(form).toContain("<Spinner");
    expect(form).toContain('data-icon="inline-start"');
    expect(form).toContain("disabled={pending}");
    expect(form).toContain('aria-busy={pending}');
    expect(form).toContain("aria-describedby");
    expect(formContract).toContain("focusFirstInvalidField");
    expect(form).toContain('role="status"');
    expect(form).toContain("cooldownSeconds");
    expect(form).toContain("cooldown_seconds");
    expect(form).toContain('aria-hidden="true"');
    expect(form).toContain("h-11");
    expect(formContract).toContain("normalizePartnerAttribution");
  });

  test("keeps both public proxies bounded, credential-free, and transparent", () => {
    const backend = readWebFile("lib/backend.ts");
    const applicationProxy = readWebFile(
      "app/api/public/partner-applications/route.ts",
    );
    const sendCodeProxy = readWebFile(
      "app/api/public/partner-applications/send-code/route.ts",
    );
    const proxies = `${backend}\n${applicationProxy}\n${sendCodeProxy}`;

    expect(backend).toContain("32 * 1024");
    expect(backend).toContain("getReader()");
    expect(backend).toContain("reader.cancel()");
    expect(backend).toContain('"accept"');
    expect(backend).toContain('"content-type"');
    expect(backend).toContain('"x-device-id"');
    expect(backend).toContain('"x-visitor-device-id"');
    expect(backend).toContain('"x-client-device-id"');
    expect(backend).toContain('cache: "no-store"');
    expect(backend).toContain('redirect: "manual"');
    expect(backend).toContain("AbortController");
    expect(backend).toContain("gooes_visitor_device_id");
    expect(backend).toContain("proxyVisitorPublicPost");
    expect(backend).toContain('code: "BACKEND_UNAVAILABLE"');
    expect(backend).toContain("status: backendResponse.status");
    expect(applicationProxy).toContain('"/public/partner-applications"');
    expect(sendCodeProxy).toContain('"/public/partner-applications/send-code"');
    expect(proxies).not.toMatch(/getAdminToken|authorization|ADMIN_TOKEN/i);
  });

  test("rejects an oversized actual request body before calling the backend", async () => {
    const originalFetch = globalThis.fetch;
    let backendWasCalled = false;
    globalThis.fetch = Object.assign(
      async () => {
        backendWasCalled = true;
        return new Response();
      },
      { preconnect: originalFetch.preconnect },
    );

    try {
      const response = await proxyPublicPost(
        new Request("http://localhost/api/public/partner-applications", {
          method: "POST",
          body: "x".repeat(MAX_PUBLIC_BODY_BYTES + 1),
        }),
        "/public/partner-applications",
      );

      expect(response.status).toBe(413);
      expect(backendWasCalled).toBe(false);
      expect(await response.json()).toMatchObject({
        success: false,
        code: "PAYLOAD_TOO_LARGE",
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("cancels a chunked request as soon as its actual body exceeds 32KB", async () => {
    const originalFetch = globalThis.fetch;
    let backendWasCalled = false;
    let pullCount = 0;
    let wasCancelled = false;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pullCount += 1;
        controller.enqueue(new Uint8Array(12 * 1024));
        if (pullCount === 4) controller.close();
      },
      cancel() {
        wasCancelled = true;
      },
    });
    globalThis.fetch = Object.assign(
      async () => {
        backendWasCalled = true;
        return new Response();
      },
      { preconnect: originalFetch.preconnect },
    );

    try {
      const response = await proxyPublicPost(
        new Request("http://localhost/api/public/partner-applications", {
          method: "POST",
          body,
          duplex: "half",
        } as RequestInit & { duplex: "half" }),
        "/public/partner-applications",
      );

      expect(response.status).toBe(413);
      expect(backendWasCalled).toBe(false);
      expect(wasCancelled).toBe(true);
      expect(pullCount).toBeLessThan(4);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("forwards only allowed headers and preserves the backend response", async () => {
    const originalFetch = globalThis.fetch;
    let forwardedHeaders = new Headers();
    let forwardedUrl = "";
    let forwardedOptions: RequestInit | undefined;
    globalThis.fetch = Object.assign(
      async (input: URL | RequestInfo, options?: RequestInit) => {
        forwardedUrl = String(input);
        forwardedHeaders = new Headers(options?.headers);
        forwardedOptions = options;
        return new Response('{"success":false,"code":"INVALID_PHONE"}', {
          status: 422,
          headers: { "content-type": "application/problem+json" },
        });
      },
      { preconnect: originalFetch.preconnect },
    );

    try {
      const response = await proxyPublicPost(
        new Request("http://localhost/api/public/partner-applications", {
          method: "POST",
          headers: {
            accept: "application/json",
            authorization: "Bearer should-not-forward",
            cookie: "session=should-not-forward",
            "content-type": "application/json",
            "x-client-device-id": "client-device",
            "x-client-id": "should-not-forward",
            "x-device-id": "device",
            "x-visitor-device-id": "visitor-device",
          },
          body: '{"phone":"13800138000"}',
        }),
        "/public/partner-applications",
      );

      expect(forwardedUrl).toBe("http://localhost:3000/public/partner-applications");
      expect([...forwardedHeaders.keys()].sort()).toEqual([
        "accept",
        "content-type",
        "x-client-device-id",
        "x-device-id",
        "x-visitor-device-id",
      ]);
      expect(forwardedOptions?.cache).toBe("no-store");
      expect(forwardedOptions?.redirect).toBe("manual");
      expect(response.status).toBe(422);
      expect(response.headers.get("content-type")).toBe(
        "application/problem+json",
      );
      expect(await response.text()).toBe(
        '{"success":false,"code":"INVALID_PHONE"}',
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("normalizes backend network failures to a stable 502 response", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = Object.assign(
      async () => {
        throw new TypeError("network unavailable");
      },
      { preconnect: originalFetch.preconnect },
    );

    try {
      const response = await proxyPublicPost(
        new Request("http://localhost/api/public/partner-applications", {
          method: "POST",
          body: "{}",
        }),
        "/public/partner-applications",
      );

      expect(response.status).toBe(502);
      expect(await response.json()).toEqual({
        success: false,
        message: "后端服务未连接，请稍后再试",
        code: "BACKEND_UNAVAILABLE",
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("normalizes an upstream timeout to the stable 502 response", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = Object.assign(
      async (_input: URL | RequestInfo, options?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          options?.signal?.addEventListener("abort", () => {
            reject(options.signal?.reason);
          });
        }),
      { preconnect: originalFetch.preconnect },
    );

    try {
      const response = await proxyPublicPost(
        new Request("http://localhost/api/public/partner-applications", {
          method: "POST",
          body: "{}",
        }),
        "/public/partner-applications",
        { upstreamTimeoutMs: 5 },
      );

      expect(response.status).toBe(502);
      expect(await response.json()).toMatchObject({
        code: "BACKEND_UNAVAILABLE",
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("times out when the upstream response body stops streaming", async () => {
    const originalFetch = globalThis.fetch;
    let wasCancelled = false;
    const responseBody = new ReadableStream<Uint8Array>({
      pull() {
        return new Promise(() => undefined);
      },
      cancel() {
        wasCancelled = true;
      },
    });
    globalThis.fetch = Object.assign(
      async () => new Response(responseBody, { status: 200 }),
      { preconnect: originalFetch.preconnect },
    );

    try {
      const proxyResult = proxyPublicPost(
        new Request("http://localhost/api/public/partner-applications", {
          method: "POST",
          body: "{}",
        }),
        "/public/partner-applications",
        { upstreamTimeoutMs: 5 },
      );
      const response = await Promise.race([
        proxyResult,
        new Promise<"did-not-time-out">((resolve) => {
          setTimeout(() => resolve("did-not-time-out"), 100);
        }),
      ]);

      expect(response).not.toBe("did-not-time-out");
      if (response === "did-not-time-out") return;
      expect(response.status).toBe(502);
      expect(wasCancelled).toBe(true);
      expect(await response.json()).toMatchObject({
        code: "BACKEND_UNAVAILABLE",
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("preserves a large upstream response without rewriting its status", async () => {
    const originalFetch = globalThis.fetch;
    let wasCancelled = false;
    const responseBody = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(180 * 1024));
        controller.enqueue(new Uint8Array(180 * 1024));
        controller.close();
      },
      cancel() {
        wasCancelled = true;
      },
    });
    globalThis.fetch = Object.assign(
      async () => new Response(responseBody, { status: 200 }),
      { preconnect: originalFetch.preconnect },
    );

    try {
      const response = await proxyPublicPost(
        new Request("http://localhost/api/public/partner-applications", {
          method: "POST",
          body: "{}",
        }),
        "/public/partner-applications",
      );

      expect(response.status).toBe(200);
      expect(wasCancelled).toBe(false);
      expect((await response.arrayBuffer()).byteLength).toBe(360 * 1024);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("normalizes an upstream body read failure after fetch resolves", async () => {
    const originalFetch = globalThis.fetch;
    const responseBody = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.error(new TypeError("body read failed"));
      },
    });
    globalThis.fetch = Object.assign(
      async () => new Response(responseBody, { status: 200 }),
      { preconnect: originalFetch.preconnect },
    );

    try {
      const response = await proxyPublicPost(
        new Request("http://localhost/api/public/partner-applications", {
          method: "POST",
          body: "{}",
        }),
        "/public/partner-applications",
      );

      expect(response.status).toBe(502);
      expect(await response.json()).toMatchObject({
        code: "BACKEND_UNAVAILABLE",
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("uses a server-maintained visitor device without forwarding cookies", async () => {
    const originalFetch = globalThis.fetch;
    const forwardedDevices: string[] = [];
    const forwardedHeaderSets: string[][] = [];
    globalThis.fetch = Object.assign(
      async (_input: URL | RequestInfo, options?: RequestInit) => {
        const headers = new Headers(options?.headers);
        forwardedDevices.push(headers.get("x-visitor-device-id") || "");
        forwardedHeaderSets.push([...headers.keys()].sort());
        return Response.json({ data: { cooldown_seconds: 60 } });
      },
      { preconnect: originalFetch.preconnect },
    );

    try {
      const firstResponse = await proxyVisitorPublicPost(
        new Request("https://www.goodcms.cn/api/public/partner-applications/send-code", {
          method: "POST",
          headers: {
            authorization: "Bearer should-not-forward",
            cookie: "gooes_visitor_device_id=forged; unrelated=private",
            "content-type": "application/json",
            "x-client-device-id": "browser-controlled",
            "x-device-id": "browser-controlled",
            "x-forwarded-for": "203.0.113.10",
          },
          body: '{"phone":"13800138000"}',
        }),
        "/public/partner-applications/send-code",
      );
      const setCookie = firstResponse.headers.get("set-cookie") || "";
      const visitorCookie = setCookie.split(";")[0];
      expect(visitorCookie).toMatch(/^gooes_visitor_device_id=/);
      expect(setCookie).toContain("HttpOnly");
      expect(setCookie).toContain("SameSite=Lax");
      expect(setCookie).toContain("Max-Age=31536000");
      expect(setCookie).toContain("Secure");

      const secondResponse = await proxyVisitorPublicPost(
        new Request("https://www.goodcms.cn/api/public/partner-applications/send-code", {
          method: "POST",
          headers: {
            cookie: `${visitorCookie}; unrelated=private`,
            "content-type": "application/json",
            "x-client-device-id": "browser-controlled",
            "x-visitor-device-id": "browser-controlled",
            "x-forwarded-for": "203.0.113.11",
          },
          body: '{"phone":"13900139000"}',
        }),
        "/public/partner-applications/send-code",
      );

      expect(forwardedDevices[0]).toMatch(/^web_[0-9a-f-]{36}$/);
      expect(forwardedDevices[1]).toBe(forwardedDevices[0]);
      expect(forwardedHeaderSets).toEqual([
        ["content-type", "x-visitor-device-id"],
        ["content-type", "x-visitor-device-id"],
      ]);
      expect(secondResponse.headers.get("set-cookie")).toBeNull();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("adds only the live partner route to desktop and mobile navigation", () => {
    const desktopNavigation = readWebFile(
      "components/official-site/site-header.tsx",
    );
    const mobileNavigation = readWebFile(
      "components/official-site/mobile-navigation.tsx",
    );

    expect(desktopNavigation).toContain('href="/partners"');
    expect(desktopNavigation).toContain("城市合伙人");
    expect(mobileNavigation).toContain('href="/partners"');
    expect(mobileNavigation).toContain("城市合伙人");
    expect(`${desktopNavigation}\n${mobileNavigation}`).not.toMatch(
      /href="\/(?:products|solutions|cases|articles|about)"/,
    );
  });

  test("documents verified asset dimensions, cropping, and unresolved rights", () => {
    const assetsDocument = readRepositoryFile(
      "docs/assets/official-site-assets.md",
    );

    expect(existsSync(new URL("public/logo.png", webRoot))).toBe(true);
    expect(
      existsSync(new URL("public/partner-hero-construction-team.png", webRoot)),
    ).toBe(true);
    expect(assetsDocument).toContain("logo.png");
    expect(assetsDocument).toContain("1254 x 1254");
    expect(assetsDocument).toContain("partner-hero-construction-team.png");
    expect(assetsDocument).toContain("OpenAI built-in image generation");
    expect(assetsDocument).toContain("2026-07-11");
    expect(assetsDocument).toContain("项目生成资产");
    expect(assetsDocument).toContain("现有仓库资产");
    expect(assetsDocument).toContain("授权/来源上线前确认");
    expect(assetsDocument).toContain("移动端");
    expect(assetsDocument).toContain("裁切");
  });
});
