import { randomUUID } from "node:crypto";
import { isDouyinTestQrUrlUsable } from "@gooes/domain";

import { Errors } from "@/errors/error-factory";
import type {
  DouyinMiniappReleaseTarget,
} from "@/repositories/douyin-miniapp-installations";
import type {
  DouyinMiniappReleaseRecord,
  DouyinMiniappReleasesRepository,
} from "@/repositories/douyin-miniapp-releases";
import {
  douyinDeployableTemplatesRepository,
  type DouyinDeployableTemplatesRepository,
} from "@/repositories/douyin-deployable-templates";
import {
  tenantDouyinMiniappWorkspaceRepository,
  type TenantDouyinMiniappWorkspaceInstallation,
  type TenantDouyinMiniappWorkspaceProfile,
} from "@/repositories/tenant-douyin-miniapp-workspace";
import type { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";
import {
  assertDouyinReleaseReady,
  douyinReleaseReadinessService,
  type DouyinReleaseReadinessService,
} from "@/services/douyin-release-readiness";
import { PlatformDouyinMiniappReleaseOperations } from
  "@/services/platform-douyin-miniapp-releases/operation-service";
import {
  AuditInputSchema,
  hasDevelopmentPermission,
  installationNotFound,
  installationStateConflict,
  ListQuerySchema,
  parseRequest,
  releaseNotFound,
  repositoryResponseError,
  type PlatformDouyinMiniappReleaseAuditInput,
  type PlatformDouyinMiniappReleaseListQuery,
} from "@/services/platform-douyin-miniapp-releases/support";
import { compareDouyinTemplateVersion } from "./template-version";

const READ_PERMISSION = "douyin_miniapp.read";
const MANAGE_PERMISSION = "douyin_miniapp.manage";
const AUDIT_PERMISSION = "douyin_miniapp.audit.submit";
const PUBLISH_PERMISSION = "douyin_miniapp.publish";

type WorkspacePort = Pick<
  typeof tenantDouyinMiniappWorkspaceRepository,
  "findCurrentInstallation" | "findProfile" | "findLatestRelease"
>;
type InstallationPort = {
  findReleaseTargetById(
    installationId: string,
  ): Promise<DouyinMiniappReleaseTarget | null>;
};
type ReleasePort = Pick<
  DouyinMiniappReleasesRepository,
  "listByInstallation" | "findById"
>;
type TemplatePort = Pick<DouyinDeployableTemplatesRepository, "findCurrent">;
type AccessPolicyPort = Pick<
  typeof accessPolicyService,
  "assertTenantContext" | "assertPermission"
>;
type OperationsPort = Pick<
  PlatformDouyinMiniappReleaseOperations,
  "upload" | "getTestQr" | "submitAudit" | "syncStatus" | "publish"
>;
type ReadinessPort = Pick<DouyinReleaseReadinessService, "evaluateTenant">;
type ReleaseTarget = DouyinMiniappReleaseTarget & {
  readonly deployment_key: string;
};

export type TenantDouyinMiniappReleasesDependencies = {
  readonly workspace: WorkspacePort;
  readonly installations: InstallationPort;
  readonly releases: ReleasePort;
  readonly accessPolicy: AccessPolicyPort;
  readonly operations: OperationsPort;
  readonly templates: TemplatePort;
  readonly readiness?: ReadinessPort;
};

export class TenantDouyinMiniappReleasesService {
  private readonly readiness: ReadinessPort;

  constructor(
    private readonly dependencies: TenantDouyinMiniappReleasesDependencies,
  ) {
    this.readiness = dependencies.readiness ?? douyinReleaseReadinessService;
  }

  async list(
    authContext: AuthContext,
    input: PlatformDouyinMiniappReleaseListQuery,
  ) {
    const context = await this.requireTenantTarget(
      authContext,
      READ_PERMISSION,
    );
    const query = parseRequest(ListQuerySchema, input);
    const result = await this.dependencies.releases.listByInstallation({
      installationId: context.installation.id,
      page: query.page,
      pageSize: query.pageSize,
    });
    if (!Number.isInteger(result.total) || result.total < 0) {
      throw repositoryResponseError();
    }
    return {
      list: result.list.map(sanitizeRelease),
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total: result.total,
        totalPages: result.total === 0
          ? 0
          : Math.ceil(result.total / query.pageSize),
      },
    };
  }

  async createFromCurrentTemplate(authContext: AuthContext) {
    const context = await this.requireTenantTarget(
      authContext,
      MANAGE_PERMISSION,
    );
    const latestRelease = await this.dependencies.workspace.findLatestRelease(
      context.installation.id,
    );
    let delivery;
    if (latestRelease?.status === "created") {
      const persistedRelease = await this.dependencies.releases.findById(
        latestRelease.id,
      );
      if (
        !persistedRelease
        || persistedRelease.installation_id !== context.installation.id
      ) {
        throw releaseNotFound();
      }
      if (![
        "created",
        "uploaded",
        "testing",
      ].includes(persistedRelease.status)) {
        throw tenantReleaseInProgress();
      }
      delivery = {
        template_id: persistedRelease.template_id,
        template_version: persistedRelease.template_version,
        description: persistedRelease.description,
        channel: persistedRelease.channel,
      };
    } else {
      delivery = await this.currentTemplateDelivery(latestRelease);
    }
    const uploaded = await this.dependencies.operations.upload(
      context.installation,
      context.installation.id,
      context.operatorId,
      delivery,
    );
    const testing = await this.dependencies.operations.getTestQr(
      context.installation,
      uploaded,
      context.operatorId,
    );
    return sanitizeRelease(testing);
  }

  private async currentTemplateDelivery(
    latestRelease: {
      readonly status: DouyinMiniappReleaseRecord["status"];
      readonly template_version: string;
    } | null,
  ) {
    if (latestRelease && [
      "audit_pending",
      "audit_approved",
    ].includes(latestRelease.status)) {
      throw tenantReleaseInProgress();
    }
    const template = await this.dependencies.templates.findCurrent("default");
    if (!template) {
      throw Errors.business(
        409,
        "平台尚未确认可发布的抖音模板",
        "DOUYIN_DEPLOYABLE_TEMPLATE_NOT_FOUND",
      );
    }
    if (
      latestRelease
      && !isNewerTemplateVersion(
        template.template_version,
        latestRelease.template_version,
      )
    ) {
      throw Errors.business(
        409,
        "平台当前可发布模板不是新版，请先确认新的抖音模板版本",
        "DOUYIN_DEPLOYABLE_TEMPLATE_VERSION_NOT_NEW",
      );
    }
    return {
      template_id: template.template_id,
      template_version: template.template_version,
      description: template.description,
      channel: template.channel,
    };
  }

  async getTestQr(authContext: AuthContext, releaseId: string) {
    const context = await this.requireOwnedRelease(
      authContext,
      MANAGE_PERMISSION,
      releaseId,
    );
    const result = await this.dependencies.operations.getTestQr(
      context.installation,
      context.release,
      context.operatorId,
    );
    return sanitizeRelease(result);
  }

  async submitAudit(
    authContext: AuthContext,
    releaseId: string,
    input: PlatformDouyinMiniappReleaseAuditInput,
  ) {
    const auditInput = parseRequest(AuditInputSchema, input);
    const context = await this.requireOwnedRelease(
      authContext,
      AUDIT_PERMISSION,
      releaseId,
    );
    const profile = await this.dependencies.workspace.findProfile(
      context.tenantId,
    );
    assertAuditPreflight(profile, context.release);
    assertDouyinReleaseReady(
      await this.readiness.evaluateTenant(context.tenantId, auditInput.host_names),
    );
    const result = await this.dependencies.operations.submitAudit(
      context.installation,
      context.installation.id,
      context.release,
      context.operatorId,
      auditInput,
    );
    return sanitizeRelease(result);
  }

  async syncStatus(authContext: AuthContext, releaseId: string) {
    const context = await this.requireOwnedRelease(
      authContext,
      MANAGE_PERMISSION,
      releaseId,
    );
    const result = await this.dependencies.operations.syncStatus(
      context.installation,
      context.installation.id,
      context.release,
      context.operatorId,
    );
    return sanitizeRelease(result);
  }

  async publish(authContext: AuthContext, releaseId: string) {
    const context = await this.requireOwnedRelease(
      authContext,
      PUBLISH_PERMISSION,
      releaseId,
    );
    const result = await this.dependencies.operations.publish(
      context.installation,
      context.installation.id,
      context.release,
      context.operatorId,
    );
    return sanitizeRelease(result);
  }

  private async requireOwnedRelease(
    authContext: AuthContext,
    permission: string,
    releaseId: string,
  ) {
    const context = await this.requireTenantTarget(authContext, permission);
    const release = await this.dependencies.releases.findById(releaseId);
    if (
      !release
      || release.installation_id !== context.installation.id
    ) {
      throw releaseNotFound();
    }
    return { ...context, release };
  }

  private async requireTenantTarget(
    authContext: AuthContext,
    permission: string,
  ): Promise<{
    readonly tenantId: string;
    readonly operatorId: string;
    readonly installation: ReleaseTarget;
  }> {
    const tenantId =
      this.dependencies.accessPolicy.assertTenantContext(authContext);
    this.dependencies.accessPolicy.assertPermission(authContext, permission);
    const operatorId = requireOperator(authContext);
    const current = await this.dependencies.workspace.findCurrentInstallation(
      tenantId,
    );
    if (!current) throw installationNotFound();
    assertActiveCurrentInstallation(current);

    const target =
      await this.dependencies.installations.findReleaseTargetById(current.id);
    if (
      !target
      || target.id !== current.id
      || target.authorizer_appid !== current.authorizer_appid
      || target.authorization_status !== "active"
      || target.installation_kind !== "merchant"
      || !target.deployment_key
      || !hasDevelopmentPermission(target.permission_snapshot)
    ) {
      throw installationStateConflict();
    }
    return {
      tenantId,
      operatorId,
      installation: { ...target, deployment_key: target.deployment_key },
    };
  }
}

function tenantReleaseInProgress() {
  return Errors.business(
    409,
    "当前版本正在审核或等待发布，请完成后再生成新版体验版",
    "DOUYIN_TENANT_RELEASE_IN_PROGRESS",
  );
}

function requireOperator(authContext: AuthContext): string {
  if (!authContext.employeeId) throw Errors.forbidden();
  return authContext.employeeId;
}

function assertActiveCurrentInstallation(
  installation: TenantDouyinMiniappWorkspaceInstallation,
): void {
  if (
    installation.installation_kind !== "merchant"
    || installation.authorization_status !== "active"
  ) {
    throw installationStateConflict();
  }
}

function assertAuditPreflight(
  profile: TenantDouyinMiniappWorkspaceProfile | null,
  release: DouyinMiniappReleaseRecord,
): void {
  if (
    profile?.status === "published"
    && isDouyinTestQrUrlUsable(release.test_qr_url)
  ) {
    return;
  }
  throw Errors.business(
    409,
    "请先发布公开资料并生成体验二维码",
    "DOUYIN_TENANT_AUDIT_PREFLIGHT_INCOMPLETE",
  );
}

function sanitizeRelease(release: DouyinMiniappReleaseRecord) {
  return {
    id: release.id,
    installation_id: release.installation_id,
    template_id: release.template_id,
    template_version: release.template_version,
    description: release.description,
    status: release.status,
    test_qr_url: release.test_qr_url,
    audit_host_names: release.audit_host_names,
    audit_note: release.audit_note,
    audit_result: release.audit_result,
    submitted_at: release.submitted_at,
    audited_at: release.audited_at,
    released_at: release.released_at,
    created_at: release.created_at,
    updated_at: release.updated_at,
  };
}

let defaultServicePromise:
Promise<TenantDouyinMiniappReleasesService> | undefined;

export async function getTenantDouyinMiniappReleasesService():
Promise<TenantDouyinMiniappReleasesService> {
  return defaultServicePromise ??= Promise.all([
    import("@/services/platform-douyin-miniapp-releases/default-service"),
    import("@/services/access-policy"),
  ]).then(([{ createDefaultReleaseDependencies }, { accessPolicyService }]) => {
    const dependencies = createDefaultReleaseDependencies();
    const operations = new PlatformDouyinMiniappReleaseOperations({
      ...dependencies,
      now: () => new Date().toISOString(),
      claimToken: randomUUID,
    });
    return new TenantDouyinMiniappReleasesService({
      workspace: tenantDouyinMiniappWorkspaceRepository,
      installations: dependencies.installationRepository,
      releases: dependencies.releaseRepository,
      accessPolicy: accessPolicyService,
      operations,
      templates: douyinDeployableTemplatesRepository,
    });
  }).catch((error: unknown) => {
    defaultServicePromise = undefined;
    throw error;
  });
}

function isNewerTemplateVersion(current: string, latest: string): boolean {
  const compared = compareDouyinTemplateVersion(current, latest);
  return compared !== null && compared > 0;
}
