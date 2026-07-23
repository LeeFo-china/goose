import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

const getAdminToken = mock(async () => "admin-token");
const buildBackendUrl = mock((path: string) => `https://api.example.com${path}`);

mock.module("@/lib/auth", () => ({ getAdminToken }));
mock.module("@/lib/backend", () => ({ buildBackendUrl }));

const originalFetch = globalThis.fetch;

describe("COS direct upload proxy", () => {
  beforeEach(() => {
    getAdminToken.mockClear();
    buildBackendUrl.mockClear();
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("returns the object created by its own init when complete is private", async () => {
    const proxyObject =
      "tenants/tenant-id/wechat-pay-applyment/proxy-license.jpg";
    globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/uploads/cos/direct-init")) {
        return jsonResponse({
          success: true,
          data: {
            object_key: proxyObject,
            storage_path: proxyObject,
            upload_url: "https://cos.example.com/proxy-license.jpg",
            headers: { "content-type": "image/jpeg" },
            upload_intent: "proxy-intent",
          },
        });
      }
      if (url === "https://cos.example.com/proxy-license.jpg") {
        return new Response(null, {
          status: 200,
          headers: { etag: '"proxy-etag"' },
        });
      }
      if (url.endsWith("/uploads/cos/direct-complete")) {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        expect(body.object_key).toBe(proxyObject);
        expect(body.upload_intent).toBe("proxy-intent");
        return jsonResponse({
          success: true,
          data: { file_id: "file-B", status: "active" },
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    }) as unknown as typeof fetch;

    const formData = new FormData();
    formData.set(
      "file",
      new File(["test"], "license.jpg", { type: "image/jpeg" }),
    );
    formData.set("payload", JSON.stringify({
      scene: "wechat_pay_applyment",
      filename: "license.jpg",
      mimetype: "image/jpeg",
      size_bytes: 4,
    }));
    const { POST } = await import("./route");
    const response = await POST(new Request(
      "https://admin.example.com/api/uploads/cos/direct-proxy",
      { method: "POST", body: formData },
    ));
    const payload = await response.json() as {
      data: Record<string, unknown>;
    };

    expect(payload.data).toEqual({
      file_id: "file-B",
      status: "active",
      object_key: proxyObject,
      storage_path: proxyObject,
    });
  });
});

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}
