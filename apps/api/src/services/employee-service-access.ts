import type {
  EmployeeServiceAccessAction,
  EmployeeServiceAccessSummary,
  PlatformServiceTrialStatus,
} from "@gooes/domain";

import {
  tenantServiceAccessRepository,
  type TenantServiceAccessFacts,
  type TenantServiceAccessRepositoryPort,
} from "@/repositories/tenant-service-access";
import { platformServiceTrialRollout } from "@/services/platform-service-trial-rollout";
import {
  tenantServiceAccessService,
  type TenantServiceAccessDecision,
} from "@/services/tenant-service-access";

const WORKSPACE_PATH = "/pages/index/index";
const TRIAL_LIST_PATH = "/packageEmployees/pages/platformServiceTrials/index";
const TRIAL_APPLY_PATH =
  "/packageEmployees/pages/platformServiceTrialApply/index";
const TRIAL_DETAIL_PATH =
  "/packageEmployees/pages/platformServiceTrialDetail/index";
const PURCHASE_PATH =
  "/packageEmployees/pages/platformServicePaymentSmoke/index";

type ResolveEmployeeServiceAccessInput = {
  tenantId: string;
  permissionCodes: readonly string[];
};

type FactsResolver = (
  facts: TenantServiceAccessFacts,
  trialAccessEnabled: boolean,
) => TenantServiceAccessDecision;

export type EmployeeServiceAccessServiceDependencies = {
  repository?: TenantServiceAccessRepositoryPort;
  resolveFacts?: FactsResolver;
  trialAccessEnabled?: () => Promise<boolean>;
  trialApplicationEnabled?: () => Promise<boolean>;
};

export class EmployeeServiceAccessService {
  private readonly repository: TenantServiceAccessRepositoryPort;
  private readonly resolveFacts: FactsResolver;
  private readonly trialAccessEnabled: () => Promise<boolean>;
  private readonly trialApplicationEnabled: () => Promise<boolean>;

  constructor(dependencies: EmployeeServiceAccessServiceDependencies = {}) {
    this.repository = dependencies.repository ?? tenantServiceAccessRepository;
    this.resolveFacts = dependencies.resolveFacts ?? ((facts, enabled) =>
      tenantServiceAccessService.resolveFactsForRoute(facts, enabled, {
        routeAccess: "session",
      }));
    this.trialAccessEnabled = dependencies.trialAccessEnabled
      ?? (() => platformServiceTrialRollout.isAccessEnabled());
    this.trialApplicationEnabled = dependencies.trialApplicationEnabled
      ?? (() => platformServiceTrialRollout.isApplicationEnabled());
  }

  async resolve(
    input: ResolveEmployeeServiceAccessInput,
  ): Promise<EmployeeServiceAccessSummary> {
    const facts = await this.repository.getAccessFacts({
      tenantId: input.tenantId,
    });
    const trialEnabled = facts.currentTrial
      ? await this.trialAccessEnabled()
      : false;
    const decision = this.resolveFacts(facts, trialEnabled);
    const mayApply = decision.mode === "service_blocked"
      && canOfferApplication(facts.latestTrial?.status ?? null)
      && input.permissionCodes.includes("billing.service_trial.apply")
      && await this.trialApplicationEnabled();

    return projectEmployeeServiceAccess(facts, decision, mayApply);
  }
}

function canOfferApplication(status: PlatformServiceTrialStatus | null) {
  return status === null
    || status === "rejected"
    || status === "withdrawn"
    || status === "revoked";
}

export const employeeServiceAccessService = new EmployeeServiceAccessService();

function projectEmployeeServiceAccess(
  facts: TenantServiceAccessFacts,
  decision: TenantServiceAccessDecision,
  mayApply: boolean,
): EmployeeServiceAccessSummary {
  const trial = facts.latestTrial ?? facts.currentTrial;
  const base = {
    access_mode: decision.mode,
    access_level: decision.accessLevel,
    trial_id: trial?.id ?? null,
    trial_status: trial?.status ?? null,
    starts_at: decision.startsAt ?? trial?.starts_at ?? null,
    ends_at: decision.endsAt ?? trial?.grace_ends_at ?? null,
    evaluated_at: facts.evaluatedAt,
  } as const;

  if (decision.mode === "hard_blocked") {
    return blockedSummary(base, "hard_blocked", {
      title: "企业账号暂不可用",
      message: "当前企业状态不可用，请联系平台确认后再重试。",
      primary: action("contact_platform", "联系平台", null),
      secondary: action("refresh", "刷新状态", null),
    });
  }
  if (["paid", "paid_onboarding", "trial", "legacy"].includes(decision.mode)) {
    return {
      ...base,
      can_enter_workspace: true,
      readonly: false,
      access_status: "workspace_available",
      title: "服务已可用",
      message: "当前企业服务可正常使用。",
      primary_action: action("enter_workspace", "进入工作台", WORKSPACE_PATH),
      secondary_action: trial
        ? action("view_trial", "查看试用", trialDetailPath(trial.id))
        : null,
    };
  }
  if (decision.mode === "grace") {
    return {
      ...base,
      can_enter_workspace: true,
      readonly: true,
      access_status: "grace_period",
      title: "服务处于只读宽限期",
      message: "可继续查看已有数据，写入操作已受限；建议尽快购买正式服务。",
      primary_action: action(
        "enter_readonly_workspace",
        "只读进入工作台",
        WORKSPACE_PATH,
      ),
      secondary_action: action("purchase_service", "购买正式服务", PURCHASE_PATH),
    };
  }

  return projectServiceBlocked(base, facts.latestTrial?.status ?? null, mayApply);
}

type SummaryBase = Pick<
  EmployeeServiceAccessSummary,
  | "access_mode"
  | "access_level"
  | "trial_id"
  | "trial_status"
  | "starts_at"
  | "ends_at"
  | "evaluated_at"
>;

function projectServiceBlocked(
  base: SummaryBase,
  status: PlatformServiceTrialStatus | null,
  mayApply: boolean,
): EmployeeServiceAccessSummary {
  if (status === "pending_review") {
    return blockedSummary(base, "pending_review", {
      title: "试用申请审核中",
      message: "平台正在审核试用申请，审核结果以后端状态为准。",
      primary: trialAction(base.trial_id),
      secondary: action("refresh", "刷新状态", null),
    });
  }
  if (status === "scheduled") {
    return blockedSummary(base, "scheduled", {
      title: "试用已批准，等待生效",
      message: "试用将在后端记录的开始时间自动生效，无需创建试用订单。",
      primary: trialAction(base.trial_id),
      secondary: action("refresh", "刷新状态", null),
    });
  }
  if (status === "expired") {
    return blockedSummary(base, "expired", {
      title: "试用服务已到期",
      message: "试用和宽限期均已结束，可购买正式平台技术服务。",
      primary: action("purchase_service", "购买正式服务", PURCHASE_PATH),
      secondary: trialAction(base.trial_id),
    });
  }
  if (mayApply) {
    return blockedSummary(base, "service_blocked", {
      title: "尚未开通平台技术服务",
      message: "可申请试用或直接购买正式平台技术服务。",
      primary: action("apply_trial", "申请试用", TRIAL_APPLY_PATH),
      secondary: action("purchase_service", "购买正式服务", PURCHASE_PATH),
    });
  }
  return blockedSummary(base, "service_blocked", {
    title: "平台技术服务未开通",
    message: status === "converted"
      ? "试用已标记为转正式，但当前未发现可用正式服务，请联系平台核查。"
      : "当前没有可用的平台技术服务，请购买正式服务或联系管理员。",
    primary: action("purchase_service", "购买正式服务", PURCHASE_PATH),
    secondary: status && base.trial_id
      ? trialAction(base.trial_id)
      : action("contact_platform", "联系平台", null),
  });
}

function blockedSummary(
  base: SummaryBase,
  accessStatus: Exclude<
    EmployeeServiceAccessSummary["access_status"],
    "workspace_available" | "grace_period"
  >,
  content: {
    title: string;
    message: string;
    primary: EmployeeServiceAccessAction | null;
    secondary: EmployeeServiceAccessAction | null;
  },
): EmployeeServiceAccessSummary {
  return {
    ...base,
    can_enter_workspace: false,
    readonly: false,
    access_status: accessStatus,
    title: content.title,
    message: content.message,
    primary_action: content.primary,
    secondary_action: content.secondary,
  };
}

function action(
  key: EmployeeServiceAccessAction["key"],
  label: string,
  path: string | null,
): EmployeeServiceAccessAction {
  return { key, label, path };
}

function trialAction(trialId: string | null) {
  return trialId
    ? action("view_trial", "查看试用", trialDetailPath(trialId))
    : action("view_trial", "查看试用", TRIAL_LIST_PATH);
}

function trialDetailPath(trialId: string) {
  return `${TRIAL_DETAIL_PATH}?id=${encodeURIComponent(trialId)}`;
}
