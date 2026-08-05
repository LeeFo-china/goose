import { Errors } from "@/errors/error-factory";
import type { DouyinMiniappReleaseGateway } from "@/gateways/douyin-open-platform/client";
import type {
  DouyinMiniappInstallationsRepository,
  DouyinMiniappReleaseTarget,
} from "@/repositories/douyin-miniapp-installations";
import type {
  DouyinMiniappReleaseRecord,
  DouyinMiniappReleasesRepository,
} from "@/repositories/douyin-miniapp-releases";
import type { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";
import type { DouyinMiniappAccessTokenService } from "@/services/douyin-miniapp/access-tokens";
import { PlatformDouyinMiniappReleaseOperations } from "./platform-douyin-miniapp-releases/operation-service";
import {
  AuditInputSchema,
  hasDevelopmentPermission,
  installationNotFound,
  installationStateConflict,
  ListQuerySchema,
  parseRequest,
  releaseNotFound,
  repositoryResponseError,
  UploadInputSchema,
  type PlatformDouyinMiniappReleaseAuditInput,
  type PlatformDouyinMiniappReleaseListQuery,
  type PlatformDouyinMiniappReleaseUploadInput,
} from "./platform-douyin-miniapp-releases/support";

const MANAGE_PERMISSION = "platform.douyin_miniapp.manage";

type InstallationRepositoryPort = Pick<DouyinMiniappInstallationsRepository,
  "findReleaseTargetById" | "syncReleaseMetadata">;
type ReleaseRepositoryPort = Pick<DouyinMiniappReleasesRepository,
  "listByInstallation" | "findById" | "claimOperation" |
  "getOrCreateAndClaimUpload" | "patchClaimed" | "updateClaimed">;
type AccessPolicyPort = Pick<typeof accessPolicyService, "assertPermission">;
type AccessTokenPort = Pick<DouyinMiniappAccessTokenService, "getAuthorizerAccessToken">;

export type PlatformDouyinMiniappReleasesDependencies = {
  readonly installationRepository: InstallationRepositoryPort;
  readonly releaseRepository: ReleaseRepositoryPort;
  readonly accessPolicy: AccessPolicyPort;
  readonly accessTokens: AccessTokenPort;
  readonly gateway: DouyinMiniappReleaseGateway;
  readonly now?: () => string;
  readonly claimToken?: () => string;
};

export type {
  PlatformDouyinMiniappReleaseAuditInput,
  PlatformDouyinMiniappReleaseListQuery,
  PlatformDouyinMiniappReleaseUploadInput,
} from "./platform-douyin-miniapp-releases/support";

type ReleaseTarget = DouyinMiniappReleaseTarget & { readonly deployment_key: string };

export class PlatformDouyinMiniappReleasesService {
  private readonly operations: PlatformDouyinMiniappReleaseOperations;

  constructor(private readonly dependencies: PlatformDouyinMiniappReleasesDependencies) {
    const now = dependencies.now ?? (() => new Date().toISOString());
    const claimToken = dependencies.claimToken ?? (() => crypto.randomUUID());
    this.operations = new PlatformDouyinMiniappReleaseOperations({
      ...dependencies,
      now,
      claimToken,
    });
  }

  async list(
    authContext: AuthContext,
    installationId: string,
    input: PlatformDouyinMiniappReleaseListQuery,
  ) {
    this.assertCanManage(authContext);
    const query = parseRequest(ListQuerySchema, input);
    await this.requireInstallation(installationId);
    const result = await this.dependencies.releaseRepository.listByInstallation({
      installationId,
      page: query.page,
      pageSize: query.pageSize,
    });
    if (!Number.isInteger(result.total) || result.total < 0) throw repositoryResponseError();
    return {
      list: result.list,
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total: result.total,
        totalPages: result.total === 0 ? 0 : Math.ceil(result.total / query.pageSize),
      },
    };
  }

  async upload(
    authContext: AuthContext,
    installationId: string,
    input: PlatformDouyinMiniappReleaseUploadInput,
  ): Promise<DouyinMiniappReleaseRecord> {
    const operatorId = this.requireOperator(authContext);
    const parsed = parseRequest(UploadInputSchema, input);
    const installation = await this.requireReleaseTarget(installationId);
    return this.operations.upload(installation, installationId, operatorId, parsed);
  }

  async getTestQr(
    authContext: AuthContext,
    installationId: string,
    releaseId: string,
  ): Promise<DouyinMiniappReleaseRecord> {
    const operatorId = this.requireOperator(authContext);
    const installation = await this.requireReleaseTarget(installationId);
    const release = await this.requireOwnedRelease(installationId, releaseId);
    return this.operations.getTestQr(installation, release, operatorId);
  }

  async submitAudit(
    authContext: AuthContext,
    installationId: string,
    releaseId: string,
    input: PlatformDouyinMiniappReleaseAuditInput,
  ): Promise<DouyinMiniappReleaseRecord> {
    const operatorId = this.requireOperator(authContext);
    const parsed = parseRequest(AuditInputSchema, input);
    const installation = await this.requireReleaseTarget(installationId);
    const release = await this.requireOwnedRelease(installationId, releaseId);
    return this.operations.submitAudit(installation, installationId, release, operatorId, parsed);
  }

  async syncStatus(
    authContext: AuthContext,
    installationId: string,
    releaseId: string,
  ): Promise<DouyinMiniappReleaseRecord> {
    const operatorId = this.requireOperator(authContext);
    const installation = await this.requireReleaseTarget(installationId);
    const release = await this.requireOwnedRelease(installationId, releaseId);
    return this.operations.syncStatus(installation, installationId, release, operatorId);
  }

  async publish(
    authContext: AuthContext,
    installationId: string,
    releaseId: string,
  ): Promise<DouyinMiniappReleaseRecord> {
    const operatorId = this.requireOperator(authContext);
    const installation = await this.requireReleaseTarget(installationId);
    const release = await this.requireOwnedRelease(installationId, releaseId);
    return this.operations.publish(installation, installationId, release, operatorId);
  }

  private assertCanManage(authContext: AuthContext): void {
    const isPlatformIdentity =
      authContext.isPlatformStaff || authContext.isPlatformAdmin;
    if (authContext.tenantId !== null || !isPlatformIdentity || !authContext.employeeId) {
      throw Errors.forbidden();
    }
    if (this.dependencies.accessPolicy.assertPermission(authContext, MANAGE_PERMISSION) !== "all") {
      throw Errors.forbidden();
    }
  }

  private requireOperator(authContext: AuthContext): string {
    this.assertCanManage(authContext);
    return authContext.employeeId as string;
  }

  private async requireInstallation(installationId: string): Promise<DouyinMiniappReleaseTarget> {
    const installation = await this.dependencies.installationRepository
      .findReleaseTargetById(installationId);
    if (!installation) throw installationNotFound();
    return installation;
  }

  private async requireReleaseTarget(installationId: string): Promise<ReleaseTarget> {
    const installation = await this.requireInstallation(installationId);
    if (
      installation.authorization_status !== "active"
      || installation.installation_kind !== "merchant"
      || !installation.deployment_key
      || !hasDevelopmentPermission(installation.permission_snapshot)
    ) {
      throw installationStateConflict();
    }
    return { ...installation, deployment_key: installation.deployment_key };
  }

  private async requireOwnedRelease(
    installationId: string,
    releaseId: string,
  ): Promise<DouyinMiniappReleaseRecord> {
    const release = await this.dependencies.releaseRepository.findById(releaseId);
    if (!release || release.installation_id !== installationId) throw releaseNotFound();
    return release;
  }
}

let defaultServicePromise: Promise<PlatformDouyinMiniappReleasesService> | undefined;

export async function getPlatformDouyinMiniappReleasesService(): Promise<PlatformDouyinMiniappReleasesService> {
  return defaultServicePromise ??= import("./platform-douyin-miniapp-releases/default-service")
    .then(({ createDefaultReleaseDependencies }) => new PlatformDouyinMiniappReleasesService(
      createDefaultReleaseDependencies(),
    ))
    .catch((error: unknown) => {
      defaultServicePromise = undefined;
      throw error;
    });
}
