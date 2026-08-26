import {
  DouyinReleaseReadinessSchema,
  type DouyinReleaseBlockerCode,
  type DouyinReleaseReadiness,
  type DouyinReleaseWarningCode,
} from "@gooes/domain";

import { Errors } from "@/errors/error-factory";
import {
  douyinReleaseReadinessRepository,
  type DouyinReleaseReadinessRepository,
} from "@/repositories/douyin-release-readiness";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";
import { isPhoneLoginWithoutCodeEnabled } from "@/utils/auth/test-login";

type TenantStatus = "active" | "suspended" | "archived";
type InstallationStatus = "active" | "disabled" | "revoked";
type InstallationKind = "merchant" | "template_development";
type ProjectPhase = "in_progress" | "completed";

export interface DouyinReleaseReadinessProjectFact {
  readonly id: string;
  readonly phase: ProjectPhase;
  readonly title: string | null;
  readonly description: string | null;
  readonly area: number | null;
  readonly layout: string | null;
  readonly style: string | null;
  readonly budgetBand: string | null;
  readonly imageCount: number;
  readonly publicLogCount: number;
}

export interface DouyinReleaseReadinessFacts {
  readonly tenant: {
    readonly id: string;
    readonly name: string;
    readonly status: TenantStatus;
  } | null;
  readonly installation: {
    readonly id: string;
    readonly authorizationStatus: InstallationStatus;
    readonly installationKind: InstallationKind;
  } | null;
  readonly profile: {
    readonly status: "draft" | "pending_review" | "published" | "suspended";
    readonly publicName: string | null;
    readonly introduction: string | null;
    readonly publicPhone: string | null;
    readonly logoUrl: string | null;
  } | null;
  readonly activeServiceAreaCount: number;
  readonly projects: readonly DouyinReleaseReadinessProjectFact[];
  readonly activePricingVersion: {
    readonly id: string;
    readonly versionNo: number;
    readonly disclaimer: string | null;
  } | null;
  readonly smsReady: boolean;
  readonly privacyVersion: string | null;
  readonly requiredHosts: readonly string[];
}

type Blocker = DouyinReleaseReadiness["blockers"][number];
type Warning = DouyinReleaseReadiness["warnings"][number];
type RepositoryPort = Pick<DouyinReleaseReadinessRepository, "loadFacts">;
type AccessPolicyPort = Pick<
  typeof accessPolicyService,
  "assertTenantContext" | "assertPermission"
>;
type ServiceDependencies = {
  readonly repository?: RepositoryPort;
  readonly accessPolicy?: AccessPolicyPort;
  readonly now?: () => Date;
  readonly requiredHosts?: () => readonly string[];
  readonly smsReadinessBypass?: () => boolean;
};

const MIN_PUBLIC_PROJECTS = 6;
const MIN_PHASE_PROJECTS = 2;
const MIN_PROJECT_IMAGES = 3;
const MIN_IN_PROGRESS_LOGGED_PROJECTS = 2;
const MIN_PROFILE_INTRODUCTION_LENGTH = 80;
const TEST_CONTENT_PATTERN = /e2e|smoke|测试|可删除|\d{10,}/i;
const MAINLAND_PHONE_PATTERN =
  /(?:\+?86[-\s]?)?1[3-9]\d[-\s]?\d{4}[-\s]?\d{4}/;
const ROOM_PATTERN =
  /\d{1,3}\s*(?:号楼|栋|幢|单元)|\d{3,4}\s*室|\d{1,3}楼\d{1,4}/;
const READ_PERMISSION = "douyin_miniapp.read";

export class DouyinReleaseReadinessService {
  private readonly repository: RepositoryPort;
  private readonly accessPolicy: AccessPolicyPort;
  private readonly now: () => Date;
  private readonly requiredHosts: () => readonly string[];
  private readonly smsReadinessBypass: () => boolean;

  constructor(dependencies: ServiceDependencies = {}) {
    this.repository = dependencies.repository ?? douyinReleaseReadinessRepository;
    this.accessPolicy = dependencies.accessPolicy ?? accessPolicyService;
    this.now = dependencies.now ?? (() => new Date());
    this.requiredHosts = dependencies.requiredHosts
      ?? (() => parseDouyinReleaseRequiredHosts(
        process.env.DOUYIN_RELEASE_REQUIRED_HOSTS,
      ));
    this.smsReadinessBypass = dependencies.smsReadinessBypass
      ?? isPhoneLoginWithoutCodeEnabled;
  }

  async getReadiness(authContext: AuthContext): Promise<DouyinReleaseReadiness> {
    const tenantId = this.accessPolicy.assertTenantContext(authContext);
    this.accessPolicy.assertPermission(authContext, READ_PERMISSION);
    return this.evaluateTenant(tenantId, this.requiredHosts());
  }

  async evaluateTenant(
    tenantId: string,
    requiredHosts: readonly string[],
  ): Promise<DouyinReleaseReadiness> {
    const now = this.now();
    const facts = await this.repository.loadFacts({
      tenantId,
      now: now.toISOString(),
      requiredHosts,
    });
    return evaluateDouyinReleaseReadiness(
      this.smsReadinessBypass() ? { ...facts, smsReady: true } : facts,
      now,
    );
  }
}

export const douyinReleaseReadinessService =
  new DouyinReleaseReadinessService();

export function parseDouyinReleaseRequiredHosts(
  value: string | undefined,
): string[] {
  if (!value) return [];
  return Array.from(new Set(
    value
      .split(/[\n,，]/)
      .map((entry) => entry.trim())
      .filter(Boolean),
  ));
}

export function evaluateDouyinReleaseReadiness(
  facts: DouyinReleaseReadinessFacts,
  now: Date,
): DouyinReleaseReadiness {
  const blockers: Blocker[] = [];
  const warnings: Warning[] = [];
  const tenant = facts.tenant ?? {
    id: "00000000-0000-4000-8000-000000000000",
    name: "未知租户",
    status: "archived" as const,
  };

  if (!facts.installation) {
    blockers.push(blocker("INSTALLATION_MISSING", "未绑定抖音小程序"));
  } else if (
    facts.installation.authorizationStatus !== "active" ||
    facts.installation.installationKind !== "merchant"
  ) {
    blockers.push(blocker("INSTALLATION_INACTIVE", "抖音小程序授权不可用"));
  }
  if (tenant.status !== "active") {
    blockers.push(blocker("TENANT_INACTIVE", "租户当前不可用"));
  }

  evaluateProfile(facts, blockers);
  evaluateProjects(facts.projects, blockers, warnings);
  evaluatePricing(facts, blockers);
  if (!facts.smsReady) {
    blockers.push(blocker("SMS_UNAVAILABLE", "短信验证码服务不可用"));
  }
  if (!facts.privacyVersion?.trim()) {
    blockers.push(blocker("PRIVACY_VERSION_MISSING", "隐私协议版本未配置"));
  }
  if (facts.requiredHosts.length === 0) {
    blockers.push(blocker("HOST_CONFIGURATION_MISSING", "提审宿主未配置"));
  }

  return DouyinReleaseReadinessSchema.parse({
    ready: blockers.length === 0,
    checked_at: now.toISOString(),
    tenant: { id: tenant.id, name: tenant.name },
    blockers,
    warnings,
    metrics: metrics(facts),
  });
}

export function assertDouyinReleaseReady(
  readiness: DouyinReleaseReadiness,
): void {
  if (readiness.ready) return;
  throw Errors.business(
    409,
    "抖音小程序尚未达到提审条件",
    "DOUYIN_RELEASE_NOT_READY",
    { blocker_codes: readiness.blockers.map((item) => item.code) },
  );
}

function evaluateProfile(
  facts: DouyinReleaseReadinessFacts,
  blockers: Blocker[],
): void {
  const profile = facts.profile;
  if (!profile || profile.status !== "published") {
    blockers.push(blocker("PUBLIC_PROFILE_MISSING", "公开公司资料未发布"));
    return;
  }
  const incomplete =
    !profile.publicName?.trim() ||
    !profile.logoUrl?.trim() ||
    !profile.publicPhone?.trim() ||
    (profile.introduction?.trim().length ?? 0) <
      MIN_PROFILE_INTRODUCTION_LENGTH;
  if (incomplete) {
    blockers.push(blocker("PUBLIC_PROFILE_INCOMPLETE", "公开公司资料不完整"));
  }
  if (facts.activeServiceAreaCount < 1) {
    blockers.push(
      blocker("PUBLIC_SERVICE_AREA_MISSING", "至少需要一个启用服务区域"),
    );
  }
}

function evaluateProjects(
  projects: readonly DouyinReleaseReadinessProjectFact[],
  blockers: Blocker[],
  warnings: Warning[],
): void {
  if (projects.length < MIN_PUBLIC_PROJECTS) {
    blockers.push(blocker("PUBLIC_PROJECT_COUNT_LOW", "公开项目数量不足", {
      actual_count: projects.length,
      expected_count: MIN_PUBLIC_PROJECTS,
    }));
  }

  const inProgress = projects.filter((project) => project.phase === "in_progress");
  const completed = projects.filter((project) => project.phase === "completed");
  if (inProgress.length < MIN_PHASE_PROJECTS) {
    blockers.push(blocker(
      "PUBLIC_PROJECT_PHASE_COVERAGE_LOW",
      `施工中项目至少需要 ${MIN_PHASE_PROJECTS} 个，当前 ${inProgress.length} 个`,
      {
        phase: "in_progress",
        actual_count: inProgress.length,
        expected_count: MIN_PHASE_PROJECTS,
      },
    ));
  }

  const incompleteProjectIds = projects
    .filter((project) => !isCompleteProject(project))
    .map((project) => project.id);
  if (incompleteProjectIds.length > 0) {
    blockers.push(blocker(
      "PUBLIC_PROJECT_COMPLETENESS_LOW",
      "公开项目资料或图片不足",
      { project_ids: incompleteProjectIds },
    ));
  }

  const loggedInProgressCount = inProgress.filter(
    (project) => project.publicLogCount > 0,
  ).length;
  if (loggedInProgressCount < MIN_IN_PROGRESS_LOGGED_PROJECTS) {
    blockers.push(blocker(
      "PUBLIC_PROJECT_PROGRESS_LOG_LOW",
      "施工中项目进度记录不足",
      {
        actual_count: loggedInProgressCount,
        expected_count: MIN_IN_PROGRESS_LOGGED_PROJECTS,
      },
    ));
    warnings.push(warning(
      "PUBLIC_PROJECT_LOG_LOW",
      "施工中项目进度记录偏少",
      {
        actual_count: loggedInProgressCount,
        expected_count: MIN_IN_PROGRESS_LOGGED_PROJECTS,
      },
    ));
  }

  const unsafeContentIds = projects
    .filter((project) => hasTestContent(project))
    .map((project) => project.id);
  if (unsafeContentIds.length > 0) {
    blockers.push(blocker(
      "PUBLIC_PROJECT_TEST_CONTENT",
      "公开项目包含测试或临时内容",
      { project_ids: unsafeContentIds },
    ));
  }

  const privacyRiskIds = projects
    .filter((project) => hasPrivacyRisk(project))
    .map((project) => project.id);
  if (privacyRiskIds.length > 0) {
    blockers.push(blocker(
      "PUBLIC_PROJECT_PRIVACY_RISK",
      "公开项目疑似包含联系方式或门牌信息",
      { project_ids: privacyRiskIds },
    ));
  }
}

function evaluatePricing(
  facts: DouyinReleaseReadinessFacts,
  blockers: Blocker[],
): void {
  if (!facts.activePricingVersion) {
    blockers.push(blocker("BUDGET_PRICING_MISSING", "预算报价未启用"));
    return;
  }
  if (!facts.activePricingVersion.disclaimer?.trim()) {
    blockers.push(blocker(
      "BUDGET_PRICING_DISCLAIMER_MISSING",
      "预算报价免责声明未配置",
    ));
  }
}

function isCompleteProject(project: DouyinReleaseReadinessProjectFact): boolean {
  return Boolean(
    project.title?.trim() &&
      project.description?.trim() &&
      project.area &&
      project.area > 0 &&
      project.layout?.trim() &&
      project.style?.trim() &&
      project.budgetBand?.trim() &&
      project.imageCount >= MIN_PROJECT_IMAGES,
  );
}

function hasTestContent(project: DouyinReleaseReadinessProjectFact): boolean {
  return TEST_CONTENT_PATTERN.test(`${project.title ?? ""} ${project.description ?? ""}`);
}

function hasPrivacyRisk(project: DouyinReleaseReadinessProjectFact): boolean {
  const text = `${project.title ?? ""} ${project.description ?? ""}`;
  return MAINLAND_PHONE_PATTERN.test(text) || ROOM_PATTERN.test(text);
}

function metrics(facts: DouyinReleaseReadinessFacts) {
  const inProgressCount = facts.projects.filter(
    (project) => project.phase === "in_progress",
  ).length;
  const completedCount = facts.projects.filter(
    (project) => project.phase === "completed",
  ).length;
  return {
    published_project_count: facts.projects.length,
    in_progress_project_count: inProgressCount,
    completed_project_count: completedCount,
    active_service_area_count: facts.activeServiceAreaCount,
    active_pricing_version: facts.activePricingVersion?.versionNo ?? 0,
    required_host_count: facts.requiredHosts.length,
  } as const;
}

function blocker(
  code: DouyinReleaseBlockerCode,
  message: string,
  details: Blocker["details"] = {},
): Blocker {
  return { severity: "blocker", code, message, details };
}

function warning(
  code: DouyinReleaseWarningCode,
  message: string,
  details: Warning["details"] = {},
): Warning {
  return { severity: "warning", code, message, details };
}
