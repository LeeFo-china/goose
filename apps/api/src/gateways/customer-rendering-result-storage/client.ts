import { createHash } from 'node:crypto';
import COS from 'cos-nodejs-sdk-v5';
import { z } from 'zod';
import { RENDERING_UPLOAD_MAX_BYTES } from '@gooes/domain';
import { Errors } from '@/errors/error-factory';
import type { RenderingStorageConfig, RenderingStorageLocation } from '@/gateways/rendering-library-storage/client';
import { validateCosSignedReadUrl } from '@/gateways/rendering-library-storage/signed-read-url';

export interface CustomerRenderingResultCosPort {
  putObject(params: COS.PutObjectParams): Promise<unknown>;
  headObject(params: COS.HeadObjectParams): Promise<COS.HeadObjectResult>;
  getObjectUrl(params: COS.GetObjectUrlParams): string;
}

export interface CustomerRenderingResultEvidence {
  sizeBytes: number;
  sha256: string;
}

export interface StoredCustomerRenderingResult extends CustomerRenderingResultEvidence {
  location: RenderingStorageLocation;
}

export type CustomerRenderingResultInspection = 'matching' | 'missing' | 'mismatch';

export interface CustomerRenderingResultStoragePort {
  location(tenantId: string, jobId: string, attemptId: string): Promise<RenderingStorageLocation>;
  put(tenantId: string, jobId: string, attemptId: string,
    location: RenderingStorageLocation, bytes: Buffer): Promise<StoredCustomerRenderingResult>;
  inspect(tenantId: string, jobId: string, attemptId: string,
    location: RenderingStorageLocation, expected: CustomerRenderingResultEvidence): Promise<CustomerRenderingResultInspection>;
  signResultRead(tenantId: string, jobId: string, attemptId: string,
    location: RenderingStorageLocation): Promise<{ url: string; expiresAt: string }>;
}

interface Dependencies {
  loadConfig: () => Promise<RenderingStorageConfig>;
  createCos?: (options: COS.COSOptions) => CustomerRenderingResultCosPort;
}

const IdSchema = z.uuid();
const ConfigSchema = z.strictObject({
  bucket: z.string().max(63).regex(/^[a-z0-9][a-z0-9-]*-\d+$/),
  region: z.string().max(63).regex(/^[a-z]+(?:-[a-z0-9]+)+$/),
  secretId: z.string().trim().min(1),
  secretKey: z.string().trim().min(1),
  publicBaseUrl: z.string().optional(),
});
const LocationSchema = z.strictObject({
  bucket: ConfigSchema.shape.bucket,
  region: ConfigSchema.shape.region,
  object_key: z.string(),
});
const EvidenceSchema = z.strictObject({
  sizeBytes: z.number().int().min(1).max(RENDERING_UPLOAD_MAX_BYTES),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
});
const SIGNED_READ_TTL_SECONDS = 600;

function unavailable(): never {
  throw Errors.business(503, '客户生图结果存储暂不可用', 'RENDERING_RESULT_STORAGE_UNAVAILABLE');
}

function failed(): never {
  throw Errors.business(502, '客户生图结果存储操作失败', 'RENDERING_RESULT_STORAGE_FAILED');
}

function unknownWrite(): never {
  throw Errors.business(502, '客户生图结果写入状态未知', 'RENDERING_RESULT_STORAGE_UNKNOWN');
}

function conflict(): never {
  throw Errors.business(409, '客户生图结果与已存对象不一致', 'RENDERING_RESULT_STORAGE_CONFLICT');
}

function objectKey(tenantId: string, jobId: string, attemptId: string): string {
  if (![tenantId, jobId, attemptId].every((id) => IdSchema.safeParse(id).success)) return unavailable();
  return `private/customer-rendering-results/${tenantId}/${jobId}/${attemptId}/result.webp`;
}

function assertLocation(tenantId: string, jobId: string, attemptId: string,
  location: RenderingStorageLocation): void {
  const parsed = LocationSchema.safeParse(location);
  if (!parsed.success || location.object_key !== objectKey(tenantId, jobId, attemptId)) unavailable();
}

function assertWebp(bytes: Buffer): void {
  if (!Buffer.isBuffer(bytes) || bytes.length < 12 || bytes.length > RENDERING_UPLOAD_MAX_BYTES
    || bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WEBP') unavailable();
}

function isMissing(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  if ('statusCode' in error && error.statusCode === 404) return true;
  return (!('statusCode' in error) || error.statusCode === undefined)
    && 'code' in error && (error.code === 'NoSuchKey' || error.code === 'NotFound');
}

function params(location: RenderingStorageLocation): COS.HeadObjectParams {
  return { Bucket: location.bucket, Region: location.region, Key: location.object_key };
}

async function inspectObject(cos: CustomerRenderingResultCosPort, location: RenderingStorageLocation,
  expected: CustomerRenderingResultEvidence): Promise<CustomerRenderingResultInspection> {
  let result: COS.HeadObjectResult;
  try { result = await cos.headObject(params(location)); }
  catch (error) { if (isMissing(error)) return 'missing'; return failed(); }
  if (result.statusCode !== 200) return failed();
  const headers = result.headers;
  return headers?.['content-length'] === String(expected.sizeBytes)
    && headers?.['content-type'] === 'image/webp'
    && headers?.['x-cos-meta-sha256'] === expected.sha256 ? 'matching' : 'mismatch';
}

export class CustomerRenderingResultStorage implements CustomerRenderingResultStoragePort {
  constructor(private readonly dependencies: Dependencies) {}

  private async config(): Promise<RenderingStorageConfig> {
    try {
      const parsed = ConfigSchema.safeParse(await this.dependencies.loadConfig());
      if (!parsed.success) return unavailable();
      return parsed.data;
    } catch { return unavailable(); }
  }

  private cos(config: RenderingStorageConfig): CustomerRenderingResultCosPort {
    const create = this.dependencies.createCos ?? ((options: COS.COSOptions) => new COS(options));
    return create({ SecretId: config.secretId, SecretKey: config.secretKey,
      Protocol: 'https:', Timeout: 30_000, FollowRedirect: false });
  }

  async location(tenantId: string, jobId: string, attemptId: string): Promise<RenderingStorageLocation> {
    const object_key = objectKey(tenantId, jobId, attemptId);
    const { bucket, region } = await this.config();
    return { bucket, region, object_key };
  }

  async put(tenantId: string, jobId: string, attemptId: string,
    location: RenderingStorageLocation, bytes: Buffer): Promise<StoredCustomerRenderingResult> {
    assertLocation(tenantId, jobId, attemptId, location);
    assertWebp(bytes);
    const evidence = { sizeBytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
    const cos = this.cos(await this.config());
    try {
      await cos.putObject({ ...params(location), Body: bytes, ContentLength: bytes.length,
        ContentType: 'image/webp', ACL: 'private', CacheControl: 'private, no-store',
        Headers: { 'x-cos-forbid-overwrite': 'true', 'x-cos-meta-sha256': evidence.sha256 } });
    } catch {
      // The request may have committed despite a lost response. Never issue a second PUT here.
    }
    let inspection: CustomerRenderingResultInspection;
    try { inspection = await inspectObject(cos, location, evidence); }
    catch { return unknownWrite(); }
    if (inspection === 'mismatch') return conflict();
    if (inspection !== 'matching') return unknownWrite();
    return { location: { ...location }, ...evidence };
  }

  async inspect(tenantId: string, jobId: string, attemptId: string,
    location: RenderingStorageLocation, expected: CustomerRenderingResultEvidence): Promise<CustomerRenderingResultInspection> {
    assertLocation(tenantId, jobId, attemptId, location);
    if (!EvidenceSchema.safeParse(expected).success) return unavailable();
    return inspectObject(this.cos(await this.config()), location, expected);
  }

  async signResultRead(tenantId: string, jobId: string, attemptId: string,
    location: RenderingStorageLocation): Promise<{ url: string; expiresAt: string }> {
    assertLocation(tenantId, jobId, attemptId, location);
    const config = await this.config();
    try {
      const signed = this.cos(config).getObjectUrl({ ...params(location), Sign: true,
        Method: 'GET', Expires: SIGNED_READ_TTL_SECONDS, Protocol: 'https:' });
      return validateCosSignedReadUrl(signed, location, config.secretId, SIGNED_READ_TTL_SECONDS) ?? failed();
    } catch { return failed(); }
  }
}
