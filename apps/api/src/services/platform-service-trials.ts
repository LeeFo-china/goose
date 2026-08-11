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
import type { AuthContext } from '@/services/authorization';
import {
  buildTrialAvailableActions,
  serializeServiceTrial,
  serializeServiceTrialPolicy,
} from './service-trial-views';

type RepositoryPort = Pick<ServiceTrialRepository,
  'listPlatformTrials' | 'getPlatformSummary' | 'findTrialById'
  | 'findCurrentPolicy' | 'executeCommand' | 'updatePolicy'>;

type PlatformServiceTrialDependencies = {
  repository?: RepositoryPort;
  nowFactory?: () => Date;
};
type RepeatAwareCommand =
  | Extract<TrialCommandInput, { action: 'grant' }>
  | Extract<TrialCommandInput, { action: 'review'; decision: 'approved' }>;

const PERMISSION = {
  read: 'platform.service_trial.read',
  review: 'platform.service_trial.review',
  manage: 'platform.service_trial.manage',
  override: 'platform.service_trial.override',
} as const;

export class PlatformServiceTrialService {
  private readonly repository: RepositoryPort;
  private readonly nowFactory: () => Date;

  constructor(dependencies: PlatformServiceTrialDependencies = {}) {
    this.repository = dependencies.repository ?? serviceTrialRepository;
    this.nowFactory = dependencies.nowFactory ?? (() => new Date());
  }

  async listTrials(authContext: AuthContext,
    query: Partial<PlatformServiceTrialListQuery>) {
    this.requirePermission(authContext, PERMISSION.read);
    const page = await this.repository.listPlatformTrials(query);
    const now = this.nowFactory();
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
    const policy = await this.requirePolicy();
    const now = this.nowFactory();
    const allowOverride = exceedsGrantPolicy(input, policy, now);
    if (allowOverride) this.requirePermission(authContext, PERMISSION.override);
    if (input.trial_type === 'guided' && !input.assignee_employee_id) {
      throw Errors.badRequest('陪跑试用必须指定平台跟进人');
    }
    const commandBase = {
      action: 'review', trialId, actorEmployeeId,
      decision: 'approved', expectedVersion: input.expected_version,
      idempotencyKey: input.idempotency_key, reason: input.reason,
      scope: input.scope ?? (input.trial_type === 'guided'
        ? policy.guided_scope : policy.standard_scope),
      trialDays: input.trial_days,
      graceDays: input.grace_days,
      startsAt: input.starts_at,
      allowOverride,
    } as const;
    const command: RepeatAwareCommand = input.trial_type === 'guided'
      ? { ...commandBase, trialType: 'guided',
        assigneeEmployeeId: requireAssignee(input.assignee_employee_id) }
      : { ...commandBase, trialType: 'standard',
        assigneeEmployeeId: input.assignee_employee_id };
    const result = await this.executeRepeatAware(command, authContext);
    return this.commandResponse(result, authContext);
  }

  async grant(authContext: AuthContext, input: PlatformServiceTrialGrantInput) {
    const actorEmployeeId = this.requirePermission(authContext, PERMISSION.manage);
    const policy = await this.requirePolicy();
    const now = this.nowFactory();
    const allowOverride = exceedsGrantPolicy(input, policy, now);
    if (allowOverride) this.requirePermission(authContext, PERMISSION.override);
    if (input.trial_type === 'guided' && !input.assignee_employee_id) {
      throw Errors.badRequest('陪跑试用必须指定平台跟进人');
    }
    const commandBase = {
      action: 'grant', tenantId: input.tenant_id, actorEmployeeId,
      scope: input.scope ?? (input.trial_type === 'guided'
        ? policy.guided_scope : policy.standard_scope),
      reason: input.reason, idempotencyKey: input.idempotency_key,
      trialDays: input.trial_days, graceDays: input.grace_days,
      startsAt: input.starts_at,
      allowOverride,
    } as const;
    const command: RepeatAwareCommand = input.trial_type === 'guided'
      ? { ...commandBase, trialType: 'guided',
        assigneeEmployeeId: requireAssignee(input.assignee_employee_id) }
      : { ...commandBase, trialType: 'standard',
        assigneeEmployeeId: input.assignee_employee_id };
    const result = await this.executeRepeatAware(command, authContext);
    return this.commandResponse(result, authContext);
  }

  async extend(authContext: AuthContext, trialId: string,
    input: PlatformServiceTrialExtendInput) {
    const actorEmployeeId = this.requirePermission(authContext, PERMISSION.manage);
    this.requirePermission(authContext, PERMISSION.override);
    const current = await this.requireTrial(trialId);
    const allowOverride = current.extension_count
      >= current.policy_snapshot.max_extension_count
      || input.extension_days > current.policy_snapshot.max_extension_days;
    const result = await this.repository.executeCommand({
      action: 'extend', trialId, actorEmployeeId,
      expectedVersion: input.expected_version,
      idempotencyKey: input.idempotency_key,
      extensionDays: input.extension_days,
      reason: input.reason,
      allowOverride,
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
    const policy = await this.requirePolicy();
    if (policy.id !== result.policy_id || policy.version < result.version) {
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

  private async executeRepeatAware(
    command: RepeatAwareCommand,
    authContext: AuthContext,
  ): Promise<TrialCommandResult> {
    try {
      return await this.repository.executeCommand(command);
    } catch (error) {
      if (!hasErrorCode(error, 'SERVICE_TRIAL_REPEAT_REQUIRES_OVERRIDE')
        || !hasPermission(authContext, PERMISSION.override)
        || !('allowOverride' in command) || command.allowOverride) {
        throw error;
      }
      return this.repository.executeCommand({ ...command, allowOverride: true });
    }
  }

  private async commandResponse(result: TrialCommandResult,
    authContext: AuthContext) {
    const record = await this.requireTrial(result.trial_id);
    const now = this.nowFactory();
    return {
      trial: serializeServiceTrial(record, now),
      idempotent: result.idempotent,
      available_actions: buildTrialAvailableActions(
        record, permissionSet(authContext), now,
      ),
      server_time: now.toISOString(),
    };
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

function exceedsGrantPolicy(input: {
  trial_days?: number;
  grace_days?: number;
  starts_at?: string;
}, policy: {
  max_trial_days: number;
  max_grace_days: number;
  max_schedule_days: number;
}, now: Date): boolean {
  return (input.trial_days ?? 0) > policy.max_trial_days
    || (input.grace_days ?? 0) > policy.max_grace_days
    || input.starts_at !== undefined
      && Date.parse(input.starts_at)
        > now.getTime() + policy.max_schedule_days * 86_400_000;
}

function hasErrorCode(error: unknown, code: string): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error
    && error.code === code);
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
