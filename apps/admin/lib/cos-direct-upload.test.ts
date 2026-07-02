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

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push(url);

      if (url === "/api/backend/uploads/cos/direct-init") {
        return jsonResponse({
          success: true,
          data: {
            object_key: "tenants/tenant-id/wechat-pay-applyment/license.jpg",
            storage_path: "tenants/tenant-id/wechat-pay-applyment/license.jpg",
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
            file_id: "file-1",
            object_key: "tenants/tenant-id/wechat-pay-applyment/license.jpg",
            storage_path: "tenants/tenant-id/wechat-pay-applyment/license.jpg",
            public_url: "https://assets.example.com/license.jpg",
          },
        });
      }

      throw new Error(`unexpected fetch ${url}`);
    }) as typeof fetch;

    const uploaded = await uploadDirectToCos(file, {
      scene: "wechat_pay_applyment",
      uploadErrorLabel: "营业执照照片",
    });

    expect(uploaded.storagePath).toBe("tenants/tenant-id/wechat-pay-applyment/license.jpg");
    expect(uploaded.fileId).toBe("file-1");
    expect(calls).toEqual([
      "/api/backend/uploads/cos/direct-init",
      "https://bucket.cos.accelerate.myqcloud.com/license.jpg",
      "/api/uploads/cos/direct-proxy",
    ]);
  });
});
