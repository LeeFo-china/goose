import COS from 'cos-nodejs-sdk-v5';
import { createHash } from 'node:crypto';
import { Writable } from 'node:stream';
import { finished } from 'node:stream/promises';
import { z } from 'zod';
import { RENDERING_UPLOAD_MAX_BYTES, RenderingLibraryBatchPreviewSchema } from '@gooes/domain';
import { Errors } from '@/errors/error-factory';

export interface RenderingStorageLocation { bucket: string; region: string; object_key: string }
export interface RenderingStorageConfig { bucket: string; region: string; secretId: string; secretKey: string; publicBaseUrl?: string }
export interface RenderingPublicCopyInput {
  tenantId: string;
  styleId: string;
  sourceFileId: string;
  targetVersion: number;
  sourceChecksum: string;
  sourceSizeBytes: number;
  sourceLocation: RenderingStorageLocation;
  publicLocation: RenderingStorageLocation;
}
export interface RenderingStorageSettings {
  getString(key: string): Promise<string>;
  getSecretString(key: string): Promise<string>;
}
export interface RenderingCosPort {
  putObject(params: COS.PutObjectParams): Promise<unknown>;
  getObject(params: COS.GetObjectParams): Promise<COS.GetObjectResult>;
  headObject(params: COS.HeadObjectParams): Promise<COS.HeadObjectResult>;
  getObjectUrl(params: COS.GetObjectUrlParams): string;
}
interface Dependencies {
  loadConfig: () => Promise<RenderingStorageConfig>;
  createCos?: (options: COS.COSOptions) => RenderingCosPort;
}
const ConfigSchema = z.strictObject({
  bucket: z.string().regex(/^[a-z0-9-]+-\d+$/),
  region: z.string().max(63).regex(/^[a-z]+(?:-[a-z0-9]+)+$/),
  secretId: z.string().refine((value) => value.trim().length > 0),
  secretKey: z.string().refine((value) => value.trim().length > 0),
  publicBaseUrl: z.string().optional(),
});
const IdSchema = z.uuid();
const LocationSchema = z.strictObject({ bucket: z.string(), region: z.string(), object_key: z.string() });
const PublicCopySchema = z.strictObject({
  tenantId: IdSchema, styleId: IdSchema, sourceFileId: IdSchema,
  targetVersion: z.number().int().positive().max(2147483647),
  sourceChecksum: z.string().regex(/^[a-f0-9]{64}$/),
  sourceSizeBytes: z.number().int().positive().max(RENDERING_UPLOAD_MAX_BYTES),
  sourceLocation: LocationSchema, publicLocation: LocationSchema,
});
export const RENDERING_PREVIEW_TTL_SECONDS = 120;

function unavailable(): never {
  throw Errors.business(503, '装修效果素材存储暂不可用', 'RENDERING_STORAGE_UNAVAILABLE');
}
function failed(): never {
  throw Errors.business(502, '装修效果素材存储操作失败', 'RENDERING_STORAGE_FAILED');
}
function parseConfig(input: unknown): RenderingStorageConfig {
  const parsed = ConfigSchema.safeParse(input);
  if (!parsed.success) return unavailable();
  const config = parsed.data;
  const base = config.publicBaseUrl || `https://${config.bucket}.cos.${config.region}.myqcloud.com/`;
  try {
    // Check the raw form too: URL parsing otherwise silently removes dot paths and whitespace.
    if (!/^https:\/\/[A-Za-z0-9.-]+(?::\d{1,5})?\/?$/.test(base)) return unavailable();
    const url = new URL(base);
    if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) return unavailable();
    return { ...config, publicBaseUrl: url.href };
  } catch { return unavailable(); }
}

export async function loadRenderingStorageConfig(settings: RenderingStorageSettings): Promise<RenderingStorageConfig> {
  try {
    if (await settings.getString('PLATFORM_STORAGE_PROVIDER') !== 'tencent_cos') return unavailable();
    const [bucket, region, secretId, secretKey, publicBaseUrl] = await Promise.all([
      settings.getString('PLATFORM_COS_BUCKET'), settings.getString('PLATFORM_COS_REGION'),
      settings.getSecretString('TENCENT_COS_SECRET_ID'), settings.getSecretString('TENCENT_COS_SECRET_KEY'),
      settings.getString('PLATFORM_COS_PUBLIC_BASE_URL'),
    ]);
    return parseConfig({ bucket, region, secretId, secretKey, publicBaseUrl });
  } catch { return unavailable(); }
}

export class RenderingLibraryStorage {
  constructor(private readonly dependencies: Dependencies) {}

  private async config(): Promise<RenderingStorageConfig> {
    try { return parseConfig(await this.dependencies.loadConfig()); }
    catch { return unavailable(); }
  }

  private objectKey(tenantId: string, id: string): string {
    if (!IdSchema.safeParse(tenantId).success || !IdSchema.safeParse(id).success) return unavailable();
    return `private/renovation-styles/${tenantId}/${id}.webp`;
  }

  async location(tenantId: string, id: string): Promise<RenderingStorageLocation> {
    const object_key = this.objectKey(tenantId, id);
    const { bucket, region } = await this.config();
    return { bucket, region, object_key };
  }

  private async verifiedConfig(tenantId: string, id: string, location: RenderingStorageLocation): Promise<RenderingStorageConfig> {
    const config = await this.config();
    this.assertLocation(config, tenantId, id, location);
    return config;
  }

  private assertLocation(config: RenderingStorageConfig, tenantId: string, id: string, location: RenderingStorageLocation): void {
    if (location.object_key !== this.objectKey(tenantId, id) || location.bucket !== config.bucket || location.region !== config.region) {
      return unavailable();
    }
  }

  private cos(config: RenderingStorageConfig): RenderingCosPort {
    const create = this.dependencies.createCos ?? ((options: COS.COSOptions) => new COS(options));
    return create({ SecretId: config.secretId, SecretKey: config.secretKey,
      Protocol: 'https:', Timeout: 30000, FollowRedirect: false });
  }

  async put(tenantId: string, id: string, location: RenderingStorageLocation, bytes: Buffer): Promise<void> {
    const config = await this.verifiedConfig(tenantId, id, location);
    if (bytes.length === 0 || bytes.length > RENDERING_UPLOAD_MAX_BYTES) return unavailable();
    try {
      await this.cos(config).putObject({ Bucket: location.bucket, Region: location.region, Key: location.object_key,
        Body: bytes, ContentLength: bytes.length, ContentType: 'image/webp', ACL: 'private', CacheControl: 'private, no-store' });
    } catch { return failed(); }
  }

  private async verifiedPublicCopy(input: RenderingPublicCopyInput): Promise<{ config: RenderingStorageConfig; publicUrl: string }> {
    if (!PublicCopySchema.safeParse(input).success) return unavailable();
    const config = await this.verifiedConfig(input.tenantId, input.sourceFileId, input.sourceLocation);
    const target = input.publicLocation;
    const expectedKey = `public/renovation-styles/${input.tenantId}/${input.styleId}/${input.targetVersion}.webp`;
    if (target.bucket !== config.bucket || target.region !== config.region || target.object_key !== expectedKey
      || target.object_key === input.sourceLocation.object_key) return unavailable();
    try {
      const base = new URL(config.publicBaseUrl ?? unavailable());
      const url = new URL(target.object_key.split('/').map(encodeURIComponent).join('/'), base);
      if (url.protocol !== 'https:' || url.origin !== base.origin || url.username || url.password || url.search || url.hash
        || url.href.length > 2048 || decodeURIComponent(url.pathname) !== `/${target.object_key}`) return unavailable();
      return { config, publicUrl: url.href };
    } catch { return unavailable(); }
  }

  async resolvePublicUrl(input: RenderingPublicCopyInput): Promise<string> {
    return (await this.verifiedPublicCopy(input)).publicUrl;
  }

  private async readPublicSource(cos: RenderingCosPort, input: RenderingPublicCopyInput): Promise<Buffer> {
    const bytes = Buffer.alloc(input.sourceSizeBytes);
    let received = 0;
    const streamError = () => Errors.business(502, '装修效果素材存储操作失败', 'RENDERING_STORAGE_FAILED');
    const output = new Writable({
      highWaterMark: Math.min(input.sourceSizeBytes, 64 * 1024),
      write(chunk: Buffer, _encoding, callback) {
        if (!Buffer.isBuffer(chunk) || chunk.length > bytes.length - received) return callback(streamError());
        chunk.copy(bytes, received);
        received += chunk.length;
        callback();
      },
      final(callback) { callback(received === bytes.length ? undefined : streamError()); },
    });
    const source = input.sourceLocation;
    try {
      // SDK 2.15.4 aborts its request on Output error and waits for finish before resolving.
      // Keep finished's error listener: the SDK may re-emit the same error during callback cleanup.
      await Promise.all([finished(output), Promise.resolve().then(() => cos.getObject({
        Bucket: source.bucket, Region: source.region, Key: source.object_key, Output: output,
      }))]);
      return bytes;
    } catch {
      output.destroy();
      return failed();
    }
  }

  async copyPublic(input: RenderingPublicCopyInput): Promise<{ publicUrl: string }> {
    const { config, publicUrl } = await this.verifiedPublicCopy(input);
    let cos: RenderingCosPort;
    let bytes: Buffer;
    try {
      cos = this.cos(config);
      bytes = await this.readPublicSource(cos, input);
      if (!Buffer.isBuffer(bytes) || bytes.length === 0 || bytes.length > RENDERING_UPLOAD_MAX_BYTES
        || bytes.length !== input.sourceSizeBytes || createHash('sha256').update(bytes).digest('hex') !== input.sourceChecksum) return failed();
    } catch { return failed(); }
    try {
      const target = input.publicLocation;
      await cos.putObject({ Bucket: target.bucket, Region: target.region, Key: target.object_key, Body: bytes,
        ContentLength: bytes.length, ContentType: 'image/webp', ACL: 'public-read',
        CacheControl: 'public, max-age=31536000, immutable', 'x-cos-meta-source-sha256': input.sourceChecksum });
      return { publicUrl };
    } catch {
      // COS may have committed the object even when the PUT response is lost. Recover using HEAD under a new lease.
      throw Errors.business(502, '装修效果素材公开副本写入结果未知', 'RENDERING_STORAGE_PUBLIC_COPY_UNKNOWN');
    }
  }

  async hasPublicCopy(input: RenderingPublicCopyInput): Promise<boolean> {
    const { config } = await this.verifiedPublicCopy(input);
    try {
      const target = input.publicLocation;
      const { headers } = await this.cos(config).headObject({ Bucket: target.bucket, Region: target.region, Key: target.object_key });
      return headers?.['content-length'] === String(input.sourceSizeBytes)
        && headers?.['content-type'] === 'image/webp'
        && headers?.['x-cos-meta-source-sha256'] === input.sourceChecksum;
    } catch (error: unknown) {
      if (typeof error === 'object' && error !== null) {
        if ('statusCode' in error && error.statusCode === 404) return false;
        if ((!('statusCode' in error) || error.statusCode === undefined) && 'code' in error
          && (error.code === 'NoSuchKey' || error.code === 'NotFound')) return false;
      }
      return failed();
    }
  }

  async preview(tenantId: string, id: string, location: RenderingStorageLocation): Promise<string> {
    const config = await this.verifiedConfig(tenantId, id, location);
    try { return this.signPreview(this.cos(config), location); }
    catch { return failed(); }
  }

  async previews(tenantId: string, files: { id: string; location: RenderingStorageLocation }[]): Promise<string[]> {
    if (!IdSchema.safeParse(tenantId).success
      || !RenderingLibraryBatchPreviewSchema.safeParse({ file_ids: files.map((file) => file.id) }).success) return unavailable();
    const config = await this.config();
    for (const file of files) this.assertLocation(config, tenantId, file.id, file.location);
    try {
      const cos = this.cos(config);
      return files.map((file) => this.signPreview(cos, file.location));
    } catch { return failed(); }
  }

  private signPreview(cos: RenderingCosPort, location: RenderingStorageLocation): string {
    try {
      const signed = cos.getObjectUrl({ Bucket: location.bucket, Region: location.region,
        Key: location.object_key, Sign: true, Method: 'GET', Expires: RENDERING_PREVIEW_TTL_SECONDS, Protocol: 'https:' });
      const url = new URL(signed);
      if (url.protocol !== 'https:' || url.username || url.password
        || url.host !== `${location.bucket}.cos.${location.region}.myqcloud.com`
        || url.pathname !== `/${location.object_key}` || url.hash
        || url.searchParams.get('q-sign-algorithm') !== 'sha1' || !url.searchParams.get('q-signature')) return failed();
      return signed;
    } catch { return failed(); }
  }
}
