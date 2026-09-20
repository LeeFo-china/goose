import { randomUUID } from "node:crypto";
import { isDouyinTestQrUrlUsable } from "@gooes/domain";

import { Errors } from "@/errors/error-factory";
import type { DouyinMiniappReleaseGateway } from "@/gateways/douyin-open-platform/client";
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
import type { DouyinMiniappAccessTokenService } from "@/services/douyin-miniapp/access-tokens";
import {
  TenantDouyinReleaseOptionsQuerySchema,
  type TenantDouyinCreateReleaseInput,
  type TenantDouyinReleaseOptionsQuery,
} from "@/schema/tenant-douyin-miniapp";
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
import { buildPagination, buildTenantDouyinReleaseOptions } from "./release-options";
import { TenantDouyinTemplateReleaseCreator } from "./release-creation";

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
type TemplatePort = Pick<DouyinDeployableTemplatesRepository,
  "findCurrent" | "findSelectableById" | "listSelectable">;
type AccessPolicyPort = Pick<
  typeof accessPolicyService,
  "assertTenantContext" | "assertPermission"
>;
type OperationsPort = Pick<
  PlatformDouyinMiniappReleaseOperations,
  "upload" | "getTestQr" | "getAuditQr" | "submitAudit" | "syncStatus" | "publish"
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
  readonly accessTokens: Pick<DouyinMiniappAccessTokenService, "getAuthorizerAccessToken">;
  readonly gateway: Pick<DouyinMiniappReleaseGateway, "getVersionList">;
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
      pagination: buildPagination(query.page, query.pageSize, result.total),
    };
  }

  async listOptions(authContext: AuthContext, input: TenantDouyinReleaseOptionsQuery) {
    const query = parseRequest(TenantDouyinReleaseOptionsQuerySchema, input);
    const context = await this.requireTenantTarget(authContext, READ_PERMISSION);
    const [result, templates] = await Promise.all([
      this.dependencies.releases.listByInstallation({
        installationId: context.installation.id, page: query.page, pageSize: query.pageSize,
      }),
      this.dependencies.templates.listSelectable({
        channel: "default", page: query.templatePage, pageSize: query.templatePageSize,
      }),
    ]);
    if (!Number.isInteger(result.total) || result.total < 0) throw repositoryResponseError();
    if (!Number.isInteger(templates.total) || templates.total < 0) throw repositoryResponseError();
    let versions = null;
    let providerState = "fresh" as "fresh" | "unavailable";
    try {
      const authorizerAccessToken = await this.dependencies.accessTokens
        .getAuthorizerAccessToken({
          authorizerAppId: context.installation.authorizer_appid,
          deploymentKey: context.installation.deployment_key,
        });
      versions = await this.dependencies.gateway.getVersionList({
        authorizerAccessToken, appId: context.installation.authorizer_appid,
      });
    } catch {
      providerState = "unavailable";
    }
    return {
      list: buildTenantDouyinReleaseOptions({
        templates: templates.list, releases: result.list, versions,
      }),
      provider_state: providerState,
      provider_message: providerState === "fresh"
        ? null : "暂时无法同步抖音平台版本，仍可查看本地发布记录",
      history: result.list.map(sanitizeRelease),
      pagination: buildPagination(query.page, query.pageSize, result.total),
      template_pagination: buildPagination(
        query.templatePage, query.templatePageSize, templates.total,
      ),
    };
  }

  async createFromCurrentTemplate(
    authContext: AuthContext,
    input: TenantDouyinCreateReleaseInput,
  ) {
    const context = await this.requireTenantTarget(
      authContext,
      MANAGE_PERMISSION,
    );
    return sanitizeRelease(await this.releaseCreator().createCurrent(context, input));
  }

  async createFromTemplate(
    authContext: AuthContext,
    input: TenantDouyinCreateReleaseInput,
  ) {
    const context = await this.requireTenantTarget(authContext, MANAGE_PERMISSION);
    return sanitizeRelease(await this.releaseCreator().createSelected(context, input));
  }

  private releaseCreator() {
    return new TenantDouyinTemplateReleaseCreator(this.dependencies);
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

  async getAuditQr(authContext: AuthContext, releaseId: string) {
    const context = await this.requireOwnedRelease(
      authContext,
      MANAGE_PERMISSION,
      releaseId,
    );
    const result = await this.dependencies.operations.getAuditQr(
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
    && isDouyinTestQrUrlUsable(release.latest_test_qr_url ?? release.test_qr_url)
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
    latest_test_qr_url: release.latest_test_qr_url,
    audit_qr_url: release.audit_qr_url,
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
      accessTokens: dependencies.accessTokens,
      gateway: dependencies.gateway,
    });
  }).catch((error: unknown) => {
    defaultServicePromise = undefined;
    throw error;
  });
}
