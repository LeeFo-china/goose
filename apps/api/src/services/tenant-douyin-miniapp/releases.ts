import { randomUUID } from "node:crypto";

import { Errors } from "@/errors/error-factory";
import type {
  DouyinMiniappReleaseTarget,
} from "@/repositories/douyin-miniapp-installations";
import type {
  DouyinMiniappReleaseRecord,
  DouyinMiniappReleasesRepository,
} from "@/repositories/douyin-miniapp-releases";
import {
  tenantDouyinMiniappWorkspaceRepository,
  type TenantDouyinMiniappWorkspaceInstallation,
  type TenantDouyinMiniappWorkspaceProfile,
} from "@/repositories/tenant-douyin-miniapp-workspace";
import type { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";
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

const READ_PERMISSION = "douyin_miniapp.read";
const MANAGE_PERMISSION = "douyin_miniapp.manage";
const AUDIT_PERMISSION = "douyin_miniapp.audit.submit";

type WorkspacePort = Pick<
  typeof tenantDouyinMiniappWorkspaceRepository,
  "findCurrentInstallation" | "findProfile"
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
type AccessPolicyPort = Pick<
  typeof accessPolicyService,
  "assertTenantContext" | "assertPermission"
>;
type OperationsPort = Pick<
  PlatformDouyinMiniappReleaseOperations,
  "getTestQr" | "submitAudit" | "syncStatus"
>;
type ReleaseTarget = DouyinMiniappReleaseTarget & {
  readonly deployment_key: string;
};

export type TenantDouyinMiniappReleasesDependencies = {
  readonly workspace: WorkspacePort;
  readonly installations: InstallationPort;
  readonly releases: ReleasePort;
  readonly accessPolicy: AccessPolicyPort;
  readonly operations: OperationsPort;
};

export class TenantDouyinMiniappReleasesService {
  constructor(
    private readonly dependencies: TenantDouyinMiniappReleasesDependencies,
  ) {}

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
  if (profile?.status === "published" && release.test_qr_url) return;
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
    });
  }).catch((error: unknown) => {
    defaultServicePromise = undefined;
    throw error;
  });
}
