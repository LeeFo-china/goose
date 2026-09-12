import COS from 'cos-nodejs-sdk-v5';
import { z } from 'zod';
import { RENDERING_UPLOAD_MAX_BYTES, RenderingLibraryBatchPreviewSchema } from '@gooes/domain';
import { Errors } from '@/errors/error-factory';

export interface RenderingStorageLocation { bucket: string; region: string; object_key: string }
export interface RenderingStorageConfig { bucket: string; region: string; secretId: string; secretKey: string }
export interface RenderingStorageSettings {
  getString(key: string): Promise<string>;
  getSecretString(key: string): Promise<string>;
}
export interface RenderingCosPort {
  putObject(params: COS.PutObjectParams): Promise<unknown>;
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
});
const IdSchema = z.uuid();
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
  return parsed.data;
}

export async function loadRenderingStorageConfig(settings: RenderingStorageSettings): Promise<RenderingStorageConfig> {
  try {
    if (await settings.getString('PLATFORM_STORAGE_PROVIDER') !== 'tencent_cos') return unavailable();
    const [bucket, region, secretId, secretKey] = await Promise.all([
      settings.getString('PLATFORM_COS_BUCKET'), settings.getString('PLATFORM_COS_REGION'),
      settings.getSecretString('TENCENT_COS_SECRET_ID'), settings.getSecretString('TENCENT_COS_SECRET_KEY'),
    ]);
    return parseConfig({ bucket, region, secretId, secretKey });
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
