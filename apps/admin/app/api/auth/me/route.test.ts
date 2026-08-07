import { beforeEach, describe, expect, mock, test } from "bun:test";

const getAdminToken = mock(async () => "admin-token");
const buildBackendUrl = mock((path: string) => `https://api.example.com${path}`);
const backendFetch = mock(async () => Response.json({
  success: true,
  data: { user_id: "user-id" },
}));

mock.module("@/lib/auth", () => ({ getAdminToken }));
mock.module("@/lib/backend", () => ({
  ADMIN_TOKEN_COOKIE: "gooes_admin_token",
  buildBackendUrl,
}));

describe("admin auth me proxy", () => {
  beforeEach(() => {
    getAdminToken.mockClear();
    backendFetch.mockClear();
    globalThis.fetch = backendFetch as unknown as typeof fetch;
  });

  test("clears the admin cookie when the backend rejects authentication", async () => {
    backendFetch.mockResolvedValueOnce(Response.json({
      success: false,
      code: "TOKEN_INVALID",
      message: "登录凭证无效",
    }, { status: 401 }));
    const { GET } = await import("./route");

    const response = await GET();

    expect(response.status).toBe(401);
    expect(response.headers.get("set-cookie")).toContain("gooes_admin_token=");
  });

  test("keeps the admin cookie for a real permission denial", async () => {
    backendFetch.mockResolvedValueOnce(Response.json({
      success: false,
      code: "FORBIDDEN",
      message: "无权限",
    }, { status: 403 }));
    const { GET } = await import("./route");

    const response = await GET();

    expect(response.status).toBe(403);
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});
