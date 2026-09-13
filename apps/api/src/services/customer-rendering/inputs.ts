import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  RenderingUploadIntentRequestSchema, RenderingUploadIntentResponseSchema,
  RenderingUploadCompleteResponseSchema, RENDERING_UPLOAD_MAX_BYTES,
} from '@gooes/domain';
import { ErrorCodes } from '@/errors/error-codes';
import { Errors } from '@/errors/error-factory';
import { AppError } from '@/errors/app-error';
import { CustomerRenderingInputStorage, type CustomerInputStoragePort } from '@/gateways/customer-rendering-input-storage/client';
import { loadRenderingStorageConfig } from '@/gateways/rendering-library-storage/client';
import { CustomerRenderingInputsRepository, type CustomerInputOwner,
  type CustomerInputRow, type CustomerRenderingInputsRepositoryPort } from '@/repositories/customer-rendering-inputs';
import { normalizeRenderingSource } from '@/services/rendering-library-files/image';
import { systemSettingsService } from '@/services/system-settings';
import type { JwtPayload } from '@/utils/jwt';
import { customerRenderingContextService, type CustomerRenderingContextService } from './context';
import { getCustomerRenderingIdentityDigestService, type CustomerRenderingIdentityDigestService } from './identity-digest';

type Channel = 'wechat' | 'douyin';
type IntentRequest = z.infer<typeof RenderingUploadIntentRequestSchema>;
type IntentResponse = z.infer<typeof RenderingUploadIntentResponseSchema>;
type CompleteResponse = z.infer<typeof RenderingUploadCompleteResponseSchema>;
type Repository = Pick<CustomerRenderingInputsRepositoryPort,
  'createIssued' | 'findOwned' | 'countRecent' | 'claimProcessing' | 'markNormalized' | 'markFailed'>;
export interface CustomerRenderingInputsPort {
  createIntent(user: JwtPayload | undefined, channel: Channel, request: IntentRequest): Promise<IntentResponse>;
  complete(user: JwtPayload | undefined, channel: Channel, intentId: string): Promise<CompleteResponse>;
}
const INTENT_TTL_MS = 10 * 60_000;
const PROCESSING_LEASE_MS = 2 * 60_000;
const DAY_MS = 24 * 60 * 60_000;
const CHINA_OFFSET_MS = 8 * 60 * 60_000;

export class CustomerRenderingInputsService implements CustomerRenderingInputsPort {
  private readonly contextService: Pick<CustomerRenderingContextService, 'resolveWechat' | 'resolveDouyin'>;
  private readonly digestService: Pick<CustomerRenderingIdentityDigestService, 'subject'>;
  private readonly repository: Repository;
  private readonly storage: CustomerInputStoragePort;
  private readonly normalize: typeof normalizeRenderingSource;

  constructor(dependencies: {
    contextService?: Pick<CustomerRenderingContextService, 'resolveWechat' | 'resolveDouyin'>;
    digestService?: Pick<CustomerRenderingIdentityDigestService, 'subject'>;
    repository?: Repository;
    storage?: CustomerInputStoragePort;
    normalize?: typeof normalizeRenderingSource;
  } = {}) {
    this.contextService = dependencies.contextService ?? customerRenderingContextService;
    this.digestService = dependencies.digestService ?? getCustomerRenderingIdentityDigestService();
    this.repository = dependencies.repository ?? new CustomerRenderingInputsRepository();
    this.storage = dependencies.storage ?? new CustomerRenderingInputStorage({
      loadConfig: () => loadRenderingStorageConfig(systemSettingsService),
    });
    this.normalize = dependencies.normalize ?? normalizeRenderingSource;
  }

  async createIntent(user: JwtPayload | undefined, channel: Channel, request: IntentRequest): Promise<IntentResponse> {
    const owner = await this.owner(user, channel);
    const parsed = RenderingUploadIntentRequestSchema.safeParse(request);
    if (!parsed.success) throw Errors.fromZod(parsed.error);
    const now = Date.now();
    const dayStart = Math.floor((now + CHINA_OFFSET_MS) / DAY_MS) * DAY_MS - CHINA_OFFSET_MS;
    // Best-effort preflight only: count + insert is not atomic across processes.
    // Public/paid launch requires an atomic reservation RPC managed through a migration.
    const [recent, daily] = await Promise.all([
      this.repository.countRecent(owner, new Date(now - INTENT_TTL_MS).toISOString()),
      this.repository.countRecent(owner, new Date(dayStart).toISOString()),
    ]);
    if (recent >= 3 || daily >= 10) {
      throw Errors.business(429, '上传过于频繁，请稍后重试', ErrorCodes.RENDERING_UPLOAD_RATE_LIMITED);
    }
    const id = randomUUID();
    const location = await this.storage.location(owner.tenantId, id);
    const expiresAt = new Date(now + INTENT_TTL_MS).toISOString();
    await this.repository.createIssued(owner, {
      id, purpose: parsed.data.purpose, mimeType: parsed.data.mime_type, sizeBytes: parsed.data.size_bytes,
      bucket: location.bucket, region: location.region, rawObjectKey: location.object_key, expiresAt,
    });
    try {
      const signed = await this.storage.signPut(owner.tenantId, id, parsed.data.mime_type, parsed.data.size_bytes, location);
      const signedExpiry = Date.parse(signed.expiresAt);
      if (signed.location.bucket !== location.bucket || signed.location.region !== location.region
        || signed.location.object_key !== location.object_key || !Number.isFinite(signedExpiry)
        || signedExpiry <= Date.now()) {
        throw Errors.business(502, '上传位置校验失败', 'RENDERING_INPUT_STORAGE_FAILED');
      }
      const response = RenderingUploadIntentResponseSchema.safeParse({
        intent_id: id, method: 'PUT', upload_url: signed.uploadUrl, headers: signed.headers,
        expires_at: new Date(Math.min(Date.parse(expiresAt), signedExpiry)).toISOString(),
      });
      if (!response.success) throw Errors.business(502, '上传签名响应无效', 'RENDERING_INPUT_STORAGE_FAILED');
      return response.data;
    } catch (error) {
      await this.repository.markFailed(owner, id, null, new Date().toISOString());
      throw error;
    }
  }

  async complete(user: JwtPayload | undefined, channel: Channel, intentId: string): Promise<CompleteResponse> {
    const owner = await this.owner(user, channel);
    const parsed = z.uuid('无效的上传意图 ID').safeParse(intentId);
    if (!parsed.success) throw Errors.fromZod(parsed.error);
    const row = await this.repository.findOwned(owner, parsed.data);
    if (!row) throw Errors.business(404, '上传意图不存在', 'RENDERING_INPUT_NOT_FOUND');
    if (row.status === 'pending_review') return completed(row);
    const now = new Date();
    const recovering = row.status === 'processing';
    if (row.raw_deleted_at !== null || (!recovering && row.status !== 'issued')) {
      throw Errors.business(409, '上传意图不可确认', 'RENDERING_INPUT_STATE_CONFLICT');
    }
    if (row.status === 'issued' && Date.parse(row.expires_at) <= now.getTime()) {
      throw Errors.business(409, '上传意图已过期', ErrorCodes.RENDERING_UPLOAD_EXPIRED);
    }
    if (recovering && Date.parse(row.processing_lease_expires_at ?? '') > now.getTime()) throw processing();
    const leaseUntil = new Date(now.getTime() + PROCESSING_LEASE_MS).toISOString();
    if (!await this.repository.claimProcessing(owner, row.id, leaseUntil, now.toISOString())) throw processing();
    return this.process(owner, row, leaseUntil, recovering);
  }

  private async process(owner: CustomerInputOwner, row: CustomerInputRow, leaseUntil: string, recovering: boolean): Promise<CompleteResponse> {
    try {
      const rawLocation = { bucket: row.bucket, region: row.region, object_key: row.raw_object_key };
      const raw = await this.storage.readRaw(owner.tenantId, row.id, rawLocation, row.declared_size_bytes, row.declared_mime_type);
      const normalized = await this.normalize({ bytes: raw, mimeType: row.declared_mime_type });
      if (normalized.mimeType !== 'image/webp' || !Buffer.isBuffer(normalized.bytes)
        || normalized.bytes.length < 1 || normalized.bytes.length > RENDERING_UPLOAD_MAX_BYTES
        || !Number.isInteger(normalized.width) || normalized.width <= 0
        || !Number.isInteger(normalized.height) || normalized.height <= 0) {
        throw Errors.business(422, '图片规范化结果无效', 'RENDERING_IMAGE_REJECTED');
      }
      const objectKey = this.storage.normalizedObjectKey(owner.tenantId, row.id);
      const location = { bucket: row.bucket, region: row.region, object_key: objectKey };
      // PUT verifies HEAD and forbids overwrite. Unknown writes stay processing for lease recovery.
      if (!recovering || !await this.storage.hasNormalized(owner.tenantId, row.id, location, normalized.bytes)) {
        await this.storage.putNormalized(owner.tenantId, row.id, location, normalized.bytes);
      }
      const result = { objectKey, sizeBytes: normalized.bytes.length, width: normalized.width,
        height: normalized.height, checksum: createHash('sha256').update(normalized.bytes).digest('hex') };
      if (!await this.repository.markNormalized(owner, row.id, result, leaseUntil, new Date().toISOString())) throw processing();
      // raw_cleanup_after remains the durable cleanup task; this request never deletes recovery evidence.
      return { file_id: row.id, status: 'pending_review', mime_type: 'image/webp',
        width: result.width, height: result.height, size_bytes: result.sizeBytes };
    } catch (error) {
      if (error instanceof AppError && error.statusCode === 422 && error.code === 'RENDERING_IMAGE_REJECTED') {
        if (!await this.repository.markFailed(owner, row.id, leaseUntil, new Date().toISOString())) throw processing();
      }
      throw error;
    }
  }

  private async owner(user: JwtPayload | undefined, channel: Channel): Promise<CustomerInputOwner> {
    const actor = await (channel === 'wechat' ? this.contextService.resolveWechat(user) : this.contextService.resolveDouyin(user));
    const subject = this.digestService.subject(actor);
    return { tenantId: actor.tenantId, channel: actor.channel, applicationId: actor.applicationId,
      installationId: actor.installationId, subjectKeyVersion: subject.keyVersion, subjectDigest: subject.digest };
  }
}

function processing() {
  return Errors.business(409, '图片正在处理中，请稍后重试', ErrorCodes.RENDERING_UPLOAD_PROCESSING);
}
function completed(row: CustomerInputRow): CompleteResponse {
  const parsed = RenderingUploadCompleteResponseSchema.safeParse({ file_id: row.id, status: 'pending_review',
    mime_type: 'image/webp', width: row.width, height: row.height, size_bytes: row.normalized_size_bytes });
  if (!parsed.success) throw Errors.dbError('私有输入结果无效');
  return parsed.data;
}
export function createCustomerRenderingInputsService(): CustomerRenderingInputsPort {
  return new CustomerRenderingInputsService();
}
