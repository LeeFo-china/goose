import { beforeAll, describe, expect, spyOn, test } from "bun:test";
import { createHmac } from "node:crypto";
import Fastify from "fastify";
import errorHandler from "@/plugins/error-handler";
import { shouldBypassDouyinAuth } from "./legacy/douyin-routes";

const JWT_SECRET = "douyin-session-jwt-secret-at-least-32-bytes";
process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";
process.env.JWT_SECRET = JWT_SECRET;

let authPlugin: typeof import("./legacy-plugin").default;
let signDouyinMiniappToken: typeof import("@/utils/jwt").signDouyinMiniappToken;
let signToken: typeof import("@/utils/jwt").signToken;
let userIdentityService: typeof import("@/services/user-identities").userIdentityService;

beforeAll(async () => {
  ({ default: authPlugin } = await import("./legacy-plugin"));
  ({ signDouyinMiniappToken, signToken } = await import("@/utils/jwt"));
  ({ userIdentityService } = await import("@/services/user-identities"));
});

async function createApp() {
  const app = Fastify({ logger: false });
  errorHandler(app);
  authPlugin(app);
  app.post("/douyin-mini/auth/session", async () => ({ session: true }));
  app.get("/douyin-mini/bootstrap", async (request) => ({ user: request.user }));
  app.get("/douyin-mini/material-notes", async (request) => ({ user: request.user }));
  app.get("/douyin-mini/material-notes/:id", async (request) => ({ user: request.user }));
  app.get("/douyin-mini/renderings/quota", async (request) => ({ user: request.user }));
  app.get("/douyin-mini/renderings/styles", async (request) => ({ user: request.user }));
  app.get("/douyin-mini/renderings/styles/:id", async (request) => ({ user: request.user }));
  app.post("/douyin-mini/renderings/styles/:id", async (request) => ({ user: request.user }));
  app.post("/douyin-mini/material-notes/:id/claim", async (request) => ({ user: request.user }));
  app.get("/douyin-mini/my-material-notes", async (request) => ({ user: request.user }));
  app.get("/douyin-mini/my-material-notes/:claimId", async (request) => ({ user: request.user }));
  app.post("/douyin-mini/my-material-notes/:claimId/remove", async (request) =>
    ({ user: request.user }));
  app.post("/douyin-mini/my-material-notes/clear", async (request) => ({ user: request.user }));
  app.get("/ordinary", async () => ({ ordinary: true }));
  app.get("/customer/projects", async (request) => ({ user: request.user }));
  await app.ready();
  return app;
}

const douyinPayload = {
  tenant_id: "33333333-3333-4333-8333-333333333333",
  douyin_installation_id: "22222222-2222-4222-8222-222222222222",
  douyin_app_id: "tt-authorizer-1",
  subject_hash: "a".repeat(64),
};

function signExpiredToken(payload: Record<string, unknown>) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" }))
    .toString("base64url");
  const body = Buffer.from(JSON.stringify({ ...payload, iat: 0, exp: 1 }))
    .toString("base64url");
  const signature = createHmac("sha256", JWT_SECRET)
    .update(`${header}.${body}`)
    .digest("base64url");
  return `${header}.${body}.${signature}`;
}

describe("auth plugin Douyin miniapp isolation", () => {
  test("bypasses auth only for the exact session exchange POST", async () => {
    const app = await createApp();
    expect((await app.inject({ method: "POST", url: "/douyin-mini/auth/session" })).statusCode)
      .toBe(200);
    await app.close();
  });

  test("accepts only Douyin sessions on protected Douyin routes", async () => {
    const app = await createApp();
    const douyinToken = signDouyinMiniappToken(douyinPayload);
    const regularToken = signToken({ sub: "employee-auth-user", token_type: "auth" });

    const accepted = await app.inject({
      method: "GET",
      url: "/douyin-mini/bootstrap",
      headers: { authorization: `Bearer ${douyinToken}` },
    });
    expect(accepted.statusCode).toBe(200);
    expect(accepted.json().user).toMatchObject({ token_type: "douyin_miniapp" });
    expect((await app.inject({ method: "GET", url: "/douyin-mini/renderings/quota",
      headers: { authorization: `Bearer ${douyinToken}` },
    })).statusCode).toBe(200);
    for (const url of [
      "/douyin-mini/renderings/styles",
      "/douyin-mini/renderings/styles/11111111-1111-4111-8111-111111111111",
    ]) {
      expect((await app.inject({ method: "GET", url,
        headers: { authorization: `Bearer ${douyinToken}` },
      })).statusCode).toBe(200);
      expect((await app.inject({ method: "GET", url })).statusCode).toBe(401);
    }

    expect((await app.inject({ method: "GET", url: "/douyin-mini/bootstrap",
      headers: { authorization: `Bearer ${regularToken}` } })).statusCode).toBe(401);
    expect((await app.inject({ method: "GET", url: "/douyin-mini/renderings/quota",
      headers: { authorization: `Bearer ${regularToken}` } })).statusCode).toBe(401);
    expect((await app.inject({ method: "GET", url: "/ordinary",
      headers: { authorization: `Bearer ${douyinToken}` } })).statusCode).toBe(401);
    await app.close();
  });

  test("rejects expired Douyin and regular sessions before route dispatch", async () => {
    const expiredDouyin = signExpiredToken({
      ...douyinPayload,
      sub: douyinPayload.subject_hash,
      token_type: "douyin_miniapp",
      login_channel: "douyin",
      roles: ["douyin_miniapp"],
    });
    const expiredRegular = signExpiredToken({
      sub: "employee-auth-user",
      token_type: "auth",
    });
    const app = await createApp();

    const douyinResponse = await app.inject({
      method: "GET",
      url: "/douyin-mini/bootstrap",
      headers: { authorization: `Bearer ${expiredDouyin}` },
    });
    const regularResponse = await app.inject({
      method: "GET",
      url: "/ordinary",
      headers: { authorization: `Bearer ${expiredRegular}` },
    });

    expect(douyinResponse.statusCode).toBe(401);
    expect(douyinResponse.json()).toMatchObject({ code: "TOKEN_EXPIRED" });
    expect(regularResponse.statusCode).toBe(401);
    expect(regularResponse.json()).toMatchObject({ code: "TOKEN_EXPIRED" });
    await app.close();
  });

  test("keeps all seven material routes behind the mini-session policy", async () => {
    const app = await createApp();
    const douyinToken = signDouyinMiniappToken(douyinPayload);
    const regularToken = signToken({ sub: "employee-auth-user", token_type: "auth" });
    const noteId = "11111111-1111-4111-8111-111111111111";
    const claimId = "33333333-3333-4333-8333-333333333333";
    const routes = [
      ["GET", "/douyin-mini/material-notes"],
      ["GET", `/douyin-mini/material-notes/${noteId}`],
      ["POST", `/douyin-mini/material-notes/${noteId}/claim`],
      ["GET", "/douyin-mini/my-material-notes"],
      ["GET", `/douyin-mini/my-material-notes/${claimId}`],
      ["POST", `/douyin-mini/my-material-notes/${claimId}/remove`],
      ["POST", "/douyin-mini/my-material-notes/clear"],
    ] as const;

    for (const [method, url] of routes) {
      expect(shouldBypassDouyinAuth(method, url)).toBe(false);
      expect((await app.inject({ method, url })).statusCode).toBe(401);
      expect((await app.inject({
        method,
        url,
        headers: { authorization: `Bearer ${regularToken}` },
      })).statusCode).toBe(401);
      expect((await app.inject({
        method,
        url,
        headers: { authorization: `Bearer ${douyinToken}` },
      })).statusCode).toBe(200);
    }
    await app.close();
  });

  test("rejects invalid sessions on all eleven actual material routes including HEAD", async () => {
    const { DouyinMiniappController } = await import("@/controllers/douyin-miniapp");
    const app = Fastify({ logger: false });
    errorHandler(app);
    authPlugin(app);
    let dispatched = 0;
    app.addHook("preHandler", async () => { dispatched += 1; });
    new DouyinMiniappController().registerExtraRoutes(app);
    const noteId = "11111111-1111-4111-8111-111111111111";
    const claimId = "33333333-3333-4333-8333-333333333333";
    const routes = [
      ["GET", "/douyin-mini/material-notes"],
      ["HEAD", "/douyin-mini/material-notes"],
      ["GET", `/douyin-mini/material-notes/${noteId}`],
      ["HEAD", `/douyin-mini/material-notes/${noteId}`],
      ["POST", `/douyin-mini/material-notes/${noteId}/claim`],
      ["GET", "/douyin-mini/my-material-notes"],
      ["HEAD", "/douyin-mini/my-material-notes"],
      ["GET", `/douyin-mini/my-material-notes/${claimId}`],
      ["HEAD", `/douyin-mini/my-material-notes/${claimId}`],
      ["POST", `/douyin-mini/my-material-notes/${claimId}/remove`],
      ["POST", "/douyin-mini/my-material-notes/clear"],
    ] as const;
    const regular = signToken({ sub: "employee-auth-user", token_type: "auth" });
    const expired = signExpiredToken({
      ...douyinPayload, sub: douyinPayload.subject_hash, token_type: "douyin_miniapp",
      login_channel: "douyin", roles: ["douyin_miniapp"],
    });
    const valid = signDouyinMiniappToken(douyinPayload);
    const forged = `${valid.slice(0, valid.lastIndexOf(".") + 1)}${"x".repeat(43)}`;
    try {
      await app.ready();
      for (const [method, url] of routes) {
        expect(shouldBypassDouyinAuth(method, url)).toBe(false);
        for (const token of [undefined, regular, expired, forged]) {
          const response = await app.inject({ method, url,
            headers: token ? { authorization: `Bearer ${token}` } : {},
          });
          expect(response.statusCode).toBe(401);
        }
      }
      expect(dispatched).toBe(0);
    } finally {
      await app.close();
    }
  });

  test("accepts Douyin customer auth tokens only on customer routes with active bindings", async () => {
    const app = await createApp();
    const token = signToken({
      sub: "auth-user-1",
      token_type: "auth",
      login_channel: "douyin",
      roles: ["customer"],
      tenant_id: douyinPayload.tenant_id,
      customer_id: "11111111-1111-4111-8111-111111111111",
      subject_hash: douyinPayload.subject_hash,
      douyin_installation_id: douyinPayload.douyin_installation_id,
      douyin_app_id: douyinPayload.douyin_app_id,
    });
    const oauth = spyOn(userIdentityService, "findActiveOauthIdentity")
      .mockResolvedValue({ user_id: "auth-user-1" } as never);
    const membership = spyOn(userIdentityService, "hasActiveBusinessMembership")
      .mockResolvedValue(true);

    const accepted = await app.inject({
      method: "GET",
      url: "/customer/projects",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(accepted.statusCode).toBe(200);
    expect(accepted.json().user).toMatchObject({
      login_channel: "douyin",
      customer_id: "11111111-1111-4111-8111-111111111111",
    });
    const renderingQuota = await app.inject({
      method: "GET",
      url: "/douyin-mini/renderings/quota",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(renderingQuota.statusCode).toBe(200);
    for (const url of [
      "/douyin-mini/renderings/styles",
      "/douyin-mini/renderings/styles/11111111-1111-4111-8111-111111111111",
    ]) {
      const catalog = await app.inject({
        method: "GET", url, headers: { authorization: `Bearer ${token}` },
      });
      expect(catalog.statusCode).toBe(200);
      expect(catalog.json().user).toMatchObject({ login_channel: "douyin" });
      expect((await app.inject({
        method: "HEAD", url, headers: { authorization: `Bearer ${token}` },
      })).statusCode).toBe(200);
    }
    expect((await app.inject({
      method: "POST",
      url: "/douyin-mini/renderings/styles/11111111-1111-4111-8111-111111111111",
      headers: { authorization: `Bearer ${token}` },
    })).statusCode).toBe(401);
    expect((await app.inject({
      method: "GET",
      url: "/douyin-mini/renderings/styles/11111111-1111-4111-8111-111111111111/extra",
      headers: { authorization: `Bearer ${token}` },
    })).statusCode).toBe(401);
    expect((await app.inject({
      method: "GET",
      url: "/douyin-mini/bootstrap",
      headers: { authorization: `Bearer ${token}` },
    })).statusCode).toBe(401);
    expect((await app.inject({
      method: "GET",
      url: "/ordinary",
      headers: { authorization: `Bearer ${token}` },
    })).statusCode).toBe(401);

    oauth.mockRestore();
    membership.mockRestore();
    await app.close();
  });

  test("rejects Douyin customer auth tokens when OAuth binding is inactive", async () => {
    const app = await createApp();
    const token = signToken({
      sub: "auth-user-1",
      token_type: "auth",
      login_channel: "douyin",
      roles: ["customer"],
      tenant_id: douyinPayload.tenant_id,
      customer_id: "11111111-1111-4111-8111-111111111111",
      subject_hash: douyinPayload.subject_hash,
    });
    const oauth = spyOn(userIdentityService, "findActiveOauthIdentity")
      .mockResolvedValue(null);
    const membership = spyOn(userIdentityService, "hasActiveBusinessMembership")
      .mockResolvedValue(true);

    const response = await app.inject({
      method: "GET",
      url: "/customer/projects",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.statusCode).toBe(401);

    oauth.mockRestore();
    membership.mockRestore();
    await app.close();
  });
});
