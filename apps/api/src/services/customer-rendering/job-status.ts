import { z } from 'zod';
import { Errors } from '@/errors/error-factory';
import { CustomerRenderingResultStorage } from '@/gateways/customer-rendering-result-storage/client';
import { loadRenderingStorageConfig } from '@/gateways/rendering-library-storage/client';
import { customerRenderingJobStatusRepository, type CustomerRenderingJobStatusRepositoryPort } from '@/repositories/customer-rendering-job-status';
import { RenderingJobStatusResponseSchema, type RenderingJobStatusResponse } from '@/schema/customer-renderings';
import { systemSettingsService } from '@/services/system-settings';
import type { JwtPayload } from '@/utils/jwt';
import { customerRenderingContextService, type CustomerRenderingContextService } from './context';
import { getCustomerRenderingIdentityDigestService, type CustomerRenderingIdentityDigestService } from './identity-digest';

type Channel = 'wechat' | 'douyin';
type ResultReadStoragePort = Pick<CustomerRenderingResultStorage, 'signResultRead'>;
export interface CustomerRenderingJobStatusPort {
  get(user: JwtPayload | undefined, channel: Channel, id: string): Promise<RenderingJobStatusResponse>;
}

export class CustomerRenderingJobStatusService implements CustomerRenderingJobStatusPort {
  constructor(private readonly dependencies: {
    contextService?: Pick<CustomerRenderingContextService, 'resolveWechat' | 'resolveDouyin'>;
    digestService?: Pick<CustomerRenderingIdentityDigestService, 'subject'>;
    repository?: CustomerRenderingJobStatusRepositoryPort;
    storage?: ResultReadStoragePort;
  } = {}) {}

  async get(user: JwtPayload | undefined, channel: Channel, id: string): Promise<RenderingJobStatusResponse> {
    const parsedId = z.uuid('无效的任务 ID').safeParse(id);
    if (!parsedId.success) throw Errors.fromZod(parsedId.error);
    const context = this.dependencies.contextService ?? customerRenderingContextService;
    const actor = await (channel === 'wechat' ? context.resolveWechat(user) : context.resolveDouyin(user));
    const digest = (this.dependencies.digestService ?? getCustomerRenderingIdentityDigestService()).subject(actor);
    const row = await (this.dependencies.repository ?? customerRenderingJobStatusRepository).findOwned({
      tenantId: actor.tenantId, channel: actor.channel, subjectKeyVersion: digest.keyVersion,
      subjectDigest: digest.digest, applicationId: actor.applicationId, installationId: actor.installationId,
    }, parsedId.data);
    if (!row) throw Errors.business(404, '客户生图任务不存在', 'RENDERING_JOB_NOT_FOUND');
    let result: RenderingJobStatusResponse['result'] = null;
    if (row.status === 'succeeded') {
      if (row.output_review_decision !== 'approved' || !row.attempt_id || !row.result_bucket
        || !row.result_region || !row.result_object_key || !row.result_size_bytes) {
        throw Errors.dbError('客户生图结果状态无效');
      }
      const storage = this.dependencies.storage ?? new CustomerRenderingResultStorage({
        loadConfig: () => loadRenderingStorageConfig(systemSettingsService),
      });
      const signed = await storage.signResultRead(actor.tenantId, row.id, row.attempt_id,
        { bucket: row.result_bucket, region: row.result_region, object_key: row.result_object_key });
      result = { mime_type: 'image/webp', size_bytes: row.result_size_bytes,
        download_url: signed.url, expires_at: signed.expiresAt };
    }
    const response = RenderingJobStatusResponseSchema.safeParse({
      job_id: row.id, status: row.status, created_at: row.created_at, updated_at: row.updated_at,
      finished_at: row.finished_at, result,
    });
    if (!response.success) throw Errors.dbError('客户生图任务响应无效');
    return response.data;
  }
}

export function createCustomerRenderingJobStatusService(): CustomerRenderingJobStatusPort {
  return new CustomerRenderingJobStatusService();
}
