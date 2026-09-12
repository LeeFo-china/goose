import { describe, expect, test } from "bun:test";
import { loadRenderingStorageConfig } from "@/gateways/rendering-library-storage/client";
import {
  CustomerRenderingSmokeStorage,
  type CustomerRenderingSmokeCosPort,
} from "./client";

const runId = "11111111-1111-4111-8111-111111111111";
const config = {
  bucket: "rendering-123456",
  region: "ap-guangzhou",
  secretId: "dummy-id",
  secretKey: "dummy-key",
};

function location(slot: "room" | "style" | "result") {
  const extension = slot === "result" ? "webp" : "png";
  return {
    bucket: config.bucket,
    region: config.region,
    object_key: `private/customer-rendering-smoke/${runId}/${slot}.${extension}`,
  };
}

function fixture(storageConfig = config) {
  const calls: Array<[string, unknown]> = [];
  let shouldFail = false;
  const cos: CustomerRenderingSmokeCosPort = {
    async putObject(params) {
      calls.push(["put", params]);
      if (shouldFail) throw new Error("dummy-key signed request");
      return {};
    },
    getObjectUrl(params) {
      calls.push(["sign", params]);
      if (shouldFail) throw new Error("dummy-key signed request");
      return `https://${config.bucket}.cos.${config.region}.myqcloud.com/${params.Key}?q-sign-algorithm=sha1&q-signature=dummy`;
    },
    async headObject(params) {
      calls.push(["head", params]);
      if (shouldFail) throw new Error("dummy-key signed request");
      return { headers: { "content-length": "12" }, ETag: "etag" };
    },
    async deleteObject(params) {
      calls.push(["delete", params]);
      if (shouldFail) throw new Error("dummy-key signed request");
      return {};
    },
  };
  const storage = new CustomerRenderingSmokeStorage({
    loadConfig: async () => storageConfig,
    createCos: () => cos,
  });
  return { storage, calls, fail: () => { shouldFail = true; } };
}

describe("CustomerRenderingSmokeStorage", () => {
  test("accepts shared storage config with a public base while smoke writes and signing remain private", async () => {
    const values: Record<string, string> = {
      PLATFORM_STORAGE_PROVIDER: "tencent_cos", PLATFORM_COS_BUCKET: config.bucket,
      PLATFORM_COS_REGION: config.region, PLATFORM_COS_PUBLIC_BASE_URL: "https://cdn.example.test",
    };
    const loaded = await loadRenderingStorageConfig({
      getString: async (key) => values[key] ?? "",
      getSecretString: async (key) => key === "TENCENT_COS_SECRET_ID" ? config.secretId : config.secretKey,
    });
    expect(loaded.publicBaseUrl).toBe("https://cdn.example.test/");
    const { storage, calls } = fixture(loaded);
    const bytes = Buffer.alloc(12, 1);
    const target = await storage.put(runId, "result", bytes, "image/webp");
    expect(target).toEqual(location("result"));
    expect(calls).toContainEqual(["put", {
      Bucket: config.bucket, Region: config.region, Key: location("result").object_key,
      Body: bytes, ContentLength: bytes.length, ContentType: "image/webp", ACL: "private", CacheControl: "private, no-store",
    }]);
    const signed = new URL(await storage.sign(runId, "result", target));
    expect(signed.host).toBe(`${config.bucket}.cos.${config.region}.myqcloud.com`);
    expect(signed.pathname).toBe(`/${target.object_key}`);
    expect(signed.searchParams.get("q-signature")).toBe("dummy");
  });

  test("writes only canonical private smoke objects and returns their locations", async () => {
    const { storage, calls } = fixture();
    const bytes = Buffer.alloc(12, 1);

    expect(await storage.put(runId, "room", bytes, "image/png")).toEqual(location("room"));
    expect(await storage.put(runId, "style", bytes, "image/png")).toEqual(location("style"));
    expect(await storage.put(runId, "result", bytes, "image/webp")).toEqual(location("result"));
    expect(calls).toContainEqual(["put", {
      Bucket: config.bucket,
      Region: config.region,
      Key: location("result").object_key,
      Body: bytes,
      ContentLength: bytes.length,
      ContentType: "image/webp",
      ACL: "private",
      CacheControl: "private, no-store",
    }]);
  });

  test("signs, verifies and deletes only the canonical object", async () => {
    const { storage, calls } = fixture();
    const target = location("result");

    const signed = await storage.sign(runId, "result", target);
    expect(new URL(signed).searchParams.get("q-signature")).toBe("dummy");
    await storage.verify(runId, "result", target, 12);
    await storage.remove(runId, "result", target);

    expect(calls).toContainEqual(["sign", {
      Bucket: config.bucket,
      Region: config.region,
      Key: target.object_key,
      Sign: true,
      Method: "GET",
      Expires: 600,
      Protocol: "https:",
    }]);
    expect(calls).toContainEqual(["head", {
      Bucket: config.bucket,
      Region: config.region,
      Key: target.object_key,
    }]);
    expect(calls).toContainEqual(["delete", {
      Bucket: config.bucket,
      Region: config.region,
      Key: target.object_key,
    }]);
  });

  test("rejects invalid runs, slots, sizes, mime types and moved locations before COS", async () => {
    const { storage, calls } = fixture();
    const bytes = Buffer.alloc(12, 1);
    await expect(storage.put("bad", "room", bytes, "image/png"))
      .rejects.toMatchObject({ code: "RENDERING_SMOKE_STORAGE_UNAVAILABLE" });
    await expect(storage.put(runId, "room", Buffer.alloc(0), "image/png"))
      .rejects.toMatchObject({ code: "RENDERING_SMOKE_STORAGE_UNAVAILABLE" });
    await expect(storage.put(runId, "room", bytes, "image/jpeg"))
      .rejects.toMatchObject({ code: "RENDERING_SMOKE_STORAGE_UNAVAILABLE" });
    await expect(storage.sign(runId, "room", {
      ...location("room"),
      object_key: `${location("room").object_key}/../result.webp`,
    })).rejects.toMatchObject({ code: "RENDERING_SMOKE_STORAGE_UNAVAILABLE" });
    await expect(storage.verify(runId, "result", location("result"), 11))
      .rejects.toMatchObject({ code: "RENDERING_SMOKE_STORAGE_FAILED" });
    expect(calls.filter(([name]) => name === "put" || name === "sign")).toEqual([]);
  });

  test("wraps SDK errors without exposing COS credentials", async () => {
    const { storage, fail } = fixture();
    fail();
    for (const operation of [
      () => storage.put(runId, "room", Buffer.alloc(12), "image/png"),
      () => storage.sign(runId, "result", location("result")),
      () => storage.verify(runId, "result", location("result"), 12),
      () => storage.remove(runId, "result", location("result")),
    ]) {
      let message = "";
      try { await operation(); } catch (error) {
        message = error instanceof Error ? error.message : String(error);
      }
      expect(message).toBe("装修生图临时存储操作失败");
      expect(message).not.toContain(config.secretKey);
    }
  });
});
