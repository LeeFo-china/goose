import { describe, expect, mock, test } from "bun:test";
import { Errors } from "@/errors/error-factory";
import {
  parseCustomerRenderingArkSmokeArgs,
  runCustomerRenderingArkSmoke,
  type CustomerRenderingArkSmokeDependencies,
} from "./customer-rendering-ark-smoke";

const runId = "11111111-1111-4111-8111-111111111111";
const imageConfig = {
  providerCode: "volcengine_ark",
  providerType: "openai_compatible" as const,
  modelCode: "ark.seedream",
  modelName: "doubao-seedream-5-0-pro-260628",
  baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
  apiKey: "ark-sensitive-key",
  timeoutMs: 60000,
};

function fixture() {
  const calls: Array<[string, unknown?]> = [];
  const locations = {
    room: { bucket: "bucket-123", region: "ap-guangzhou", object_key: `private/customer-rendering-smoke/${runId}/room.png` },
    style: { bucket: "bucket-123", region: "ap-guangzhou", object_key: `private/customer-rendering-smoke/${runId}/style.png` },
    result: { bucket: "bucket-123", region: "ap-guangzhou", object_key: `private/customer-rendering-smoke/${runId}/result.webp` },
  };
  const dependencies: CustomerRenderingArkSmokeDependencies = {
    resolveImageConfig: mock(async () => {
      calls.push(["resolve-config"]);
      return imageConfig;
    }),
    assertStorageReady: mock(async () => { calls.push(["storage-ready"]); }),
    readFixture: mock(async (slot) => {
      calls.push(["read", slot]);
      return Buffer.from(`png-${slot}`);
    }),
    storage: {
      put: mock(async (_runId: string, slot: "room" | "style" | "result") => {
        calls.push(["put", slot]);
        return locations[slot];
      }),
      sign: mock(async (_runId, slot) => {
        calls.push(["sign", slot]);
        return `https://bucket-123.cos.ap-guangzhou.myqcloud.com/${slot}.png?q-signature=private`;
      }),
      verify: mock(async (_runId, slot) => { calls.push(["verify", slot]); }),
      remove: mock(async (_runId, slot) => { calls.push(["remove", slot]); }),
    },
    generate: mock(async (config, input) => {
      calls.push(["generate", { config, input }]);
      return {
        imageUrl: "https://ark-content-generation-v2-cn-beijing.tos-cn-beijing.volces.com/result.jpeg?X-Tos-Signature=private",
        requestId: "req-safe-1",
        usage: { generated_images: 1, output_tokens: 1200, total_tokens: 1200 },
      };
    }),
    download: mock(async () => {
      calls.push(["download"]);
      return { bytes: Buffer.from("jpeg-result"), mimeType: "image/jpeg" as const };
    }),
    normalize: mock(async () => {
      calls.push(["normalize"]);
      return { bytes: Buffer.from("webp-result"), width: 2048, height: 1152 };
    }),
    writeOutput: mock(async (path, bytes) => { calls.push(["write", { path, bytes }]); }),
    outputExists: () => false,
    randomUuid: () => runId,
    now: () => 1000,
  };
  return { dependencies, calls };
}

describe("customer rendering Ark smoke", () => {
  test("defaults to a read-only readiness check", async () => {
    const { dependencies, calls } = fixture();
    const result = await runCustomerRenderingArkSmoke({ execute: false }, dependencies);

    expect(result).toEqual({
      executed: false,
      sceneCode: "decoration_raw_drawing",
      providerCode: "volcengine_ark",
      modelCode: "ark.seedream",
      modelName: "doubao-seedream-5-0-pro-260628",
      storageReady: true,
    });
    expect(calls).toEqual([["resolve-config"], ["storage-ready"]]);
  });

  test("requires an explicit absolute new WebP output for paid execution", () => {
    expect(parseCustomerRenderingArkSmokeArgs([])).toEqual({ execute: false });
    expect(() => parseCustomerRenderingArkSmokeArgs(["--execute"]))
      .toThrow("真实验证必须指定绝对 WebP 输出路径");
    expect(() => parseCustomerRenderingArkSmokeArgs(["--execute", "--output=relative.webp"]))
      .toThrow("真实验证必须指定绝对 WebP 输出路径");
    expect(() => parseCustomerRenderingArkSmokeArgs(["--execute", "--output=/tmp/result.png"]))
      .toThrow("真实验证必须指定绝对 WebP 输出路径");
    expect(parseCustomerRenderingArkSmokeArgs(["--execute", "--output=/tmp/result.webp"]))
      .toEqual({ execute: true, outputPath: "/tmp/result.webp" });
  });

  test("runs dual-image generation, verifies private storage and cleans all temporary objects", async () => {
    const { dependencies, calls } = fixture();

    const result = await runCustomerRenderingArkSmoke({
      execute: true,
      outputPath: "/tmp/customer-rendering-smoke.webp",
    }, dependencies);

    expect(calls.map(([name, detail]) => detail === undefined ? name : [name, detail])).toEqual([
      "resolve-config",
      "storage-ready",
      ["read", "room"],
      ["read", "style"],
      ["put", "room"],
      ["put", "style"],
      ["sign", "room"],
      ["sign", "style"],
      ["generate", expect.any(Object)],
      "download",
      "normalize",
      ["put", "result"],
      ["verify", "result"],
      ["write", expect.objectContaining({ path: "/tmp/customer-rendering-smoke.webp" })],
      ["remove", "result"],
      ["remove", "style"],
      ["remove", "room"],
    ]);
    expect(result).toMatchObject({
      executed: true,
      requestId: "req-safe-1",
      width: 2048,
      height: 1152,
      outputPath: "/tmp/customer-rendering-smoke.webp",
      cleanupCount: 3,
      usage: { generated_images: 1, output_tokens: 1200, total_tokens: 1200 },
    });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(imageConfig.apiKey);
    expect(serialized).not.toContain("X-Tos-Signature");
    expect(serialized).not.toContain("q-signature");
  });

  test("cleans uploaded inputs when Ark rejects the paid request", async () => {
    const { dependencies, calls } = fixture();
    dependencies.generate = mock(async () => {
      throw Errors.business(502, "效果图服务拒绝了请求", "ARK_UPSTREAM_REJECTED");
    });

    await expect(runCustomerRenderingArkSmoke({
      execute: true,
      outputPath: "/tmp/customer-rendering-smoke.webp",
    }, dependencies)).rejects.toMatchObject({ code: "ARK_UPSTREAM_REJECTED" });
    expect(calls.slice(-2)).toEqual([["remove", "style"], ["remove", "room"]]);
  });
});
