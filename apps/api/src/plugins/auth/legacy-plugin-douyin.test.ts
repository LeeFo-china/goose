import { beforeAll, describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import Fastify from "fastify";
import errorHandler from "@/plugins/error-handler";

const JWT_SECRET = "douyin-session-jwt-secret-at-least-32-bytes";
process.env.JWT_SECRET = JWT_SECRET;

let authPlugin: typeof import("./legacy-plugin").default;
let signDouyinMiniappToken: typeof import("@/utils/jwt").signDouyinMiniappToken;
let signToken: typeof import("@/utils/jwt").signToken;

beforeAll(async () => {
  ({ default: authPlugin } = await import("./legacy-plugin"));
  ({ signDouyinMiniappToken, signToken } = await import("@/utils/jwt"));
});

async function createApp() {
  const app = Fastify({ logger: false });
  errorHandler(app);
  authPlugin(app);
  app.post("/douyin-mini/auth/session", async () => ({ session: true }));
  app.get("/douyin-mini/bootstrap", async (request) => ({ user: request.user }));
  app.get("/ordinary", async () => ({ ordinary: true }));
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

    expect((await app.inject({ method: "GET", url: "/douyin-mini/bootstrap",
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
});
