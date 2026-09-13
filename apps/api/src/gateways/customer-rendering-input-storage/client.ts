import COS from 'cos-nodejs-sdk-v5';
import { createHash } from 'node:crypto';
import { Writable } from 'node:stream';
import { finished } from 'node:stream/promises';
import { z } from 'zod';
import { RenderingUploadMimeSchema, RENDERING_UPLOAD_MAX_BYTES } from '@gooes/domain';
import { Errors } from '@/errors/error-factory';
import type { RenderingStorageConfig, RenderingStorageLocation } from '@/gateways/rendering-library-storage/client';

export interface CustomerInputCosPort {
  getAuth(params: COS.GetAuthParams): string;
  headObject(params: COS.HeadObjectParams): Promise<COS.HeadObjectResult>;
  getObject(params: COS.GetObjectParams): Promise<COS.GetObjectResult>;
  putObject(params: COS.PutObjectParams): Promise<unknown>;
  deleteObject(params: COS.DeleteObjectParams): Promise<unknown>;
}
export interface CustomerInputSignedPut {
  location: RenderingStorageLocation;
  uploadUrl: string;
  headers: Record<string, string>;
  expiresAt: string;
}
export interface CustomerInputStoragePort {
  rawObjectKey(tenantId: string, id: string): string;
  normalizedObjectKey(tenantId: string, id: string): string;
  signPut(tenantId: string, id: string, mimeType: string, sizeBytes: number, location?: RenderingStorageLocation): Promise<CustomerInputSignedPut>;
  location(tenantId: string, id: string): Promise<RenderingStorageLocation>;
  readRaw(tenantId: string, id: string, location: RenderingStorageLocation, expectedBytes: number, expectedMime: string): Promise<Buffer>;
  putNormalized(tenantId: string, id: string, location: RenderingStorageLocation, bytes: Buffer): Promise<void>;
  hasNormalized(tenantId: string, id: string, location: RenderingStorageLocation, bytes: Buffer): Promise<boolean>;
  removeRaw(tenantId: string, id: string, location: RenderingStorageLocation): Promise<void>;
}
interface Dependencies {
  loadConfig: () => Promise<RenderingStorageConfig>;
  createCos?: (options: COS.COSOptions) => CustomerInputCosPort;
}
const Bucket = z.string().max(63).regex(/^[a-z0-9][a-z0-9-]*-\d+$/);
const Region = z.string().max(63).regex(/^[a-z]+(?:-[a-z0-9]+)+$/);
const Location = z.strictObject({ bucket: Bucket, region: Region, object_key: z.string() });
const Config = z.object({ bucket: Bucket, region: Region, secretId: z.string().trim().min(1), secretKey: z.string().trim().min(1) });
const Size = z.number().int().positive().max(RENDERING_UPLOAD_MAX_BYTES);
const TTL_SECONDS = 600;
function unavailable(): never { throw Errors.business(503, '私有输入存储暂不可用', 'RENDERING_INPUT_STORAGE_UNAVAILABLE'); }
function failure() { return Errors.business(502, '私有输入存储操作失败', 'RENDERING_INPUT_STORAGE_FAILED'); }
function rejected() { return Errors.business(422, '上传图片内容与声明不符或已不存在', 'RENDERING_IMAGE_REJECTED'); }
function unknownWrite(): never { throw Errors.business(502, '私有输入规范图写入结果未知', 'RENDERING_INPUT_STORAGE_NORMALIZED_UNKNOWN'); }
function params(location: RenderingStorageLocation) { return { Bucket: location.bucket, Region: location.region, Key: location.object_key }; }
function checksum(bytes: Buffer): string { return createHash('sha256').update(bytes).digest('hex'); }
function metadata(result: COS.HeadObjectResult, size: number, mime: string, sha256?: string): boolean {
  return result.statusCode === 200 && result.headers?.['content-length'] === String(size)
    && result.headers?.['content-type'] === mime && (!sha256 || result.headers?.['x-cos-meta-sha256'] === sha256);
}

export class CustomerRenderingInputStorage implements CustomerInputStoragePort {
  constructor(private readonly dependencies: Dependencies) {}

  rawObjectKey(tenantId: string, id: string): string { return `${this.prefix(tenantId, id)}/raw`; }
  normalizedObjectKey(tenantId: string, id: string): string { return `${this.prefix(tenantId, id)}/normalized.webp`; }
  private prefix(tenantId: string, id: string): string {
    if (!z.uuid().safeParse(tenantId).success || !z.uuid().safeParse(id).success) return unavailable();
    return `private/customer-rendering-inputs/${tenantId}/${id}`;
  }
  private assertLocation(location: RenderingStorageLocation, key: string): void {
    if (!Location.safeParse(location).success || location.object_key !== key) unavailable();
  }
  private async config(): Promise<RenderingStorageConfig> {
    try { return Config.parse(await this.dependencies.loadConfig()); } catch { return unavailable(); }
  }
  private cos(config: RenderingStorageConfig): CustomerInputCosPort {
    return (this.dependencies.createCos ?? ((options) => new COS(options)))({ SecretId: config.secretId,
      SecretKey: config.secretKey, Protocol: 'https:', Timeout: 30000, FollowRedirect: false });
  }
  async location(tenantId: string, id: string): Promise<RenderingStorageLocation> {
    const object_key = this.rawObjectKey(tenantId, id);
    const { bucket, region } = await this.config();
    return { bucket, region, object_key };
  }
  async signPut(tenantId: string, id: string, mimeType: string, sizeBytes: number, persisted?: RenderingStorageLocation): Promise<CustomerInputSignedPut> {
    const key = this.rawObjectKey(tenantId, id);
    if (!RenderingUploadMimeSchema.safeParse(mimeType).success || !Size.safeParse(sizeBytes).success) return unavailable();
    const config = await this.config();
    const location = persisted ?? { bucket: config.bucket, region: config.region, object_key: key };
    this.assertLocation(location, key);
    const headers = { 'Content-Type': mimeType, 'Content-Length': String(sizeBytes), 'x-cos-acl': 'private', 'x-cos-forbid-overwrite': 'true' };
    try {
      // SDK 2.15.4 intentionally omits Content-Type from its signing whitelist. HEAD and decoder enforce MIME.
      const auth = this.cos(config).getAuth({ ...params(location), Method: 'PUT', Expires: TTL_SECONDS, Headers: headers, ForceSignHost: true });
      const host = `${location.bucket}.cos.${location.region}.myqcloud.com`;
      const url = new URL(`https://${host}/${key}?${auth}`);
      const query = url.searchParams;
      const times = query.get('q-sign-time')?.split(';').map(Number);
      const start = times?.[0]; const end = times?.[1]; const now = Date.now() / 1000;
      if (url.protocol !== 'https:' || url.host !== host || url.pathname !== `/${key}` || url.username || url.password || url.hash
        || query.get('q-sign-algorithm') !== 'sha1' || !/^[a-f0-9]{40}$/.test(query.get('q-signature') ?? '')
        || query.get('q-header-list') !== 'content-length;host;x-cos-acl;x-cos-forbid-overwrite'
        || query.get('q-key-time') !== query.get('q-sign-time') || times?.length !== 2
        || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start === undefined || end === undefined
        || end - start !== TTL_SECONDS || start > now + 2 || start < now - 5 || end <= now) throw failure();
      return { location: { ...location }, uploadUrl: url.href, headers, expiresAt: new Date(end * 1000).toISOString() };
    } catch { throw failure(); }
  }
  async readRaw(tenantId: string, id: string, location: RenderingStorageLocation, expectedBytes: number, expectedMime: string): Promise<Buffer> {
    this.assertLocation(location, this.rawObjectKey(tenantId, id));
    if (!Size.safeParse(expectedBytes).success || !RenderingUploadMimeSchema.safeParse(expectedMime).success) return unavailable();
    const cos = this.cos(await this.config());
    let head: COS.HeadObjectResult;
    try {
      head = await cos.headObject(params(location));
    } catch (error: unknown) {
      if (typeof error === 'object' && error !== null && 'statusCode' in error && error.statusCode === 404) throw rejected();
      throw failure();
    }
    // A successful metadata response proves a bad upload; transport errors above remain retryable.
    if (!metadata(head, expectedBytes, expectedMime)) throw rejected();
    return this.read(cos, location, expectedBytes);
  }
  private async read(cos: CustomerInputCosPort, location: RenderingStorageLocation, expectedBytes: number): Promise<Buffer> {
    const bytes = Buffer.alloc(expectedBytes); let received = 0;
    const invalidBody = rejected();
    const output = new Writable({ highWaterMark: Math.min(expectedBytes, 64 * 1024),
      write(chunk: Buffer, _encoding, callback) {
        if (!Buffer.isBuffer(chunk) || chunk.length > bytes.length - received) return callback(invalidBody);
        chunk.copy(bytes, received); received += chunk.length; callback();
      }, final(callback) { callback(received === bytes.length ? undefined : invalidBody); },
    });
    try {
      // SDK aborts the HTTP request on Output error; finished keeps an error listener during cleanup.
      await Promise.all([finished(output), Promise.resolve().then(() => cos.getObject({ ...params(location), Output: output }))]);
      return bytes;
    } catch (error: unknown) {
      output.destroy();
      // Only this stream's own length/shape check proves invalid content; network errors stay 502.
      if (error === invalidBody) throw invalidBody;
      throw failure();
    }
  }
  async putNormalized(tenantId: string, id: string, location: RenderingStorageLocation, bytes: Buffer): Promise<void> {
    this.assertLocation(location, this.normalizedObjectKey(tenantId, id));
    if (!Buffer.isBuffer(bytes) || !Size.safeParse(bytes.length).success) return unavailable();
    const cos = this.cos(await this.config());
    try {
      await cos.putObject({ ...params(location), Body: bytes, ContentLength: bytes.length, ContentType: 'image/webp',
        ACL: 'private', CacheControl: 'private, no-store',
        Headers: { 'x-cos-forbid-overwrite': 'true', 'x-cos-meta-sha256': checksum(bytes) } });
      if (!metadata(await cos.headObject(params(location)), bytes.length, 'image/webp', checksum(bytes))) return unknownWrite();
    } catch { return unknownWrite(); }
  }
  async hasNormalized(tenantId: string, id: string, location: RenderingStorageLocation, bytes: Buffer): Promise<boolean> {
    this.assertLocation(location, this.normalizedObjectKey(tenantId, id));
    if (!Buffer.isBuffer(bytes) || !Size.safeParse(bytes.length).success) return unavailable();
    const cos = this.cos(await this.config());
    try { return metadata(await cos.headObject(params(location)), bytes.length, 'image/webp', checksum(bytes)); }
    catch (error: unknown) {
      if (typeof error === 'object' && error !== null && 'statusCode' in error && error.statusCode === 404) return false;
      throw failure();
    }
  }
  async removeRaw(tenantId: string, id: string, location: RenderingStorageLocation): Promise<void> {
    this.assertLocation(location, this.rawObjectKey(tenantId, id));
    const cos = this.cos(await this.config());
    try { await cos.deleteObject(params(location)); } catch { throw failure(); }
  }
}
