import { createHash } from 'node:crypto';
import { RenderingJobRequestSchema, projectRenderingQuota, type RenderingJobRequest, type RenderingQuota } from '@gooes/domain';
import { ErrorCodes } from '@/errors/error-codes';
import { Errors } from '@/errors/error-factory';
import { customerRenderingJobsRepository, type CustomerRenderingJobsRepositoryPort } from '@/repositories/customer-rendering-jobs';
import type { JwtPayload } from '@/utils/jwt';
import { customerRenderingContextService, type CustomerRenderingActor, type CustomerRenderingContextService } from './context';
import { getCustomerRenderingIdentityDigestService, type CustomerRenderingIdentityDigestService } from './identity-digest';

type Channel = CustomerRenderingActor['channel'];
export interface CustomerRenderingJobsPort {
  create(user: JwtPayload | undefined, channel: Channel, command: RenderingJobRequest): Promise<{
    job_id: string; status: 'queued' | 'processing' | 'succeeded' | 'failed' | 'review_required'; quota: RenderingQuota;
  }>;
}

export class CustomerRenderingJobsService implements CustomerRenderingJobsPort {
  constructor(private readonly dependencies: {
    contextService?: Pick<CustomerRenderingContextService, 'resolveWechat' | 'resolveDouyin'>;
    digestService?: Pick<CustomerRenderingIdentityDigestService, 'subject' | 'phone'>;
    repository?: CustomerRenderingJobsRepositoryPort;
    admissionEnabled?: () => boolean;
    pilotTenantId?: () => string | undefined;
    pilotChannel?: () => string | undefined;
  } = {}) {}

  async create(user: JwtPayload | undefined, channel: Channel, command: RenderingJobRequest) {
    if (!(this.dependencies.admissionEnabled ?? (() => process.env.CUSTOMER_RENDERING_JOB_ADMISSION_ENABLED === 'true'))()) {
      throw Errors.business(503, '客户生图暂未开放', 'RENDERING_JOB_DISABLED');
    }
    const parsed = RenderingJobRequestSchema.safeParse(command);
    if (!parsed.success) throw Errors.fromZod(parsed.error);
    const context = this.dependencies.contextService ?? customerRenderingContextService;
    const actor = await (channel === 'wechat' ? context.resolveWechat(user) : context.resolveDouyin(user));
    const pilotTenantId = (this.dependencies.pilotTenantId
      ?? (() => process.env.CUSTOMER_RENDERING_JOB_PILOT_TENANT_ID))();
    const pilotChannel = (this.dependencies.pilotChannel
      ?? (() => process.env.CUSTOMER_RENDERING_JOB_PILOT_CHANNEL))();
    if (pilotTenantId !== actor.tenantId || pilotChannel !== actor.channel) {
      throw Errors.business(503, '客户生图暂未开放', 'RENDERING_JOB_DISABLED');
    }
    const digest = this.dependencies.digestService ?? getCustomerRenderingIdentityDigestService();
    const subject = digest.subject(actor);
    const phone = actor.verifiedPhone ? digest.phone({ tenantId: actor.tenantId, phone: actor.verifiedPhone }) : null;
    const requestHash = createHash('sha256').update(JSON.stringify([
      parsed.data.style_asset_id, parsed.data.room_file_id, parsed.data.floor_plan_file_id ?? null,
      parsed.data.space, parsed.data.mode, parsed.data.keep_notes ?? null, parsed.data.idempotency_key,
    ])).digest('hex');
    const result = await (this.dependencies.repository ?? customerRenderingJobsRepository).create({
      tenantId: actor.tenantId, channel: actor.channel,
      subjectKeyVersion: subject.keyVersion, subjectDigest: subject.digest,
      applicationId: actor.applicationId, installationId: actor.installationId,
      phoneKeyVersion: phone?.keyVersion ?? null, phoneDigest: phone?.digest ?? null,
      styleAssetId: parsed.data.style_asset_id, roomFileId: parsed.data.room_file_id,
      floorPlanFileId: parsed.data.floor_plan_file_id ?? null, space: parsed.data.space,
      mode: parsed.data.mode, keepNotes: parsed.data.keep_notes ?? null,
      idempotencyKey: parsed.data.idempotency_key, requestHash,
    });
    if (result.decision === 'created' || result.decision === 'existing') {
      return { job_id: result.job_id, status: result.status,
        quota: projectRenderingQuota({ phoneVerified: result.quota.phone_verified,
          consumed: result.quota.consumed, reserved: result.quota.reserved,
          activeJobId: result.quota.active_job_id }) };
    }
    switch (result.decision) {
      case 'disabled': throw Errors.business(503, '客户生图暂未开放', 'RENDERING_JOB_DISABLED');
      case 'invalid_request': throw Errors.badRequest('任务参数无效');
      case 'style_unavailable': throw Errors.business(422, '所选装修效果素材不可用', 'RENDERING_STYLE_UNAVAILABLE');
      case 'input_unavailable': throw Errors.business(422, '图片尚未就绪或不属于当前账号', 'RENDERING_INPUT_UNAVAILABLE');
      case 'daily_task_limit': throw Errors.business(429, '今日生成任务已达上限', 'RENDERING_DAILY_TASK_LIMIT');
      case 'daily_budget_limit': throw Errors.business(429, '今日生成预算已达上限', 'RENDERING_DAILY_BUDGET_LIMIT');
      case 'job_active': throw Errors.business(409, '已有正在进行的任务', ErrorCodes.RENDERING_JOB_ACTIVE);
      case 'phone_required': throw Errors.business(409, '请先授权手机号后再继续生成', ErrorCodes.RENDERING_PHONE_REQUIRED);
      case 'quota_exhausted': throw Errors.business(409, '生成次数已用完', ErrorCodes.RENDERING_QUOTA_EXHAUSTED);
      case 'idempotency_conflict': throw Errors.business(409, '幂等键已用于其他生成请求', ErrorCodes.RENDERING_IDEMPOTENCY_CONFLICT);
    }
  }
}

export function createCustomerRenderingJobsService(): CustomerRenderingJobsPort {
  return new CustomerRenderingJobsService();
}
