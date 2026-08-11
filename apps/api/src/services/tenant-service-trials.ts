import { Errors } from '@/errors/error-factory';
import {
  serviceTrialRepository,
  type ServiceTrialRepository,
  type TrialCommandResult,
} from '@/repositories/service-trials';
import type {
  ServiceTrialApplicationCreateInput,
  ServiceTrialListQuery,
  ServiceTrialWithdrawInput,
} from '@/schema/service-trials';
import type { AuthContext } from '@/services/authorization';
import {
  buildTrialAvailableActions,
  serializeServiceTrial,
  serializeServiceTrialCommandSnapshot,
} from './service-trial-views';
import { platformServiceTrialRollout } from './platform-service-trial-rollout';

type RepositoryPort = Pick<ServiceTrialRepository,
  'listTenantTrials' | 'findCurrentTenantTrial' | 'findTrialById'
  | 'executeCommand'>;

type TenantServiceTrialDependencies = {
  repository?: RepositoryPort;
  nowFactory?: () => Date;
  applicationEnabled?: () => Promise<boolean>;
};

const READ_PERMISSION = 'billing.service_trial.read';
const APPLY_PERMISSION = 'billing.service_trial.apply';

export class TenantServiceTrialService {
  private readonly repository: RepositoryPort;
  private readonly nowFactory: () => Date;
  private readonly applicationEnabled: () => Promise<boolean>;

  constructor(dependencies: TenantServiceTrialDependencies = {}) {
    this.repository = dependencies.repository ?? serviceTrialRepository;
    this.nowFactory = dependencies.nowFactory ?? (() => new Date());
    this.applicationEnabled = dependencies.applicationEnabled
      ?? (() => platformServiceTrialRollout.isApplicationEnabled());
  }

  async listTrials(
    authContext: AuthContext,
    query: Partial<ServiceTrialListQuery>,
  ) {
    const tenantId = this.requirePermission(authContext, READ_PERMISSION);
    const now = this.nowFactory();
    const page = await this.repository.listTenantTrials({
      tenantId,
      page: query.page,
      pageSize: query.pageSize,
      status: query.status,
      nowIso: now.toISOString(),
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

  async getCurrentTrial(authContext: AuthContext) {
    const tenantId = this.requirePermission(authContext, READ_PERMISSION);
    const record = await this.repository.findCurrentTenantTrial(tenantId);
    const now = this.nowFactory();
    if (!record) {
      return { trial: null, available_actions: null, server_time: now.toISOString() };
    }
    return this.readResponse(record, authContext, now);
  }

  async getTrial(authContext: AuthContext, trialId: string) {
    const tenantId = this.requirePermission(authContext, READ_PERMISSION);
    const record = await this.repository.findTrialById({ id: trialId, tenantId });
    if (!record) throw trialNotFound();
    return this.readResponse(record, authContext, this.nowFactory());
  }

  async apply(
    authContext: AuthContext,
    input: ServiceTrialApplicationCreateInput,
  ) {
    const { tenantId, employeeId } = this.requireWrite(authContext);
    if (!await this.applicationEnabled()) {
      throw Errors.business(
        403,
        '技术服务试用自主申请尚未开放',
        'SERVICE_TRIAL_APPLICATION_DISABLED',
      );
    }
    const result = await this.repository.executeCommand({
      action: 'apply',
      tenantId,
      actorEmployeeId: employeeId,
      applicationReason: input.application_reason,
      expectedUserCount: input.expected_user_count,
      expectedProjectCount: input.expected_project_count,
      contactName: input.contact_name,
      contactPhone: input.contact_phone,
      idempotencyKey: input.idempotency_key,
    });
    return this.commandResponse(result, authContext);
  }

  async withdraw(
    authContext: AuthContext,
    trialId: string,
    input: ServiceTrialWithdrawInput,
  ) {
    const { tenantId, employeeId } = this.requireWrite(authContext);
    const result = await this.repository.executeCommand({
      action: 'withdraw',
      trialId,
      tenantId,
      actorEmployeeId: employeeId,
      expectedVersion: input.expected_version,
      reason: input.reason,
      idempotencyKey: input.idempotency_key,
    });
    return this.commandResponse(result, authContext);
  }

  private commandResponse(
    result: TrialCommandResult,
    authContext: AuthContext,
  ) {
    const now = this.nowFactory();
    return {
      trial: serializeServiceTrialCommandSnapshot(result.trial_snapshot),
      idempotent: result.idempotent,
      available_actions: buildTrialAvailableActions(
        result.trial_snapshot,
        permissionSet(authContext),
        now,
      ),
      server_time: now.toISOString(),
    };
  }

  private readResponse(record: Parameters<typeof serializeServiceTrial>[0],
    authContext: AuthContext, now: Date) {
    return {
      trial: serializeServiceTrial(record, now),
      available_actions: buildTrialAvailableActions(
        record,
        permissionSet(authContext),
        now,
      ),
      server_time: now.toISOString(),
    };
  }

  private requirePermission(authContext: AuthContext, permission: string): string {
    if (!authContext.tenantId || !hasPermission(authContext, permission)) {
      throw Errors.forbidden();
    }
    return authContext.tenantId;
  }

  private requireWrite(authContext: AuthContext) {
    const tenantId = this.requirePermission(authContext, APPLY_PERMISSION);
    if (!authContext.employeeId) throw Errors.forbidden();
    return { tenantId, employeeId: authContext.employeeId };
  }
}

function hasPermission(authContext: AuthContext, permission: string): boolean {
  return authContext.permissions.some((item) => item.code === permission);
}

function permissionSet(authContext: AuthContext): ReadonlySet<string> {
  return new Set(authContext.permissions.map((item) => item.code));
}

function trialNotFound() {
  return Errors.business(
    404,
    '技术服务试用不存在',
    'SERVICE_TRIAL_NOT_FOUND',
  );
}

export const tenantServiceTrialService = new TenantServiceTrialService();
