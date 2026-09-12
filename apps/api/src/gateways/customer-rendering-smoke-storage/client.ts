import COS from "cos-nodejs-sdk-v5";
import { z } from "zod";
import { Errors } from "@/errors/error-factory";
import type {
  RenderingStorageConfig,
  RenderingStorageLocation,
} from "@/gateways/rendering-library-storage/client";

export type CustomerRenderingSmokeSlot = "room" | "style" | "result";

export interface CustomerRenderingSmokeCosPort {
  putObject(params: COS.PutObjectParams): Promise<unknown>;
  getObjectUrl(params: COS.GetObjectUrlParams): string;
  headObject(params: COS.HeadObjectParams): Promise<COS.HeadObjectResult>;
  deleteObject(params: COS.DeleteObjectParams): Promise<unknown>;
}

interface Dependencies {
  loadConfig: () => Promise<RenderingStorageConfig>;
  createCos?: (options: COS.COSOptions) => CustomerRenderingSmokeCosPort;
}

const ConfigSchema = z.strictObject({
  bucket: z.string().regex(/^[a-z0-9-]+-\d+$/),
  region: z.string().max(63).regex(/^[a-z]+(?:-[a-z0-9]+)+$/),
  secretId: z.string().trim().min(1),
  secretKey: z.string().trim().min(1),
  // Shared config also serves public copies; smoke objects always remain private.
  publicBaseUrl: z.string().optional(),
});
const RunIdSchema = z.uuid();
const MAX_BYTES = 10 * 1024 * 1024;
const SIGNED_URL_TTL_SECONDS = 600;

function unavailable(): never {
  throw Errors.business(
    503,
    "装修生图临时存储暂不可用",
    "RENDERING_SMOKE_STORAGE_UNAVAILABLE",
  );
}

function failed(): never {
  throw Errors.business(
    502,
    "装修生图临时存储操作失败",
    "RENDERING_SMOKE_STORAGE_FAILED",
  );
}

function slotMetadata(slot: CustomerRenderingSmokeSlot): {
  extension: "png" | "webp";
  mimeType: "image/png" | "image/webp";
} {
  return slot === "result"
    ? { extension: "webp", mimeType: "image/webp" }
    : { extension: "png", mimeType: "image/png" };
}

export class CustomerRenderingSmokeStorage {
  constructor(private readonly dependencies: Dependencies) {}

  private async config(): Promise<RenderingStorageConfig> {
    try {
      const parsed = ConfigSchema.safeParse(await this.dependencies.loadConfig());
      if (!parsed.success) return unavailable();
      return parsed.data;
    } catch {
      return unavailable();
    }
  }

  private objectKey(runId: string, slot: CustomerRenderingSmokeSlot): string {
    if (!RunIdSchema.safeParse(runId).success) return unavailable();
    const { extension } = slotMetadata(slot);
    return `private/customer-rendering-smoke/${runId}/${slot}.${extension}`;
  }

  private assertLocation(
    config: RenderingStorageConfig,
    runId: string,
    slot: CustomerRenderingSmokeSlot,
    location: RenderingStorageLocation,
  ): void {
    if (location.bucket !== config.bucket || location.region !== config.region
      || location.object_key !== this.objectKey(runId, slot)) {
      return unavailable();
    }
  }

  private cos(config: RenderingStorageConfig): CustomerRenderingSmokeCosPort {
    const create = this.dependencies.createCos
      ?? ((options: COS.COSOptions) => new COS(options));
    return create({
      SecretId: config.secretId,
      SecretKey: config.secretKey,
      Protocol: "https:",
      Timeout: 30_000,
      FollowRedirect: false,
    });
  }

  async put(
    runId: string,
    slot: CustomerRenderingSmokeSlot,
    bytes: Buffer,
    mimeType: string,
  ): Promise<RenderingStorageLocation> {
    const config = await this.config();
    const metadata = slotMetadata(slot);
    if (!bytes.length || bytes.length > MAX_BYTES || mimeType !== metadata.mimeType) {
      return unavailable();
    }
    const location = {
      bucket: config.bucket,
      region: config.region,
      object_key: this.objectKey(runId, slot),
    };
    try {
      await this.cos(config).putObject({
        Bucket: location.bucket,
        Region: location.region,
        Key: location.object_key,
        Body: bytes,
        ContentLength: bytes.length,
        ContentType: metadata.mimeType,
        ACL: "private",
        CacheControl: "private, no-store",
      });
      return location;
    } catch {
      return failed();
    }
  }

  async sign(
    runId: string,
    slot: CustomerRenderingSmokeSlot,
    location: RenderingStorageLocation,
  ): Promise<string> {
    const config = await this.config();
    this.assertLocation(config, runId, slot, location);
    try {
      const signed = this.cos(config).getObjectUrl({
        Bucket: location.bucket,
        Region: location.region,
        Key: location.object_key,
        Sign: true,
        Method: "GET",
        Expires: SIGNED_URL_TTL_SECONDS,
        Protocol: "https:",
      });
      const url = new URL(signed);
      if (url.protocol !== "https:" || url.username || url.password
        || url.host !== `${location.bucket}.cos.${location.region}.myqcloud.com`
        || url.pathname !== `/${location.object_key}` || url.hash
        || !url.searchParams.get("q-signature")) return failed();
      return signed;
    } catch {
      return failed();
    }
  }

  async verify(
    runId: string,
    slot: CustomerRenderingSmokeSlot,
    location: RenderingStorageLocation,
    expectedBytes: number,
  ): Promise<void> {
    const config = await this.config();
    this.assertLocation(config, runId, slot, location);
    if (!Number.isSafeInteger(expectedBytes) || expectedBytes < 1 || expectedBytes > MAX_BYTES) {
      return unavailable();
    }
    try {
      const result = await this.cos(config).headObject({
        Bucket: location.bucket,
        Region: location.region,
        Key: location.object_key,
      });
      if (Number(result.headers?.["content-length"]) !== expectedBytes) return failed();
    } catch {
      return failed();
    }
  }

  async remove(
    runId: string,
    slot: CustomerRenderingSmokeSlot,
    location: RenderingStorageLocation,
  ): Promise<void> {
    const config = await this.config();
    this.assertLocation(config, runId, slot, location);
    try {
      await this.cos(config).deleteObject({
        Bucket: location.bucket,
        Region: location.region,
        Key: location.object_key,
      });
    } catch {
      return failed();
    }
  }
}
