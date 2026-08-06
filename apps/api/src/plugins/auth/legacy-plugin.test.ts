import { afterEach, describe, expect, test } from "bun:test";
import Fastify, { type FastifyInstance } from "fastify";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";
process.env.JWT_SECRET ??= "test-jwt-secret-at-least-thirty-two-characters";

const apps: FastifyInstance[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe("authPlugin WeChat virtual-payment reachability", () => {
  test("lets unauthenticated exact GET and POST reach handlers only", async () => {
    const { default: authPlugin } = await import("./legacy-plugin");
    const app = Fastify({ logger: false, exposeHeadRoutes: false });
    apps.push(app);
    await app.register(async (scope) => {
      authPlugin(scope);
      const methods = ["GET", "POST", "HEAD", "PUT", "PATCH", "DELETE"] as const;
      for (const method of methods) {
        scope.route({
          method,
          url: "/wechat/virtual-payment/events",
          handler: async () => ({ reached: true, method }),
        });
      }
      scope.get(
        "/wechat/virtual-payment/events/extra",
        async () => ({ reached: true }),
      );
      scope.get(
        "/visitor/local-service-providers",
        async (request) => ({ reached: true, visitorId: request.user?.visitor_id }),
      );
    });

    for (const method of ["GET", "POST"] as const) {
      const response = await app.inject({
        method,
        url: "/wechat/virtual-payment/events",
      });
      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body) as unknown).toEqual({ reached: true, method });
    }

    for (const method of ["HEAD", "PUT", "PATCH", "DELETE"] as const) {
      const response = await app.inject({
        method,
        url: "/wechat/virtual-payment/events",
      });
      expect(response.statusCode).toBe(401);
    }
    const extra = await app.inject({
      method: "GET",
      url: "/wechat/virtual-payment/events/extra",
    });
    expect(extra.statusCode).toBe(401);

    const invalidBearer = await app.inject({
      method: "GET",
      url: "/wechat/virtual-payment/events/extra",
      headers: { authorization: "Bearer definitely-invalid" },
    });
    expect(invalidBearer.statusCode).toBe(401);

    const { signVisitorSessionToken } = await import("@/utils/jwt");
    const validVisitor = await app.inject({
      method: "GET",
      url: "/visitor/local-service-providers",
      headers: {
        authorization: `Bearer ${signVisitorSessionToken({
          openid: "openid-auth-hook-smoke",
          visitor_id: "visitor-auth-hook-smoke",
        })}`,
      },
    });
    expect(validVisitor.statusCode).toBe(200);
    expect(JSON.parse(validVisitor.body) as unknown).toEqual({
      reached: true,
      visitorId: "visitor-auth-hook-smoke",
    });
  });

  test("lets visitor session tokens reach share campaign open, detail, and assist handlers", async () => {
    const { default: authPlugin } = await import("./legacy-plugin");
    const { signVisitorSessionToken } = await import("@/utils/jwt");
    const app = Fastify({ logger: false, exposeHeadRoutes: false });
    apps.push(app);
    await app.register(async (scope) => {
      authPlugin(scope);
      scope.post("/share-campaigns/open", async (request) => ({
        reached: true,
        openid: request.user?.openid,
        visitorId: request.user?.visitor_id,
      }));
      scope.get("/share-campaigns/:shareToken", async (request) => ({
        reached: true,
        openid: request.user?.openid,
        visitorId: request.user?.visitor_id,
      }));
      scope.post("/share-campaigns/assist", async (request) => ({
        reached: true,
        openid: request.user?.openid,
        visitorId: request.user?.visitor_id,
      }));
    });

    const authorization = `Bearer ${signVisitorSessionToken({
      openid: "openid-share-assist-smoke",
      visitor_id: "visitor-share-assist-smoke",
    })}`;

    for (const [method, url] of [
      ["POST", "/share-campaigns/open"],
      ["GET", "/share-campaigns/share-token"],
      ["POST", "/share-campaigns/assist"],
    ] as const) {
      const response = await app.inject({
        method,
        url,
        headers: { authorization },
      });
      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body) as unknown).toEqual({
        reached: true,
        openid: "openid-share-assist-smoke",
        visitorId: "visitor-share-assist-smoke",
      });
    }
  });
});
