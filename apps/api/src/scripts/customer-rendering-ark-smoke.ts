import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { extname, isAbsolute, resolve } from "node:path";
import { Errors } from "@/errors/error-factory";
import type { ArkUsage, DownloadedArkImage } from "@/gateways/ark-rendering";
import type { CustomerRenderingSmokeSlot } from "@/gateways/customer-rendering-smoke-storage/client";
import type { RenderingStorageLocation } from "@/gateways/rendering-library-storage/client";
import type { AiGatewayResolvedImageConfig } from "@/services/ai-gateway-types";

const SCENE_CODE = "decoration_raw_drawing";
const PROMPT = [
  "将图1中的未装修空间改造成现代简约风格住宅效果图。",
  "严格保留图1的门窗位置、墙体、梁柱、空间尺度和原始拍摄视角，移除画面中的人物和施工杂物。",
  "参考图2的暖白、浅木色与深色金属点缀，加入简洁耐用的客厅家具和柔和自然光。",
  "不要改变房间结构，不增加不存在的门窗，不生成文字或品牌标识。",
].join("");

export interface CustomerRenderingArkSmokeOptions {
  execute: boolean;
  outputPath?: string;
}

interface NormalizedSmokeImage {
  bytes: Buffer;
  width: number;
  height: number;
}

interface SmokeStoragePort {
  put(
    runId: string,
    slot: CustomerRenderingSmokeSlot,
    bytes: Buffer,
    mimeType: string,
  ): Promise<RenderingStorageLocation>;
  sign(
    runId: string,
    slot: CustomerRenderingSmokeSlot,
    location: RenderingStorageLocation,
  ): Promise<string>;
  verify(
    runId: string,
    slot: CustomerRenderingSmokeSlot,
    location: RenderingStorageLocation,
    expectedBytes: number,
  ): Promise<void>;
  remove(
    runId: string,
    slot: CustomerRenderingSmokeSlot,
    location: RenderingStorageLocation,
  ): Promise<void>;
}

export interface CustomerRenderingArkSmokeDependencies {
  resolveImageConfig(): Promise<AiGatewayResolvedImageConfig>;
  assertStorageReady(): Promise<void>;
  readFixture(slot: "room" | "style"): Promise<Buffer>;
  storage: SmokeStoragePort;
  generate(
    config: { baseUrl: string; apiKey: string; model: string; timeoutMs: number },
    input: {
      roomImageUrl: string;
      referenceImageUrl: string;
      prompt: string;
      size: "2K";
    },
  ): Promise<{
    imageUrl: string;
    requestId?: string;
    usage?: ArkUsage;
  }>;
  download(url: string): Promise<DownloadedArkImage>;
  normalize(input: DownloadedArkImage): Promise<NormalizedSmokeImage>;
  writeOutput(path: string, bytes: Buffer): Promise<void>;
  outputExists(path: string): boolean;
  randomUuid(): string;
  now(): number;
}

export type CustomerRenderingArkSmokeResult = {
  executed: false;
  sceneCode: string;
  providerCode: string;
  modelCode: string;
  modelName: string;
  storageReady: true;
} | {
  executed: true;
  sceneCode: string;
  providerCode: string;
  modelCode: string;
  modelName: string;
  requestId: string | null;
  usage: ArkUsage;
  width: number;
  height: number;
  bytes: number;
  sha256: string;
  durationMs: number;
  outputPath: string;
  cleanupCount: number;
};

function invalidOutputPath(): never {
  throw Errors.badRequest("真实验证必须指定绝对 WebP 输出路径");
}

export function parseCustomerRenderingArkSmokeArgs(
  args: string[],
): CustomerRenderingArkSmokeOptions {
  const execute = args.includes("--execute");
  const outputArg = args.find((arg) => arg.startsWith("--output="));
  const unknown = args.find((arg) => arg !== "--execute" && !arg.startsWith("--output="));
  if (unknown) throw Errors.badRequest("装修生图验证参数无效");
  if (!execute) {
    if (outputArg) throw Errors.badRequest("预检模式不能指定输出文件");
    return { execute: false };
  }
  const outputPath = outputArg?.slice("--output=".length);
  if (!outputPath || !isAbsolute(outputPath) || extname(outputPath).toLowerCase() !== ".webp") {
    return invalidOutputPath();
  }
  return { execute: true, outputPath };
}

export async function runCustomerRenderingArkSmoke(
  options: CustomerRenderingArkSmokeOptions,
  dependencies: CustomerRenderingArkSmokeDependencies,
): Promise<CustomerRenderingArkSmokeResult> {
  const config = await dependencies.resolveImageConfig();
  await dependencies.assertStorageReady();
  const summary = {
    sceneCode: SCENE_CODE,
    providerCode: config.providerCode,
    modelCode: config.modelCode,
    modelName: config.modelName,
  };
  if (!options.execute) {
    return { executed: false, ...summary, storageReady: true };
  }
  const outputPath = options.outputPath;
  if (!outputPath || dependencies.outputExists(outputPath)) return invalidOutputPath();

  const runId = dependencies.randomUuid();
  const startedAt = dependencies.now();
  const created: Array<{
    slot: CustomerRenderingSmokeSlot;
    location: RenderingStorageLocation;
  }> = [];
  let result: CustomerRenderingArkSmokeResult | undefined;
  let operationError: unknown;
  try {
    const [roomBytes, styleBytes] = await Promise.all([
      dependencies.readFixture("room"),
      dependencies.readFixture("style"),
    ]);
    const roomLocation = await dependencies.storage.put(runId, "room", roomBytes, "image/png");
    created.push({ slot: "room", location: roomLocation });
    const styleLocation = await dependencies.storage.put(runId, "style", styleBytes, "image/png");
    created.push({ slot: "style", location: styleLocation });
    const roomImageUrl = await dependencies.storage.sign(runId, "room", roomLocation);
    const referenceImageUrl = await dependencies.storage.sign(runId, "style", styleLocation);
    const generated = await dependencies.generate({
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      model: config.modelName,
      timeoutMs: config.timeoutMs,
    }, {
      roomImageUrl,
      referenceImageUrl,
      prompt: PROMPT,
      size: "2K",
    });
    const downloaded = await dependencies.download(generated.imageUrl);
    const normalized = await dependencies.normalize(downloaded);
    const resultLocation = await dependencies.storage.put(
      runId,
      "result",
      normalized.bytes,
      "image/webp",
    );
    created.push({ slot: "result", location: resultLocation });
    await dependencies.storage.verify(
      runId,
      "result",
      resultLocation,
      normalized.bytes.length,
    );
    await dependencies.writeOutput(outputPath, normalized.bytes);
    result = {
      executed: true,
      ...summary,
      requestId: generated.requestId ?? null,
      usage: generated.usage ?? {},
      width: normalized.width,
      height: normalized.height,
      bytes: normalized.bytes.length,
      sha256: createHash("sha256").update(normalized.bytes).digest("hex"),
      durationMs: Math.max(0, dependencies.now() - startedAt),
      outputPath,
      cleanupCount: created.length,
    };
  } catch (error) {
    operationError = error;
  }

  let cleanupError: unknown;
  for (const item of created.reverse()) {
    try {
      await dependencies.storage.remove(runId, item.slot, item.location);
    } catch (error) {
      cleanupError ??= error;
    }
  }
  if (operationError) throw operationError;
  if (cleanupError) throw cleanupError;
  if (!result) throw Errors.business(500, "装修生图验证结果缺失", "RENDERING_SMOKE_RESULT_MISSING");
  return result;
}

async function runtimeDependencies(): Promise<CustomerRenderingArkSmokeDependencies> {
  const [
    { aiGateway },
    { generateArkRendering, downloadArkRenderingResult },
    { CustomerRenderingSmokeStorage },
    { loadRenderingStorageConfig },
    { systemSettingsService },
    { normalizeRenderingSource },
  ] = await Promise.all([
    import("@/services/ai-gateway"),
    import("@/gateways/ark-rendering"),
    import("@/gateways/customer-rendering-smoke-storage/client"),
    import("@/gateways/rendering-library-storage/client"),
    import("@/services/system-settings"),
    import("@/services/rendering-library-files/image"),
  ]);
  let storageConfig: Awaited<ReturnType<typeof loadRenderingStorageConfig>> | null = null;
  const ensureStorageConfig = async () => {
    storageConfig ??= await loadRenderingStorageConfig(systemSettingsService);
    return storageConfig;
  };
  const storage = new CustomerRenderingSmokeStorage({ loadConfig: ensureStorageConfig });
  const fixturePaths = {
    room: resolve(import.meta.dir, "../../../web/public/partner-hero-construction-team.png"),
    style: resolve(import.meta.dir, "../../../admin/public/partner-hero-renovation.png"),
  } as const;

  return {
    resolveImageConfig: () => aiGateway.resolveImageConfig({ sceneCode: SCENE_CODE }),
    assertStorageReady: async () => { await ensureStorageConfig(); },
    readFixture: async (slot) => {
      try {
        const file = Bun.file(fixturePaths[slot]);
        if (!await file.exists()) throw new Error("missing fixture");
        return Buffer.from(await file.arrayBuffer());
      } catch {
        throw Errors.business(500, "装修生图验证图片不可用", "RENDERING_SMOKE_FIXTURE_UNAVAILABLE");
      }
    },
    storage,
    generate: generateArkRendering,
    download: downloadArkRenderingResult,
    normalize: normalizeRenderingSource,
    writeOutput: async (path, bytes) => {
      try { await Bun.write(path, bytes); }
      catch { throw Errors.business(500, "装修生图验证结果写入失败", "RENDERING_SMOKE_OUTPUT_FAILED"); }
    },
    outputExists: existsSync,
    randomUuid: randomUUID,
    now: Date.now,
  };
}

async function main(): Promise<void> {
  try {
    const options = parseCustomerRenderingArkSmokeArgs(process.argv.slice(2));
    const result = await runCustomerRenderingArkSmoke(options, await runtimeDependencies());
    process.stdout.write(`${JSON.stringify({ ok: true, ...result })}\n`);
  } catch (error) {
    const envelope = error && typeof error === "object"
      ? error as { code?: unknown; message?: unknown }
      : {};
    process.stderr.write(`${JSON.stringify({
      ok: false,
      code: typeof envelope.code === "string" ? envelope.code : "RENDERING_SMOKE_FAILED",
      message: typeof envelope.message === "string" ? envelope.message : "装修生图验证失败",
    })}\n`);
    process.exitCode = 1;
  }
}

if (import.meta.main) void main();
