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
    const proxyInit = {
      object_key: proxyObject,
      storage_path: proxyObject,
      upload_url: "https://cos.example.com/proxy-license.jpg",
      method: "PUT" as const,
      headers: {
        "content-type": "image/jpeg",
        "content-length": "4",
      },
      upload_intent: "proxy-intent",
    };
    globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/uploads/cos/direct-init")) {
        return jsonResponse({
          success: true,
          data: proxyInit,
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
      init: proxyInit,
      completed: {
        file_id: "file-B",
        status: "active",
        object_key: proxyObject,
        storage_path: proxyObject,
      },
    });
  });

  test.each([
    ["init", 1],
    ["COS", 2],
    ["complete", 3],
  ])("returns stable JSON when %s fetch has a network error", async (
    _stage,
    rejectAt,
  ) => {
    let fetchCalls = 0;
    globalThis.fetch = mock(async () => {
      fetchCalls += 1;
      if (fetchCalls === rejectAt) throw new TypeError("network secret");
      if (fetchCalls === 1) {
        return jsonResponse({
          success: true,
          data: {
            object_key: "tenants/tenant-id/wechat-pay-applyment/proxy.jpg",
            upload_url: "https://cos.example.com/proxy.jpg",
          },
        });
      }
      if (fetchCalls === 2) return new Response(null, { status: 200 });
      return jsonResponse({
        success: true,
        data: { file_id: "file-B", status: "active" },
      });
    }) as unknown as typeof fetch;

    const { POST } = await import("./route");
    const response = await POST(buildProxyRequest());
    const payload = await response.json() as Record<string, unknown>;

    expect(response.status).toBe(502);
    expect(payload).toMatchObject({
      success: false,
      message: "上传服务暂不可用，请稍后重试",
    });
    expect(JSON.stringify(payload)).not.toContain("network secret");
  });

  test("does not expose the COS response body", async () => {
    let fetchCalls = 0;
    globalThis.fetch = mock(async () => {
      fetchCalls += 1;
      if (fetchCalls === 1) {
        return jsonResponse({
          success: true,
          data: {
            object_key: "tenants/tenant-id/wechat-pay-applyment/proxy.jpg",
            upload_url: "https://cos.example.com/proxy.jpg",
          },
        });
      }
      return new Response(
        "secret certificate tenants/tenant-id/private-license.jpg",
        { status: 403 },
      );
    }) as unknown as typeof fetch;

    const { POST } = await import("./route");
    const response = await POST(buildProxyRequest());
    const payload = await response.json() as Record<string, unknown>;

    expect(response.status).toBe(502);
    expect(payload.message).toBe("上传文件到存储服务失败，请稍后重试");
    expect(JSON.stringify(payload)).not.toContain("private-license");
    expect(JSON.stringify(payload)).not.toContain("certificate");
  });

  test("allows a large platform service PDF attachment within the backend policy", async () => {
    const proxyObject =
      "private/tenant-service-fulfillment-attachments/platform-employees/hash/deployment.pdf";
    globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/uploads/cos/direct-init")) {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        expect(body.scene).toBe("tenant_service_fulfillment_attachment");
        expect(body.mimetype).toBe("application/pdf");
        expect(body.size_bytes).toBe(6 * 1024 * 1024);
        return jsonResponse({
          success: true,
          data: {
            object_key: proxyObject,
            storage_path: proxyObject,
            upload_url: "https://cos.example.com/deployment.pdf",
            method: "PUT",
            headers: {
              "content-type": "application/pdf",
              "content-length": String(6 * 1024 * 1024),
            },
            upload_intent: "proxy-private-intent",
          },
        });
      }
      if (url === "https://cos.example.com/deployment.pdf") {
        return new Response(null, {
          status: 200,
          headers: { etag: '"proxy-etag"' },
        });
      }
      if (url.endsWith("/uploads/cos/direct-complete")) {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        expect(body.object_key).toBe(proxyObject);
        expect(body.upload_intent).toBe("proxy-private-intent");
        return jsonResponse({
          success: true,
          data: { file_id: "file-service-pdf", status: "active" },
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    }) as unknown as typeof fetch;

    const formData = new FormData();
    formData.set(
      "file",
      new File(
        [new Uint8Array(6 * 1024 * 1024)],
        "deployment.pdf",
        { type: "application/pdf" },
      ),
    );
    formData.set("payload", JSON.stringify({
      scene: "tenant_service_fulfillment_attachment",
      filename: "deployment.pdf",
      mimetype: "application/pdf",
      size_bytes: 6 * 1024 * 1024,
    }));
    const { POST } = await import("./route");
    const response = await POST(new Request(
      "https://admin.example.com/api/uploads/cos/direct-proxy",
      { method: "POST", body: formData },
    ));
    const payload = await response.json() as {
      data: Record<string, unknown>;
    };

    expect(response.status).toBe(200);
    expect(payload.data.completed).toMatchObject({
      file_id: "file-service-pdf",
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

function buildProxyRequest() {
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
  return new Request(
    "https://admin.example.com/api/uploads/cos/direct-proxy",
    { method: "POST", body: formData },
  );
}
