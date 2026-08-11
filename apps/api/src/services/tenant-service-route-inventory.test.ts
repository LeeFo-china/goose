import { describe, expect, test } from "bun:test";
import Fastify from "fastify";

import { TENANT_SERVICE_ROUTE_ACCESS_VALUES } from "@gooes/domain";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

type RegisteredRoute = {
  method: string;
  url: string;
  tenantServiceAccess: unknown;
};

const UNGUARDED_ROUTE_ALLOWLIST = [
  { method: "GET", url: "/", reason: "health root" },
  { method: "HEAD", url: "/", reason: "health root" },
  {
    method: "POST",
    url: "/pay/wechat/callback",
    reason: "verified WeChat payment callback",
  },
  {
    method: "POST",
    url: "/douyin-thirdparty/events/authorization",
    reason: "verified Douyin callback",
  },
  {
    method: "POST",
    url: "/douyin-thirdparty/events/message",
    reason: "verified Douyin callback",
  },
  {
    method: "POST",
    url: "/douyin-thirdparty/events/message/:authorizerAppId/callback",
    reason: "verified Douyin callback",
  },
  {
    method: "POST",
    url: "/douyin-mini/auth/session",
    reason: "public mini-program session",
  },
  {
    method: "GET",
    url: "/douyin-mini/bootstrap",
    reason: "public mini-program content",
  },
  {
    method: "HEAD",
    url: "/douyin-mini/bootstrap",
    reason: "public mini-program content",
  },
  {
    method: "GET",
    url: "/douyin-mini/company",
    reason: "public mini-program content",
  },
  {
    method: "HEAD",
    url: "/douyin-mini/company",
    reason: "public mini-program content",
  },
  {
    method: "GET",
    url: "/douyin-mini/cases",
    reason: "public mini-program content",
  },
  {
    method: "HEAD",
    url: "/douyin-mini/cases",
    reason: "public mini-program content",
  },
  {
    method: "GET",
    url: "/douyin-mini/cases/:id",
    reason: "public mini-program content",
  },
  {
    method: "HEAD",
    url: "/douyin-mini/cases/:id",
    reason: "public mini-program content",
  },
  {
    method: "GET",
    url: "/douyin-mini/sites",
    reason: "public mini-program content",
  },
  {
    method: "HEAD",
    url: "/douyin-mini/sites",
    reason: "public mini-program content",
  },
  {
    method: "GET",
    url: "/douyin-mini/sites/:id",
    reason: "public mini-program content",
  },
  {
    method: "HEAD",
    url: "/douyin-mini/sites/:id",
    reason: "public mini-program content",
  },
  {
    method: "GET",
    url: "/douyin-mini/sites/:id/logs",
    reason: "public mini-program content",
  },
  {
    method: "HEAD",
    url: "/douyin-mini/sites/:id/logs",
    reason: "public mini-program content",
  },
  {
    method: "POST",
    url: "/douyin-mini/sms/send",
    reason: "public mini-program lead flow",
  },
  {
    method: "POST",
    url: "/douyin-mini/leads",
    reason: "public mini-program lead flow",
  },
  {
    method: "POST",
    url: "/douyin-mini/events",
    reason: "public mini-program analytics",
  },
  {
    method: "GET",
    url: "/wechat/virtual-payment/events",
    reason: "verified WeChat callback",
  },
  {
    method: "HEAD",
    url: "/wechat/virtual-payment/events",
    reason: "verified WeChat callback",
  },
  {
    method: "POST",
    url: "/wechat/virtual-payment/events",
    reason: "verified WeChat callback",
  },
] as const;

describe("tenant service route inventory", () => {
  test("registers every guarded route with explicit access metadata", async () => {
    const { default: routes } = await import("@/routes");
    const app = Fastify();
    const registered: RegisteredRoute[] = [];
    app.addHook("onRoute", (route) => {
      const methods = Array.isArray(route.method)
        ? route.method
        : [route.method];
      for (const method of methods) {
        registered.push({
          method,
          url: route.url,
          tenantServiceAccess: route.config?.tenantServiceAccess,
        });
      }
    });

    try {
      await app.register(routes);
      await app.ready();

      const uniqueRoutes = [...new Map(registered.map((route) => [
        `${route.method} ${route.url}`,
        route,
      ])).values()];
      const missing = uniqueRoutes
        .filter((route) => route.tenantServiceAccess === undefined)
        .map(({ method, url }) => ({ method, url }));

      const allowedAccesses = new Set<string>(
        TENANT_SERVICE_ROUTE_ACCESS_VALUES,
      );
      for (const route of uniqueRoutes) {
        if (route.tenantServiceAccess !== undefined) {
          expect(allowedAccesses.has(String(route.tenantServiceAccess)))
            .toBe(true);
        }
      }

      const accessByRoute = new Map(uniqueRoutes.map((route) => [
        `${route.method} ${route.url}`,
        route.tenantServiceAccess,
      ]));
      const mappedRoutes = [
        ["GET /billing/account", "recovery"],
        ["GET /billing/summary", "recovery"],
        ["GET /billing/ledger", "recovery"],
        ["GET /billing/feature-estimates", "recovery"],
        ["GET /billing/subscription", "recovery"],
        ["GET /billing/subscription-invoices", "recovery"],
        ["GET /billing/subscription-invoices/:id", "recovery"],
        ["GET /billing/recharge-products", "recovery"],
        ["GET /billing/recharge-orders", "recovery"],
        ["POST /billing/recharge-orders", "recovery"],
        ["GET /billing/recharge-orders/:id", "recovery"],
        ["POST /billing/recharge-orders/:id/payment-request", "recovery"],
        ["POST /billing/recharge-orders/:id/refund-requests", "write"],
        ["GET /billing/service-products", "recovery"],
        ["GET /billing/service-orders", "recovery"],
        ["POST /billing/service-orders", "recovery"],
        ["GET /billing/service-orders/:id", "recovery"],
        ["POST /billing/service-orders/:id/payment-request", "recovery"],
        ["POST /billing/service-orders/:id/cancel", "recovery"],
        ["POST /billing/service-orders/:id/refund-requests", "write"],
        ["GET /billing/service-orders/:id/acceptance", "read"],
        ["POST /billing/service-orders/:id/acceptance/confirm", "write"],
        ["POST /billing/service-orders/:id/acceptance/reject", "write"],
        [
          "GET /billing/service-orders/:id/fulfillment-attachments/:attachmentId/preview-url",
          "read",
        ],
        ["GET /auth/me/permissions", "session"],
        ["GET /employee/bootstrap", "read"],
        ["GET /employee/personalization", "read"],
        ["POST /departments/enable-batch", "write"],
      ] as const;
      for (const [route, access] of mappedRoutes) {
        expect(accessByRoute.get(route)).toBe(access);
      }
      expect(missing).toEqual(UNGUARDED_ROUTE_ALLOWLIST.map(
        ({ method, url }) => ({ method, url }),
      ));
    } finally {
      await app.close();
    }
  });
});
