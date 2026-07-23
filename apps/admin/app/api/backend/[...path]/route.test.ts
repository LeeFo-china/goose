import { beforeEach, describe, expect, mock, test } from "bun:test";

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
mock.module("@/lib/backend", () => ({ buildBackendUrl }));

describe("admin backend proxy redirects", () => {
  beforeEach(() => {
    backendFetch.mockClear();
    globalThis.fetch = backendFetch as unknown as typeof fetch;
  });

  test("forwards only redirect and private preview safety headers", async () => {
    const { GET } = await import("./route");
    const response = await GET(
      new Request("https://admin.example.com/api/backend/uploads/files/file/preview"),
      { params: Promise.resolve({ path: ["uploads", "files", "file", "preview"] }) },
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
});
