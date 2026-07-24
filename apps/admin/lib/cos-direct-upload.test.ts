import { afterEach, describe, expect, test } from "bun:test";
import { uploadDirectToCos } from "./cos-direct-upload";

const originalFetch = globalThis.fetch;

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("uploadDirectToCos", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("falls back to same-origin proxy when browser direct upload is blocked", async () => {
    const calls: string[] = [];
    const file = new File(["test"], "license.jpg", { type: "image/jpeg" });
    const firstObject =
      "tenants/tenant-id/wechat-pay-applyment/first-license.jpg";
    const proxyObject =
      "tenants/tenant-id/wechat-pay-applyment/proxy-license.jpg";
    const proxyInit = {
      object_key: proxyObject,
      storage_path: proxyObject,
      upload_url: "https://proxy.cos.example.com/proxy-license.jpg",
      method: "PUT" as const,
      headers: {
        "content-type": "image/jpeg",
        "content-length": String(file.size),
        "x-cos-forbid-overwrite": "true",
      },
      upload_intent: "proxy-bound-intent",
    };

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push(url);

      if (url === "/api/backend/uploads/cos/direct-init") {
        return jsonResponse({
          success: true,
          data: {
            object_key: firstObject,
            storage_path: firstObject,
            upload_url: "https://bucket.cos.accelerate.myqcloud.com/license.jpg",
            method: "PUT",
            headers: { "content-type": "image/jpeg" },
          },
        });
      }

      if (url === "https://bucket.cos.accelerate.myqcloud.com/license.jpg") {
        throw new TypeError("Failed to fetch");
      }

      if (url === "/api/uploads/cos/direct-proxy") {
        expect(init?.method).toBe("POST");
        expect(init?.body).toBeInstanceOf(FormData);
        const formData = init?.body as FormData;
        expect(formData.get("scene")).toBe("wechat_pay_applyment");
        expect(formData.get("filename")).toBe("license.jpg");
        expect(formData.get("mimetype")).toBe("image/jpeg");
        expect(formData.get("size_bytes")).toBe(String(file.size));
        expect(formData.get("file")).toBeInstanceOf(File);
        return jsonResponse({
          success: true,
          data: {
            init: proxyInit,
            completed: {
              file_id: "file-1",
              status: "active",
              object_key: proxyObject,
              storage_path: proxyObject,
            },
          },
        });
      }

      throw new Error(`unexpected fetch ${url}`);
    }) as typeof fetch;

    const uploaded = await uploadDirectToCos(file, {
      scene: "wechat_pay_applyment",
      uploadErrorLabel: "营业执照照片",
    });

    expect(uploaded.storagePath).toBe(proxyObject);
    expect(uploaded.objectKey).toBe(proxyObject);
    expect(uploaded.init).toEqual(proxyInit);
    expect(uploaded.init.object_key).toBe(proxyObject);
    expect(uploaded.init.upload_url).toBe(proxyInit.upload_url);
    expect(uploaded.init.upload_intent).toBe(proxyInit.upload_intent);
    expect(uploaded.init.headers).toEqual(proxyInit.headers);
    expect(uploaded.fileId).toBe("file-1");
    expect(calls).toEqual([
      "/api/backend/uploads/cos/direct-init",
      "https://bucket.cos.accelerate.myqcloud.com/license.jpg",
      "/api/uploads/cos/direct-proxy",
    ]);
  });

  test("does not fall back to the first init object when proxy omits its object", async () => {
    const file = new File(["test"], "license.jpg", { type: "image/jpeg" });
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/backend/uploads/cos/direct-init") {
        return jsonResponse({
          success: true,
          data: {
            object_key: "tenants/tenant-id/wechat-pay-applyment/first.jpg",
            upload_url: "https://cos.example.com/first.jpg",
          },
        });
      }
      if (url === "https://cos.example.com/first.jpg") {
        throw new TypeError("Failed to fetch");
      }
      if (url === "/api/uploads/cos/direct-proxy") {
        return jsonResponse({
          success: true,
          data: {
            completed: { file_id: "file-B", status: "active" },
          },
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    }) as typeof fetch;

    await expect(uploadDirectToCos(file, {
      scene: "wechat_pay_applyment",
    })).rejects.toThrow("文件上传成功但未返回地址");
  });

  test("forwards the upload intent when completing a direct upload", async () => {
    const file = new File(["test"], "license.jpg", { type: "image/jpeg" });
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/backend/uploads/cos/direct-init") {
        return jsonResponse({
          success: true,
          data: {
            object_key: "tenants/tenant-id/wechat-pay-applyment/license.jpg",
            upload_url: "https://cos.example.com/license.jpg",
            method: "PUT",
            headers: {
              "content-type": "image/jpeg",
              "content-length": String(file.size),
            },
            upload_intent: "bound-intent",
          },
        });
      }
      if (url === "https://cos.example.com/license.jpg") {
        return new Response(null, {
          status: 200,
          headers: { etag: '"etag-1"' },
        });
      }
      if (url === "/api/backend/uploads/cos/direct-complete") {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        expect(body.upload_intent).toBe("bound-intent");
        return jsonResponse({
          success: true,
          data: {
            file_id: "file-1",
            object_key: "tenants/tenant-id/wechat-pay-applyment/license.jpg",
          },
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    }) as typeof fetch;

    const uploaded = await uploadDirectToCos(file, {
      scene: "wechat_pay_applyment",
    });
    expect(uploaded.fileId).toBe("file-1");
  });

  test("does not expose a direct COS error body", async () => {
    const file = new File(["test"], "license.jpg", { type: "image/jpeg" });
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/backend/uploads/cos/direct-init") {
        return jsonResponse({
          success: true,
          data: {
            object_key: "tenants/tenant-id/private-license.jpg",
            upload_url: "https://cos.example.com/private-license.jpg",
          },
        });
      }
      if (url === "https://cos.example.com/private-license.jpg") {
        return new Response("secret certificate private-license", {
          status: 403,
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    }) as typeof fetch;

    const error = await uploadDirectToCos(file, {
      scene: "wechat_pay_applyment",
    }).catch((caught) => caught);

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe("上传文件到存储服务失败，请稍后重试");
    expect(error.message).not.toContain("private-license");
    expect(error.message).not.toContain("certificate");
  });
});
