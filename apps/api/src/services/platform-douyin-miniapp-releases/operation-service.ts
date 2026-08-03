import { Errors } from "@/errors/error-factory";
import type {
  DouyinMiniappReleaseGateway,
} from "@/gateways/douyin-open-platform/client";
import type { DouyinMiniappReleaseTarget } from "@/repositories/douyin-miniapp-installations";
import type {
  DouyinMiniappClaimedUploadRelease,
  DouyinMiniappReleaseOperation,
  DouyinMiniappReleaseRecord,
  DouyinMiniappReleaseStatus,
  DouyinMiniappReleasesRepository,
  UpdateDouyinMiniappReleaseInput,
} from "@/repositories/douyin-miniapp-releases";
import type { DouyinMiniappAccessTokenService } from "@/services/douyin-miniapp/access-tokens";
import {
  exactAuditStage,
  isExplicitOpenPlatformApiRejection,
  publishStateConflict,
  releaseStateConflict,
  requestError,
  safeProviderFailure,
  sanitizedProviderError,
} from "./support";
import { auditPatch, recoveryPatch, releasedPatch } from "./operation-state";

type Installation = DouyinMiniappReleaseTarget & { readonly deployment_key: string };
type ReleaseRepository = Pick<DouyinMiniappReleasesRepository,
  "findById" | "claimOperation" | "getOrCreateAndClaimUpload" | "patchClaimed" | "updateClaimed">;
type Dependencies = {
  readonly installationRepository: {
    syncReleaseMetadata(
      installationId: string,
      releaseId: string,
      claimToken: string,
    ): Promise<boolean>;
  };
  readonly releaseRepository: ReleaseRepository;
  readonly accessTokens: Pick<DouyinMiniappAccessTokenService, "getAuthorizerAccessToken">;
  readonly gateway: DouyinMiniappReleaseGateway;
  readonly now: () => string;
  readonly claimToken: () => string;
};
type Claim = { readonly token: string; readonly recoveryRequired: boolean };
type Acquired = { readonly claim: Claim; readonly release: DouyinMiniappReleaseRecord };
type UploadInput = {
  readonly template_id: string;
  readonly template_version: string;
  readonly description: string;
  readonly channel: "default" | "1";
};
type AuditInput = { readonly host_names: string[]; readonly audit_note: string };

const CLAIM_TTL_MS = 120_000;
const UPLOAD_TERMINAL: readonly DouyinMiniappReleaseStatus[] = [
  "uploaded", "testing", "audit_pending", "audit_rejected", "audit_approved", "released",
];

export class PlatformDouyinMiniappReleaseOperations {
  constructor(private readonly dependencies: Dependencies) {}
  async upload(
    installation: Installation,
    installationId: string,
    operatorId: string,
    input: UploadInput,
  ): Promise<DouyinMiniappReleaseRecord> {
    const token = this.dependencies.claimToken();
    const extJson = {
      extEnable: true as const,
      extAppid: installation.authorizer_appid,
      ext: { deployment_key: installation.deployment_key },
    };
    const claimed = await this.dependencies.releaseRepository.getOrCreateAndClaimUpload({
      installationId,
      templateId: input.template_id,
      templateVersion: input.template_version,
      description: input.description,
      channel: input.channel,
      extJson,
      platformOperatorId: operatorId,
      claimToken: token,
      claimExpiresAt: this.claimExpiresAt(),
    });
    if (!claimed || claimed.operation_claim_token !== token) throw operationInProgress();
    const release = publicRelease(claimed);
    const claim = { token, recoveryRequired: claimed.recovery_required };
    if (UPLOAD_TERMINAL.includes(release.status)) {
      return this.persistWithMetadata(release, claim, { status: release.status,
        platformOperatorId: operatorId }, installationId);
    }

    const authorizerAccessToken = await this.accessToken(release, claim, installation, {
      status: release.status, platformOperatorId: operatorId,
    });
    if (release.status === "failed" || claim.recoveryRequired) {
      const versions = await this.provider(release, claim, {
        status: release.status, platformOperatorId: operatorId,
      }, async () => this.dependencies.gateway.getVersionList({
        authorizerAccessToken, appId: installation.authorizer_appid,
      }), true);
      const recovered = recoveryPatch(release, versions, this.dependencies.now());
      if (!recovered) throw outcomeUncertain();
      return this.persistWithMetadata(release, claim, {
        ...recovered, platformOperatorId: operatorId,
      }, installationId);
    }

    const uploaded = await this.provider(release, claim, {
      status: "failed", auditResult: { status: "failed" }, platformOperatorId: operatorId,
    }, async () => this.dependencies.gateway.uploadTemplateVersion({
      authorizerAccessToken,
      appId: installation.authorizer_appid,
      templateId: input.template_id,
      extJson,
      userDescription: input.description,
      userVersion: input.template_version,
      ...(input.channel === "1" ? { tag: "1" as const } : {}),
    }));
    return this.persistWithMetadata(release, claim, {
      status: "uploaded", auditResult: null,
      douyinLogId: uploaded.logId, platformOperatorId: operatorId,
    }, installationId);
  }
  async getTestQr(
    installation: Installation,
    snapshot: DouyinMiniappReleaseRecord,
    operatorId: string,
  ): Promise<DouyinMiniappReleaseRecord> {
    this.assertState(snapshot, ["uploaded", "testing"]);
    const { claim, release } = await this.acquire(
      snapshot, "test_qr", ["uploaded", "testing"], operatorId,
    );
    this.assertState(release, ["uploaded", "testing"]);
    const authorizerAccessToken = await this.accessToken(release, claim, installation, {
      status: release.status, platformOperatorId: operatorId,
    });
    const result = await this.provider(release, claim, {
      status: release.status, platformOperatorId: operatorId,
    }, async () => this.dependencies.gateway.getTestQrCode({
      authorizerAccessToken, appId: installation.authorizer_appid,
    }));
    return this.finish(release, claim, {
      status: "testing", testQrUrl: result.qrCodeUrl,
      douyinLogId: result.logId, platformOperatorId: operatorId,
    });
  }
  async submitAudit(
    installation: Installation,
    installationId: string,
    snapshot: DouyinMiniappReleaseRecord,
    operatorId: string,
    input: AuditInput,
  ): Promise<DouyinMiniappReleaseRecord> {
    const allowed = ["testing", "audit_pending", "audit_rejected", "audit_approved", "released"] as const;
    this.assertState(snapshot, allowed);
    const { claim, release } = await this.acquire(snapshot, "submit_audit", allowed, operatorId);
    this.assertState(release, allowed);
    let hasIntent = release.audit_note !== null || release.audit_host_names.length > 0;
    if (hasIntent && !sameAuditIntent(release, input)) {
      await this.finish(release, claim, { status: release.status, platformOperatorId: operatorId });
      throw releaseStateConflict();
    }
    if (release.status !== "testing") {
      return this.persistWithMetadata(release, claim, {
        status: release.status, platformOperatorId: operatorId,
      }, installationId);
    }

    const authorizerAccessToken = await this.accessToken(release, claim, installation, {
      status: "testing", auditHostNames: release.audit_host_names,
      auditNote: release.audit_note,
      ...(hasIntent && release.audit_result !== null
        ? { auditResult: release.audit_result }
        : {}),
      platformOperatorId: operatorId,
    }, hasIntent && release.audit_result !== null);
    if (
      hasIntent
      && !claim.recoveryRequired
      && isStoredExplicitAuditRejection(release)
    ) {
      await this.patch(release, claim, {
        status: "testing",
        auditHostNames: [],
        auditNote: null,
        auditResult: null,
        platformOperatorId: operatorId,
      });
      hasIntent = false;
    }
    if (hasIntent || claim.recoveryRequired) {
      const versions = await this.provider(release, claim, {
        status: "testing", platformOperatorId: operatorId,
      }, async () => this.dependencies.gateway.getVersionList({
        authorizerAccessToken, appId: installation.authorizer_appid,
      }), true);
      const recovered = recoveryPatch(release, versions, this.dependencies.now(), false);
      if (!recovered) throw outcomeUncertain();
      return this.persistWithMetadata(release, claim, {
        ...recovered, platformOperatorId: operatorId,
      }, installationId);
    }

    const available = await this.provider(release, claim, {
      status: "testing", platformOperatorId: operatorId,
    }, async () => this.dependencies.gateway.getAvailableAuditHosts({
      authorizerAccessToken, appId: installation.authorizer_appid,
    }));
    if (!input.host_names.every((host) => new Set(available.hostNames).has(host))) {
      await this.finish(release, claim, { status: "testing", platformOperatorId: operatorId });
      throw requestError("抖音审核宿主不可用", "DOUYIN_AUDIT_HOSTS_UNAVAILABLE");
    }
    await this.patch(release, claim, {
      status: "testing", auditHostNames: input.host_names,
      auditNote: input.audit_note, auditResult: null,
      platformOperatorId: operatorId,
    });
    const submitted = await this.provider(release, claim, {
      status: "testing", auditHostNames: input.host_names, auditNote: input.audit_note,
      platformOperatorId: operatorId,
    }, async () => this.dependencies.gateway.submitVersionAudit({
      authorizerAccessToken, appId: installation.authorizer_appid,
      hostNames: input.host_names, auditNote: input.audit_note,
    }), false, true);
    const submittedAt = this.dependencies.now();
    return this.persistWithMetadata(release, claim, {
      status: "audit_pending", auditHostNames: input.host_names, auditNote: input.audit_note,
      submittedAt, douyinLogId: submitted.logId, platformOperatorId: operatorId,
    }, installationId);
  }
  async syncStatus(
    installation: Installation,
    installationId: string,
    snapshot: DouyinMiniappReleaseRecord,
    operatorId: string,
  ): Promise<DouyinMiniappReleaseRecord> {
    const allowed = ["audit_pending", "audit_rejected", "audit_approved"] as const;
    this.assertState(snapshot, allowed);
    const { claim, release } = await this.acquire(snapshot, "sync_status", allowed, operatorId);
    this.assertState(release, allowed);
    const authorizerAccessToken = await this.accessToken(release, claim, installation, {
      status: release.status, platformOperatorId: operatorId,
    });
    const versions = await this.provider(release, claim, {
      status: release.status, platformOperatorId: operatorId,
    }, async () => this.dependencies.gateway.getVersionList({
      authorizerAccessToken, appId: installation.authorizer_appid,
    }));
    let patch: UpdateDouyinMiniappReleaseInput;
    try {
      const audit = exactAuditStage(versions.audit, release.template_version);
      patch = auditPatch(release, audit, versions.logId, this.dependencies.now());
    } catch (error) {
      if (!claim.recoveryRequired) await this.finish(release, claim, {
        status: release.status, platformOperatorId: operatorId,
      });
      throw error;
    }
    return this.persistWithMetadata(release, claim, {
      ...patch, platformOperatorId: operatorId,
    }, installationId);
  }
  async publish(
    installation: Installation,
    installationId: string,
    snapshot: DouyinMiniappReleaseRecord,
    operatorId: string,
  ): Promise<DouyinMiniappReleaseRecord> {
    const allowed = ["audit_pending", "audit_approved", "released"] as const;
    this.assertState(snapshot, allowed);
    const { claim, release } = await this.acquire(snapshot, "publish", allowed, operatorId);
    this.assertState(release, allowed);
    if (release.status === "released") {
      return this.persistWithMetadata(release, claim, {
        status: "released", platformOperatorId: operatorId,
      }, installationId);
    }

    const authorizerAccessToken = await this.accessToken(release, claim, installation, {
      status: release.status, auditResult: release.audit_result,
      submittedAt: release.submitted_at, auditedAt: release.audited_at,
      platformOperatorId: operatorId,
    });
    const versions = await this.provider(release, claim, {
      status: release.status, platformOperatorId: operatorId,
    }, async () => this.dependencies.gateway.getVersionList({
      authorizerAccessToken, appId: installation.authorizer_appid,
    }), claim.recoveryRequired);
    if (versions.current?.version === release.template_version) {
      const patch = releasedPatch(release, versions.logId, this.dependencies.now());
      return this.persistWithMetadata(release, claim, {
        ...patch, platformOperatorId: operatorId,
      }, installationId);
    }
    let fresh: UpdateDouyinMiniappReleaseInput;
    try {
      const audit = exactAuditStage(versions.audit, release.template_version);
      fresh = auditPatch(release, audit, versions.logId, this.dependencies.now());
    } catch (error) {
      if (claim.recoveryRequired) throw outcomeUncertain();
      await this.finish(release, claim, { status: release.status, platformOperatorId: operatorId });
      throw error;
    }
    if (claim.recoveryRequired && fresh.status === "audit_approved") throw outcomeUncertain();
    if (fresh.status !== "audit_approved") {
      await this.persistWithMetadata(release, claim, {
        ...fresh, platformOperatorId: operatorId,
      }, installationId);
      throw publishStateConflict();
    }
    await this.patch(release, claim, { ...fresh, platformOperatorId: operatorId });
    const result = await this.provider(release, claim, {
      ...fresh, platformOperatorId: operatorId,
    }, async () => this.dependencies.gateway.releaseVersion({
      authorizerAccessToken, appId: installation.authorizer_appid,
    }), true);
    const final = releasedPatch(release, result.logId, this.dependencies.now());
    return this.persistWithMetadata(release, claim, {
      ...final, platformOperatorId: operatorId,
    }, installationId);
  }
  private async acquire(
    release: DouyinMiniappReleaseRecord,
    operationName: DouyinMiniappReleaseOperation,
    expectedStatuses: readonly DouyinMiniappReleaseStatus[],
    platformOperatorId: string,
  ): Promise<Acquired> {
    const token = this.dependencies.claimToken();
    const claim = await this.dependencies.releaseRepository.claimOperation({
      releaseId: release.id, expectedStatuses, operationName, claimToken: token,
      claimExpiresAt: this.claimExpiresAt(), platformOperatorId,
    });
    if (!claim || claim.claimToken !== token) throw operationInProgress();
    const fresh = await this.dependencies.releaseRepository.findById(release.id);
    if (!fresh) throw releaseStateConflict();
    return {
      claim: { token, recoveryRequired: claim.recoveryRequired },
      release: fresh,
    };
  }
  private async provider<Result>(
    release: DouyinMiniappReleaseRecord,
    claim: Claim,
    failurePatch: UpdateDouyinMiniappReleaseInput,
    operation: () => Promise<Result>,
    retainClaim = false,
    clearAuditIntentOnExplicitRejection = false,
    preserveFailureAuditResult = false,
  ): Promise<Result> {
    try {
      return await operation();
    } catch (error) {
      const safe = safeProviderFailure(error);
      const patch = {
        ...failurePatch,
        ...(clearAuditIntentOnExplicitRejection
            && isExplicitOpenPlatformApiRejection(error)
          ? { auditHostNames: [], auditNote: null }
          : {}),
        ...(safe.logId ? { douyinLogId: safe.logId } : {}),
        auditResult: preserveFailureAuditResult
            && failurePatch.auditResult !== undefined
            && failurePatch.auditResult !== null
          ? failurePatch.auditResult
          : {
            ...(failurePatch.auditResult ?? { status: "failed" as const }),
            error_code: safe.code,
          },
      };
      try {
        if (retainClaim) await this.patch(release, claim, patch);
        else await this.finish(release, claim, patch);
      } catch {
        // Best effort only; the sanitized provider error remains authoritative.
      }
      throw sanitizedProviderError(error);
    }
  }

  private async persistWithMetadata(
    release: DouyinMiniappReleaseRecord,
    claim: Claim,
    patch: UpdateDouyinMiniappReleaseInput,
    installationId: string,
  ): Promise<DouyinMiniappReleaseRecord> {
    await this.patch(release, claim, patch);
    const synchronized = await this.dependencies.installationRepository
      .syncReleaseMetadata(installationId, release.id, claim.token);
    if (!synchronized) throw Errors.business(
      409, "抖音小程序安装当前状态不可发布", "DOUYIN_INSTALLATION_STATE_CONFLICT",
    );
    return this.finish(release, claim, patch);
  }

  private async patch(
    release: DouyinMiniappReleaseRecord,
    claim: Claim,
    patch: UpdateDouyinMiniappReleaseInput,
  ): Promise<DouyinMiniappReleaseRecord> {
    const updated = await this.dependencies.releaseRepository.patchClaimed(release.id, claim.token, patch);
    if (!updated) throw releaseStateConflict();
    return updated;
  }

  private async finish(
    release: DouyinMiniappReleaseRecord,
    claim: Claim,
    patch: UpdateDouyinMiniappReleaseInput,
  ): Promise<DouyinMiniappReleaseRecord> {
    const updated = await this.dependencies.releaseRepository.updateClaimed(release.id, claim.token, patch);
    if (!updated) throw releaseStateConflict();
    return updated;
  }

  private freshAccessToken(installation: Installation): Promise<string> {
    return this.dependencies.accessTokens.getAuthorizerAccessToken({
      authorizerAppId: installation.authorizer_appid,
      deploymentKey: installation.deployment_key,
    });
  }

  private accessToken(
    release: DouyinMiniappReleaseRecord,
    claim: Claim,
    installation: Installation,
    failurePatch: UpdateDouyinMiniappReleaseInput,
    preserveFailureAuditResult = false,
  ): Promise<string> {
    return this.provider(
      release,
      claim,
      failurePatch,
      () => this.freshAccessToken(installation),
      claim.recoveryRequired,
      false,
      preserveFailureAuditResult,
    );
  }

  private claimExpiresAt(): string {
    return new Date(Date.parse(this.dependencies.now()) + CLAIM_TTL_MS).toISOString();
  }

  private assertState(
    release: DouyinMiniappReleaseRecord,
    allowed: readonly DouyinMiniappReleaseStatus[],
  ): void {
    if (!allowed.includes(release.status)) throw releaseStateConflict();
  }
}

function sameAuditIntent(release: DouyinMiniappReleaseRecord, input: AuditInput): boolean {
  const expectedHosts = new Set(input.host_names);
  return release.audit_note === input.audit_note
    && release.audit_host_names.length === input.host_names.length
    && release.audit_host_names.every((host) => expectedHosts.has(host));
}

function isStoredExplicitAuditRejection(
  release: DouyinMiniappReleaseRecord,
): boolean {
  return release.submitted_at === null
    && release.audit_result?.status === "failed"
    && release.audit_result.error_code === "DOUYIN_OPEN_PLATFORM_API_ERROR";
}

function publicRelease(release: DouyinMiniappClaimedUploadRelease): DouyinMiniappReleaseRecord {
  const {
    operation_name: _operationName,
    operation_claim_token: _claimToken,
    operation_claim_expires_at: _claimExpiresAt,
    recovery_required: _recoveryRequired,
    ...record
  } = release;
  return record;
}

function operationInProgress() {
  return Errors.business(409, "抖音小程序发布操作正在处理中", "DOUYIN_RELEASE_OPERATION_IN_PROGRESS");
}

function outcomeUncertain() {
  return Errors.business(409, "抖音小程序发布结果尚无法确认", "DOUYIN_RELEASE_OUTCOME_UNCERTAIN");
}
