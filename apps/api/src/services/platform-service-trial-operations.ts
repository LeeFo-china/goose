import { z } from 'zod';

import { ErrorCodes } from '@/errors/error-codes';
import { Errors } from '@/errors/error-factory';
import {
  serviceTrialOperationsRepository,
  type ClaimedTrialNotificationDelivery,
  type ServiceTrialOperationsRepository,
} from '@/repositories/service-trial-operations';
import { serviceTrialRepository } from '@/repositories/service-trials';
import type {
  CancelServiceTrialFollowUpInput,
  CreateServiceTrialFollowUpInput,
  ServiceTrialFollowUpListQuery,
} from '@/schema/service-trial-followups';
import type { AuthContext } from '@/services/authorization';

type OperationsRepositoryPort = Pick<ServiceTrialOperationsRepository,
  'listFollowUps' | 'createFollowUp' | 'cancelFollowUp'
  | 'claimNotificationDeliveries' | 'findNotificationIdForDelivery'
  | 'completeNotificationDelivery' | 'failNotificationDelivery'>;
type TrialRepositoryPort = {
  findTrialById(input: { id: string }): Promise<{
    id: string; tenant_id: string; trial_type: string;
  } | null>;
};
type NotificationPort = {
  createEmployeeNotification(input: {
    tenantId: string; recipientEmployeeId: string; scene: string;
    title: string; content: string; targetType?: string | null;
    targetId?: string | null; targetUrl?: string | null;
    payload?: Record<string, unknown>;
  }): Promise<Array<{ id: string }>>;
};
type Dependencies = {
  repository?: OperationsRepositoryPort;
  trialRepository?: TrialRepositoryPort;
  notifications?: NotificationPort;
};

const PERMISSION = {
  read: 'platform.service_trial.read',
  manage: 'platform.service_trial.manage',
} as const;
const NotificationIdSchema = z.uuid();

export class PlatformServiceTrialOperationsService {
  private readonly repository: OperationsRepositoryPort;
  private readonly trialRepository: TrialRepositoryPort;
  private readonly notifications: NotificationPort;

  constructor(dependencies: Dependencies = {}) {
    this.repository = dependencies.repository ?? serviceTrialOperationsRepository;
    this.trialRepository = dependencies.trialRepository ?? serviceTrialRepository;
    this.notifications = dependencies.notifications ?? {
      createEmployeeNotification: async (input) => {
        const { notificationService } = await import('@/services/notifications');
        return notificationService.createEmployeeNotification(input);
      },
    };
  }

  async listFollowUps(authContext: AuthContext, trialId: string,
    query: ServiceTrialFollowUpListQuery) {
    this.requirePermission(authContext, PERMISSION.read);
    const trial = await this.requireTrial(trialId);
    return this.repository.listFollowUps({
      trialId: trial.id, tenantId: trial.tenant_id,
      page: query.page, pageSize: query.pageSize, status: query.status,
    });
  }

  async createFollowUp(authContext: AuthContext, trialId: string,
    input: CreateServiceTrialFollowUpInput) {
    const actorEmployeeId = this.requirePermission(authContext, PERMISSION.manage);
    const trial = await this.requireTrial(trialId);
    if (trial.trial_type !== 'standard' && trial.trial_type !== 'guided') {
      throw Errors.dbError('技术服务试用类型无效');
    }
    const followUp = await this.repository.createFollowUp({
      actorEmployeeId, trialId: trial.id, tenantId: trial.tenant_id,
      followUpType: input.follow_up_type, status: input.status,
      summary: input.summary, result: input.result,
      nextFollowUpAt: input.next_follow_up_at,
      idempotencyKey: input.idempotency_key,
    });
    return assertFollowUpBinding(followUp, trial.id, trial.tenant_id);
  }

  async cancelFollowUp(authContext: AuthContext, trialId: string,
    followUpId: string, input: CancelServiceTrialFollowUpInput) {
    const actorEmployeeId = this.requirePermission(authContext, PERMISSION.manage);
    const trial = await this.requireTrial(trialId);
    const followUp = await this.repository.cancelFollowUp({
      actorEmployeeId, followUpId, trialId: trial.id, tenantId: trial.tenant_id,
      idempotencyKey: input.idempotency_key,
    });
    return assertFollowUpBinding(followUp, trial.id, trial.tenant_id, followUpId);
  }

  async runReminderBatch(input: { limit: number }): Promise<{
    claimed: number; sent: number; failed: number; errors: string[];
  }> {
    if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 100) {
      throw Errors.business(400, '试用提醒批次大小必须在 1 到 100 之间',
        'SERVICE_TRIAL_NOTIFICATION_LIMIT_INVALID');
    }
    const claims = await this.repository.claimNotificationDeliveries(input.limit);
    const result = { claimed: claims.length, sent: 0, failed: 0, errors: [] as string[] };
    for (const claim of claims) {
      try {
        const notificationId = await this.ensureNotificationId(claim);
        await this.repository.completeNotificationDelivery({
          deliveryId: claim.delivery_id, leaseToken: claim.lease_token,
          notificationId,
        });
        result.sent += 1;
      } catch (error) {
        result.failed += 1;
        const code = stableErrorCode(error);
        const requestId = safeRequestId(error);
        try {
          await this.repository.failNotificationDelivery({
            deliveryId: claim.delivery_id, leaseToken: claim.lease_token,
            errorCode: ledgerErrorCode(code),
          });
        } catch {
          // The lease may already be completed after an uncertain transport result.
        }
        result.errors.push([claim.delivery_id, code, requestId]
          .filter((item): item is string => Boolean(item)).join(':'));
      }
    }
    return result;
  }

  private async ensureNotificationId(claim: ClaimedTrialNotificationDelivery) {
    const existing = await this.repository.findNotificationIdForDelivery({
      deliveryId: claim.delivery_id,
      recipientEmployeeId: claim.recipient_employee_id,
    });
    if (existing) return existing;
    try {
      const notifications = await this.notifications.createEmployeeNotification({
        tenantId: claim.tenant_id,
        recipientEmployeeId: claim.recipient_employee_id,
        scene: 'platform_service_trial',
        ...notificationCopy(claim),
        targetType: 'service_trial_delivery', targetId: claim.delivery_id,
        targetUrl: `/packageEmployees/pages/platformServiceTrialDetail/index?id=${encodeURIComponent(claim.trial_id)}`,
        payload: {
          delivery_id: claim.delivery_id, trial_id: claim.trial_id,
          event_type: claim.event_type,
        },
      });
      if (notifications.length !== 1) throw Errors.dbError('试用提醒通知创建事实无效');
      return parseNotificationId(notifications[0]?.id);
    } catch (error) {
      const raced = await this.repository.findNotificationIdForDelivery({
        deliveryId: claim.delivery_id,
        recipientEmployeeId: claim.recipient_employee_id,
      });
      if (raced) return raced;
      throw error;
    }
  }

  private async requireTrial(trialId: string) {
    const trial = await this.trialRepository.findTrialById({ id: trialId });
    if (!trial || trial.id !== trialId) {
      throw Errors.business(404, '技术服务试用不存在', 'SERVICE_TRIAL_NOT_FOUND');
    }
    return trial;
  }

  private requirePermission(authContext: AuthContext, permission: string) {
    if (authContext.tenantId !== null || !authContext.employeeId
      || (!authContext.isPlatformStaff && !authContext.isPlatformAdmin)) {
      throw Errors.business(403, '当前身份不是有效平台工作人员',
        ErrorCodes.PLATFORM_STAFF_REQUIRED);
    }
    if (!authContext.isPlatformSuperAdmin
      && !authContext.permissions.some((item) => item.code === permission)) {
      throw Errors.business(403, '缺少平台操作权限',
        ErrorCodes.PLATFORM_PERMISSION_REQUIRED, { permission });
    }
    return authContext.employeeId;
  }
}

function assertFollowUpBinding<T extends { id: string; trial_id: string; tenant_id: string }>(
  followUp: T, trialId: string, tenantId: string, followUpId?: string,
) {
  if (followUp.trial_id !== trialId || followUp.tenant_id !== tenantId
    || followUpId !== undefined && followUp.id !== followUpId) {
    throw Errors.dbError('技术服务试用跟进返回事实无效');
  }
  return followUp;
}

function parseNotificationId(value: unknown) {
  const parsed = NotificationIdSchema.safeParse(value);
  if (!parsed.success) throw Errors.dbError('试用提醒通知创建事实无效');
  return parsed.data;
}

function notificationCopy(claim: ClaimedTrialNotificationDelivery) {
  const copy = {
    application_submitted: ['技术服务试用申请待审核', '新的技术服务试用申请等待平台审核。'],
    approved: ['技术服务试用已通过', '技术服务试用申请已通过审核。'],
    rejected: ['技术服务试用未通过', '技术服务试用申请未通过审核。'],
    extended: ['技术服务试用已延期', '技术服务试用期限已更新。'],
    revoked: ['技术服务试用已撤销', '技术服务试用已被平台撤销。'],
    expires_in_7_days: ['技术服务试用即将到期', '技术服务试用将在 7 天后到期。'],
    expires_in_3_days: ['技术服务试用即将到期', '技术服务试用将在 3 天后到期。'],
    expires_in_1_day: ['技术服务试用即将到期', '技术服务试用将在 1 天后到期。'],
    entered_grace: ['技术服务进入宽限期', '技术服务试用已到期，当前处于只读宽限期。'],
    expired: ['技术服务试用已结束', '技术服务试用及宽限期均已结束。'],
    converted: ['技术服务已正式开通', '试用已转化为正式技术服务。'],
  } as const;
  const [title, content] = copy[claim.event_type];
  return { title, content };
}

function stableErrorCode(error: unknown) {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string' && /^[A-Z][A-Z0-9_]{0,63}$/.test(code)) return code;
  }
  return 'SERVICE_TRIAL_NOTIFICATION_SEND_FAILED';
}

function ledgerErrorCode(code: string) {
  const normalized = code.toLowerCase();
  return /^[a-z][a-z0-9_]{0,63}$/.test(normalized)
    ? normalized : 'service_trial_notification_send_failed';
}

function safeRequestId(error: unknown) {
  if (!error || typeof error !== 'object' || !('details' in error)) return null;
  const details = (error as { details?: unknown }).details;
  if (!details || typeof details !== 'object' || Array.isArray(details)) return null;
  const requestId = (details as Record<string, unknown>).requestId;
  return typeof requestId === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(requestId)
    ? requestId : null;
}

export const platformServiceTrialOperationsService =
  new PlatformServiceTrialOperationsService();
