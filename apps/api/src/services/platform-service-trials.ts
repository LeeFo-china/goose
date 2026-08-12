import { ErrorCodes } from '@/errors/error-codes';
import { Errors } from '@/errors/error-factory';
import {
  serviceTrialRepository,
  type ServiceTrialRepository,
  type TrialCommandInput,
  type TrialCommandResult,
} from '@/repositories/service-trials';
import type {
  PlatformServiceTrialAssignInput,
  PlatformServiceTrialExtendInput,
  PlatformServiceTrialGrantInput,
  PlatformServiceTrialListQuery,
  PlatformServiceTrialPolicyUpdateInput,
  PlatformServiceTrialReviewInput,
  PlatformServiceTrialRevokeInput,
} from '@/schema/service-trials';
import type {
  CancelServiceTrialFollowUpInput,
  CreateServiceTrialFollowUpInput,
  ServiceTrialFollowUpListQuery,
} from '@/schema/service-trial-followups';
import type { AuthContext } from '@/services/authorization';
import {
  platformServiceTrialOperationsService,
  type PlatformServiceTrialOperationsService,
} from './platform-service-trial-operations';
import {
  buildTrialAvailableActions,
  serializeServiceTrial,
  serializeServiceTrialCommandSnapshot,
  serializeServiceTrialPolicy,
} from './service-trial-views';

type RepositoryPort = Pick<ServiceTrialRepository,
  'listPlatformTrials' | 'getPlatformSummary' | 'findTrialById'
  | 'findCurrentPolicy' | 'findPolicyById' | 'executeCommand' | 'updatePolicy'>;
type OperationsServicePort = Pick<PlatformServiceTrialOperationsService,
  'listFollowUps' | 'createFollowUp' | 'cancelFollowUp'>;

type PlatformServiceTrialDependencies = {
  repository?: RepositoryPort;
  operationsService?: OperationsServicePort;
  nowFactory?: () => Date;
};
const PERMISSION = {
  read: 'platform.service_trial.read',
  review: 'platform.service_trial.review',
  manage: 'platform.service_trial.manage',
  override: 'platform.service_trial.override',
} as const;

export class PlatformServiceTrialService {
  private readonly repository: RepositoryPort;
  private readonly operationsService: OperationsServicePort;
  private readonly nowFactory: () => Date;

  constructor(dependencies: PlatformServiceTrialDependencies = {}) {
    this.repository = dependencies.repository ?? serviceTrialRepository;
    this.operationsService = dependencies.operationsService
      ?? platformServiceTrialOperationsService;
    this.nowFactory = dependencies.nowFactory ?? (() => new Date());
  }

  listFollowUps(authContext: AuthContext, trialId: string,
    query: ServiceTrialFollowUpListQuery) {
    return this.operationsService.listFollowUps(authContext, trialId, query);
  }

  createFollowUp(authContext: AuthContext, trialId: string,
    input: CreateServiceTrialFollowUpInput) {
    return this.operationsService.createFollowUp(authContext, trialId, input);
  }

  cancelFollowUp(authContext: AuthContext, trialId: string, followUpId: string,
    input: CancelServiceTrialFollowUpInput) {
    return this.operationsService.cancelFollowUp(
      authContext, trialId, followUpId, input,
    );
  }

  async listTrials(authContext: AuthContext,
    query: Partial<PlatformServiceTrialListQuery>) {
    this.requirePermission(authContext, PERMISSION.read);
    const now = this.nowFactory();
    const page = await this.repository.listPlatformTrials({
      ...query, nowIso: now.toISOString(),
    });
    const permissions = permissionSet(authContext);
    return {
      ...page,
      list: page.list.map((record) => ({
        ...serializeServiceTrial(record, now),
        available_actions: buildTrialAvailableActions(record, permissions, now),
      })),
      server_time: now.toISOString(),
    };
  }

  async getSummary(authContext: AuthContext) {
    this.requirePermission(authContext, PERMISSION.read);
    const now = this.nowFactory();
    const summary = await this.repository.getPlatformSummary(now.toISOString());
    return { ...summary, server_time: now.toISOString() };
  }

  async getTrial(authContext: AuthContext, trialId: string) {
    this.requirePermission(authContext, PERMISSION.read);
    const record = await this.requireTrial(trialId);
    return this.trialResponse(record, authContext, this.nowFactory());
  }

  async getPolicy(authContext: AuthContext) {
    this.requirePermission(authContext, PERMISSION.read);
    const policy = await this.requirePolicy();
    const now = this.nowFactory();
    return {
      policy: serializeServiceTrialPolicy(policy),
      available_actions: { update_policy: policyAction(authContext) },
      server_time: now.toISOString(),
    };
  }

  async review(authContext: AuthContext, trialId: string,
    input: PlatformServiceTrialReviewInput) {
    const actorEmployeeId = this.requirePermission(authContext, PERMISSION.review);
    if (input.decision === 'rejected') {
      const result = await this.repository.executeCommand({
        action: 'review', trialId, actorEmployeeId,
        decision: 'rejected', expectedVersion: input.expected_version,
        idempotencyKey: input.idempotency_key, reason: input.reason,
        allowOverride: false,
      });
      return this.commandResponse(result, authContext);
    }

    if (input.trial_type === 'guided' || input.assignee_employee_id) {
      this.requirePermission(authContext, PERMISSION.manage);
    }
    if (input.trial_type === 'guided' && !input.assignee_employee_id) {
      throw Errors.badRequest('陪跑试用必须指定平台跟进人');
    }
    const commandBase = {
      action: 'review', trialId, actorEmployeeId,
      decision: 'approved', expectedVersion: input.expected_version,
      idempotencyKey: input.idempotency_key, reason: input.reason,
      scope: input.scope,
      trialDays: input.trial_days,
      graceDays: input.grace_days,
      startsAt: input.starts_at,
      allowOverride: hasPermission(authContext, PERMISSION.override),
    } as const;
    const command: Extract<TrialCommandInput, {
      action: 'review'; decision: 'approved';
    }> = input.trial_type === 'guided'
      ? { ...commandBase, trialType: 'guided',
        assigneeEmployeeId: requireAssignee(input.assignee_employee_id) }
      : { ...commandBase, trialType: 'standard',
        assigneeEmployeeId: input.assignee_employee_id };
    const result = await this.repository.executeCommand(command);
    if (input.trial_type === 'guided') {
      await this.createInitialGuidedFollowUp(
        authContext, result, input.idempotency_key,
      );
    }
    return this.commandResponse(result, authContext);
  }

  async grant(authContext: AuthContext, input: PlatformServiceTrialGrantInput) {
    const actorEmployeeId = this.requirePermission(authContext, PERMISSION.manage);
    if (input.trial_type === 'guided' && !input.assignee_employee_id) {
      throw Errors.badRequest('陪跑试用必须指定平台跟进人');
    }
    const commandBase = {
      action: 'grant', tenantId: input.tenant_id, actorEmployeeId,
      scope: input.scope,
      reason: input.reason, idempotencyKey: input.idempotency_key,
      trialDays: input.trial_days, graceDays: input.grace_days,
      startsAt: input.starts_at,
      allowOverride: hasPermission(authContext, PERMISSION.override),
    } as const;
    const command: Extract<TrialCommandInput, { action: 'grant' }> =
      input.trial_type === 'guided'
      ? { ...commandBase, trialType: 'guided',
        assigneeEmployeeId: requireAssignee(input.assignee_employee_id) }
      : { ...commandBase, trialType: 'standard',
        assigneeEmployeeId: input.assignee_employee_id };
    const result = await this.repository.executeCommand(command);
    if (input.trial_type === 'guided') {
      await this.createInitialGuidedFollowUp(
        authContext, result, input.idempotency_key,
      );
    }
    return this.commandResponse(result, authContext);
  }

  async extend(authContext: AuthContext, trialId: string,
    input: PlatformServiceTrialExtendInput) {
    const actorEmployeeId = this.requirePermission(authContext, PERMISSION.manage);
    this.requirePermission(authContext, PERMISSION.override);
    const result = await this.repository.executeCommand({
      action: 'extend', trialId, actorEmployeeId,
      expectedVersion: input.expected_version,
      idempotencyKey: input.idempotency_key,
      extensionDays: input.extension_days,
      reason: input.reason,
      allowOverride: true,
    });
    return this.commandResponse(result, authContext);
  }

  async revoke(authContext: AuthContext, trialId: string,
    input: PlatformServiceTrialRevokeInput) {
    const actorEmployeeId = this.requirePermission(authContext, PERMISSION.manage);
    this.requirePermission(authContext, PERMISSION.override);
    const result = await this.repository.executeCommand({
      action: 'revoke', trialId, actorEmployeeId,
      expectedVersion: input.expected_version,
      idempotencyKey: input.idempotency_key,
      reason: input.reason,
    });
    return this.commandResponse(result, authContext);
  }

  async assign(authContext: AuthContext, trialId: string,
    input: PlatformServiceTrialAssignInput) {
    const actorEmployeeId = this.requirePermission(authContext, PERMISSION.manage);
    const result = await this.repository.executeCommand({
      action: 'assign', trialId, actorEmployeeId,
      expectedVersion: input.expected_version,
      idempotencyKey: input.idempotency_key,
      assigneeEmployeeId: input.assignee_employee_id,
    });
    return this.commandResponse(result, authContext);
  }

  async updatePolicy(authContext: AuthContext,
    input: PlatformServiceTrialPolicyUpdateInput) {
    const actorEmployeeId = this.requirePermission(authContext, PERMISSION.manage);
    this.requirePermission(authContext, PERMISSION.override);
    const result = await this.repository.updatePolicy({
      actorEmployeeId,
      expectedVersion: input.expected_version,
      idempotencyKey: input.idempotency_key,
      reason: input.reason,
      policy: {
        trialDays: input.default_trial_days,
        graceDays: input.default_grace_days,
        reminderDays: input.reminder_days,
        maxTrialDays: input.max_trial_days,
        maxGraceDays: input.max_grace_days,
        maxScheduleDays: input.max_schedule_ahead_days,
        maxExtensionCount: input.max_extension_count,
        maxExtensionDays: input.max_extension_days,
        reapplyCooldownDays: input.reapply_cooldown_days,
        allowRepeat: input.allow_repeat_application,
        standardScope: input.standard_scope,
        guidedScope: input.guided_scope,
      },
    });
    const policy = await this.repository.findPolicyById(result.policy_id);
    if (!policy || policy.id !== result.policy_id || policy.version !== result.version) {
      throw Errors.dbError('更新后的技术服务试用策略不一致');
    }
    const now = this.nowFactory();
    return {
      policy: serializeServiceTrialPolicy(policy),
      idempotent: result.idempotent,
      available_actions: { update_policy: policyAction(authContext) },
      server_time: now.toISOString(),
    };
  }

  private commandResponse(result: TrialCommandResult,
    authContext: AuthContext) {
    const now = this.nowFactory();
    return {
      trial: serializeServiceTrialCommandSnapshot(result.trial_snapshot),
      idempotent: result.idempotent,
      available_actions: buildTrialAvailableActions(
        result.trial_snapshot, permissionSet(authContext), now,
      ),
      server_time: now.toISOString(),
    };
  }

  private async createInitialGuidedFollowUp(
    authContext: AuthContext,
    result: TrialCommandResult,
    idempotencyKey: string,
  ) {
    const startsAt = result.trial_snapshot.starts_at;
    if (!startsAt) throw Errors.dbError('陪跑试用缺少开始时间事实');
    await this.operationsService.createFollowUp(authContext, result.trial_id, {
      follow_up_type: 'online_meeting',
      status: 'pending',
      summary: '陪跑试用首次跟进',
      result: '待与租户确认首次陪跑安排',
      next_follow_up_at: startsAt,
      idempotency_key: idempotencyKey,
    });
  }

  private trialResponse(record: Parameters<typeof serializeServiceTrial>[0],
    authContext: AuthContext, now: Date) {
    return {
      trial: serializeServiceTrial(record, now),
      available_actions: buildTrialAvailableActions(
        record, permissionSet(authContext), now,
      ),
      server_time: now.toISOString(),
    };
  }

  private async requireTrial(trialId: string) {
    const record = await this.repository.findTrialById({ id: trialId });
    if (!record) {
      throw Errors.business(404, '技术服务试用不存在',
        'SERVICE_TRIAL_NOT_FOUND');
    }
    return record;
  }

  private async requirePolicy() {
    const policy = await this.repository.findCurrentPolicy();
    if (!policy) {
      throw Errors.business(400, '技术服务试用策略无效',
        'SERVICE_TRIAL_POLICY_INVALID');
    }
    return policy;
  }

  private requirePermission(authContext: AuthContext, permission: string) {
    assertPlatformStaff(authContext);
    if (!hasPermission(authContext, permission)) {
      throw Errors.business(403, '缺少平台操作权限',
        ErrorCodes.PLATFORM_PERMISSION_REQUIRED, { permission });
    }
    return authContext.employeeId!;
  }
}

function assertPlatformStaff(authContext: AuthContext): void {
  if (authContext.tenantId !== null || !authContext.employeeId
    || (!authContext.isPlatformStaff && !authContext.isPlatformAdmin)) {
    throw Errors.business(403, '当前身份不是有效平台工作人员',
      ErrorCodes.PLATFORM_STAFF_REQUIRED);
  }
}

function hasPermission(authContext: AuthContext, permission: string): boolean {
  return authContext.isPlatformSuperAdmin === true
    || authContext.permissions.some((item) => item.code === permission);
}

function permissionSet(authContext: AuthContext): ReadonlySet<string> {
  if (authContext.isPlatformSuperAdmin) return new Set(Object.values(PERMISSION));
  return new Set(authContext.permissions.map((item) => item.code));
}

function policyAction(authContext: AuthContext) {
  return hasPermission(authContext, PERMISSION.manage)
    && hasPermission(authContext, PERMISSION.override)
    ? { enabled: true, disabled_reason: null }
    : { enabled: false, disabled_reason: '无试用策略修改权限' };
}

function requireAssignee(assigneeEmployeeId: string | null | undefined): string {
  if (!assigneeEmployeeId) {
    throw Errors.badRequest('陪跑试用必须指定平台跟进人');
  }
  return assigneeEmployeeId;
}

export const platformServiceTrialService = new PlatformServiceTrialService();
