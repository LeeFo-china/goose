import { ErrorCodes } from "@/errors/error-codes";
import { Errors } from "@/errors/error-factory";
import {
  tenantOnboardingPartnerAssistRepository,
  type TenantOnboardingPartnerAssistRepositoryPort,
  type TenantOnboardingPartnerAssistTaskRecord,
} from "@/repositories/tenant-onboarding-partner-assist";
import type {
  TenantOnboardingPartnerAssistDecisionInput,
  TenantOnboardingPartnerAssistListQuery,
} from "@/schema/tenant-onboarding";
import { requireCurrentPlatformPartnerMember } from "@/services/platform-partner-identity";
import type { JwtPayload } from "@/utils/jwt";

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

type PartnerIdentity = {
  userId: string;
  partnerId: string;
  memberId: string;
};

type TenantOnboardingPartnerAssistServiceDependencies = {
  repository?: TenantOnboardingPartnerAssistRepositoryPort;
  identityResolver?: (user?: JwtPayload) => Promise<PartnerIdentity>;
  clock?: () => Date;
};

export class TenantOnboardingPartnerAssistService {
  private readonly repository: TenantOnboardingPartnerAssistRepositoryPort;
  private readonly identityResolver: (
    user?: JwtPayload,
  ) => Promise<PartnerIdentity>;
  private readonly clock: () => Date;

  constructor(
    dependencies: TenantOnboardingPartnerAssistServiceDependencies = {},
  ) {
    this.repository = dependencies.repository ??
      tenantOnboardingPartnerAssistRepository;
    this.identityResolver = dependencies.identityResolver ??
      requireCurrentPlatformPartnerMember;
    this.clock = dependencies.clock ?? (() => new Date());
  }

  async list(
    user: JwtPayload | undefined,
    query: TenantOnboardingPartnerAssistListQuery,
  ) {
    const identity = await this.identityResolver(user);
    const cutoff = this.clock().toISOString();
    await this.repository.expireDuePartnerAssistTasks({
      partnerId: identity.partnerId,
      cutoff,
    });
    const result = await this.repository.listPartnerAssistTasks({
      partnerId: identity.partnerId,
      page: normalizePage(query.page),
      pageSize: normalizePageSize(query.pageSize),
      cutoff,
      status: query.status,
    });
    return {
      ...result,
      list: result.list.map(maskTask),
    };
  }

  async get(user: JwtPayload | undefined, applicationId: string) {
    const identity = await this.identityResolver(user);
    const cutoff = this.clock().toISOString();
    await this.repository.expireDuePartnerAssistTasks({
      partnerId: identity.partnerId,
      cutoff,
    });
    const task = await this.repository.findPartnerAssistTask({
      applicationId,
      partnerId: identity.partnerId,
      cutoff,
    });
    if (!task) throw applicationNotFoundError();
    return maskTask(task);
  }

  async review(
    user: JwtPayload | undefined,
    applicationId: string,
    input: TenantOnboardingPartnerAssistDecisionInput,
  ) {
    const identity = await this.identityResolver(user);
    const now = this.clock().toISOString();
    const expiredIds = await this.repository.expireDuePartnerAssistTasks({
      partnerId: identity.partnerId,
      cutoff: now,
    });
    if (expiredIds.includes(applicationId)) throw stateConflictError();
    const result = await this.repository.submitPartnerAssist({
      applicationId,
      partnerId: identity.partnerId,
      memberId: identity.memberId,
      decision: input.decision,
      remark: input.remark?.trim() || null,
      expectedVersion: input.version,
      now,
    });
    if (result.status === "updated") return maskTask(result.task);
    if (result.status === "application_not_found") {
      throw applicationNotFoundError();
    }
    throw stateConflictError();
  }
}

function maskTask(task: TenantOnboardingPartnerAssistTaskRecord) {
  return {
    ...task,
    admin_phone: maskPhone(task.admin_phone),
  };
}

function maskPhone(phone: string) {
  return /^1\d{10}$/.test(phone)
    ? `${phone.slice(0, 3)}****${phone.slice(-4)}`
    : "***";
}

function normalizePage(value: number) {
  return Number.isInteger(value) && value > 0 ? value : DEFAULT_PAGE;
}

function normalizePageSize(value: number) {
  return Number.isInteger(value) && value > 0
    ? Math.min(value, MAX_PAGE_SIZE)
    : DEFAULT_PAGE_SIZE;
}

function applicationNotFoundError() {
  return Errors.business(
    404,
    "装企协查任务不存在",
    ErrorCodes.TENANT_ONBOARDING_APPLICATION_NOT_FOUND,
  );
}

function stateConflictError() {
  return Errors.business(
    409,
    "装企协查任务状态或版本已变化，请刷新后重试",
    ErrorCodes.TENANT_ONBOARDING_STATE_CONFLICT,
  );
}

export const tenantOnboardingPartnerAssistService =
  new TenantOnboardingPartnerAssistService();
