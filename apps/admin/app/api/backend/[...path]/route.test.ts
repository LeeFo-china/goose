import { afterAll, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";

const originalFetch = globalThis.fetch;
afterAll(() => { globalThis.fetch = originalFetch; });

const getAdminToken = mock(async () => "admin-token");
const buildBackendUrl = mock((path: string) => `https://api.example.com${path}`);
const backendFetch = mock(async () => new Response(null, {
  status: 302,
  headers: {
    location: "https://cos.example.com/signed",
    "cache-control": "private, no-store, max-age=0",
    pragma: "no-cache",
    "referrer-policy": "no-referrer",
    "set-cookie": "secret=1",
    "x-upstream-secret": "do-not-forward",
  },
}));

mock.module("@/lib/auth", () => ({ getAdminToken }));
mock.module("@/lib/backend", () => ({
  ADMIN_TOKEN_COOKIE: "gooes_admin_token",
  buildBackendUrl,
}));

const proxyContext = {
  params: Promise.resolve({ path: ["uploads", "files", "file", "preview"] }),
};

function createProxyRequest() {
  return new Request("https://admin.example.com/api/backend/uploads/files/file/preview");
}

describe("admin backend proxy redirects", () => {
  test("AI secret connection failure never logs URL values or upstream error text", async () => {
    const synthetic = "synthetic-private-input";
    const logs: unknown[] = [];
    const logger = spyOn(console, "error").mockImplementation((...values) => { logs.push(values); });
    backendFetch.mockRejectedValueOnce(new TypeError(synthetic));
    try {
      const { PATCH } = await import("./route");
      const response = await PATCH(new Request(`https://admin.example.com/api/backend/platform/ai-config/secret-settings/${synthetic}?key=${synthetic}`, {
        method: "PATCH", body: JSON.stringify({ value: synthetic }),
      }), { params: Promise.resolve({ path: ["platform", "ai-config", "secret-settings", synthetic] }) });
      expect(response.status).toBe(502);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      expect(JSON.stringify(logs)).not.toContain(synthetic);
      expect(backendFetch).toHaveBeenCalledTimes(1);
    } finally { logger.mockRestore(); }
  });
  test.each([200, 403, 500])("AI secret responses stay private for status %s", async (status) => {
    backendFetch.mockResolvedValueOnce(Response.json({ success: status === 200 }, { status }));
    const { PATCH } = await import("./route");
    const response = await PATCH(new Request("https://admin.example.com/api/backend/platform/ai-config/secret-settings/ARK_API_KEY", {
      method: "PATCH", body: JSON.stringify({ value: "synthetic-value" }),
    }), { params: Promise.resolve({ path: ["platform", "ai-config", "secret-settings", "ARK_API_KEY"] }) });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
  beforeEach(() => {
    backendFetch.mockClear();
    getAdminToken.mockResolvedValue("admin-token");
    globalThis.fetch = backendFetch as unknown as typeof fetch;
  });

  test("forwards only redirect and private preview safety headers", async () => {
    const { GET } = await import("./route");
    const response = await GET(
      createProxyRequest(),
      proxyContext,
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://cos.example.com/signed");
    expect(response.headers.get("cache-control")).toBe(
      "private, no-store, max-age=0",
    );
    expect(response.headers.get("pragma")).toBe("no-cache");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(response.headers.get("x-upstream-secret")).toBeNull();
  });

  test("clears the admin cookie when the backend rejects authentication", async () => {
    backendFetch.mockResolvedValueOnce(Response.json({
      success: false,
      code: "TOKEN_EXPIRED",
      message: "登录已过期，请重新登录",
    }, { status: 401 }));
    const { GET } = await import("./route");

    const response = await GET(createProxyRequest(), proxyContext);

    expect(response.status).toBe(401);
    expect(response.headers.get("set-cookie")).toContain("gooes_admin_token=");
    expect(response.headers.get("set-cookie")).toContain("Expires=Thu, 01 Jan 1970");
  });

  test("keeps the admin cookie for a real permission denial", async () => {
    backendFetch.mockResolvedValueOnce(Response.json({
      success: false,
      code: "FORBIDDEN",
      message: "无权限",
    }, { status: 403 }));
    const { GET } = await import("./route");

    const response = await GET(createProxyRequest(), proxyContext);

    expect(response.status).toBe(403);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  test.each([200, 403, 500])("keeps rendering JSON responses private for status %s", async (status) => {
    backendFetch.mockResolvedValueOnce(Response.json({ success: status === 200, data: { items: [] } }, {
      status,
      headers: { "cache-control": "private, no-store", "x-upstream-secret": "not-forwarded" },
    }));
    const { POST } = await import("./route");
    const response = await POST(new Request("https://admin.example.com/api/backend/tenant/rendering-library/files/previews", {
      method: "POST", body: JSON.stringify({ file_ids: [] }),
    }), { params: Promise.resolve({ path: ["tenant", "rendering-library", "files", "previews"] }) });
    expect(response.status).toBe(status);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("x-upstream-secret")).toBeNull();
  });

  test("keeps unauthenticated rendering responses private without calling backend", async () => {
    getAdminToken.mockResolvedValueOnce("");
    const { GET } = await import("./route");
    const response = await GET(new Request("https://admin.example.com/api/backend/tenant/rendering-library/styles"), {
      params: Promise.resolve({ path: ["tenant", "rendering-library", "styles"] }),
    });
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(backendFetch).not.toHaveBeenCalled();
  });

  test("keeps failed rendering connection responses private without retrying POST", async () => {
    backendFetch.mockRejectedValueOnce(new TypeError("offline test connection"));
    const { POST } = await import("./route");
    const response = await POST(new Request("https://admin.example.com/api/backend/tenant/rendering-library/files/previews", {
      method: "POST", body: "{}",
    }), { params: Promise.resolve({ path: ["tenant", "rendering-library", "files", "previews"] }) });
    expect(response.status).toBe(502);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(backendFetch).toHaveBeenCalledTimes(1);
  });

  test("does not apply rendering policy to similarly named unrelated routes", async () => {
    backendFetch.mockResolvedValueOnce(Response.json({ success: true }));
    const { GET } = await import("./route");
    const response = await GET(new Request("https://admin.example.com/api/backend/tenant/rendering-library-other/styles"), {
      params: Promise.resolve({ path: ["tenant", "rendering-library-other", "styles"] }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBeNull();
    expect(response.headers.get("referrer-policy")).toBeNull();
  });
});
