import { createHmac } from "node:crypto";
import { describe, expect, test } from "bun:test";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

describe("PlatformPartnerApplicationsController routes", () => {
  test("registers public application and platform review routes", async () => {
    const { default: controller } = await import(".");
    const routes: Array<{ method: string; path: string }> = [];
    const fastify = {
      get: (path: string) => routes.push({ method: "GET", path }),
      post: (path: string) => routes.push({ method: "POST", path }),
      patch: (path: string) => routes.push({ method: "PATCH", path }),
    };

    controller.registerExtraRoutes(fastify as never);

    expect(routes).toEqual([
      { method: "POST", path: "/public/partner-applications/send-code" },
      { method: "POST", path: "/public/partner-applications" },
      { method: "POST", path: "/public/partner-applications/proxy-ip-check" },
      { method: "GET", path: "/platform/partner-applications" },
      { method: "GET", path: "/platform/partner-applications/:id" },
      { method: "PATCH", path: "/platform/partner-applications/:id/status" },
      { method: "POST", path: "/platform/partner-applications/:id/approve" },
    ]);
  });

  test("requires a complete valid internal signature for the proxy IP diagnostic", async () => {
    const { default: controller } = await import(".");
    await expect(
      controller.checkPublicProxyIp({ headers: {}, ip: "203.0.113.50" } as never, {} as never),
    ).rejects.toThrow("内部客户端 IP 签名无效");

    const secret = "proxy-secret-that-is-at-least-32-bytes";
    const timestamp = String(Math.floor(Date.now() / 1000));
    const ip = "192.0.2.230";
    const signature = createHmac("sha256", secret).update(`${timestamp}.${ip}`).digest("hex");
    const previousSecret = process.env.GOOES_WEB_PROXY_SHARED_SECRET;
    process.env.GOOES_WEB_PROXY_SHARED_SECRET = secret;
    try {
      await expect(
        controller.checkPublicProxyIp(
          {
            headers: {
              "x-gooes-client-ip": ip,
              "x-gooes-client-ip-timestamp": timestamp,
              "x-gooes-client-ip-signature": signature,
            },
            ip: "203.0.113.50",
          } as never,
          {} as never,
        ),
      ).resolves.toEqual({ data: { client_ip: ip }, message: "success" });
    } finally {
      if (previousSecret === undefined) delete process.env.GOOES_WEB_PROXY_SHARED_SECRET;
      else process.env.GOOES_WEB_PROXY_SHARED_SECRET = previousSecret;
    }
  });
});
