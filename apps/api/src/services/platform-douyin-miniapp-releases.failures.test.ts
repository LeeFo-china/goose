import { beforeAll, describe, expect, mock, test } from "bun:test";
import { AppError } from "@/errors/app-error";
import type { DouyinMiniappReleaseRecord } from "@/repositories/douyin-miniapp-releases";
import type { AuthContext } from "@/services/authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

let PlatformDouyinMiniappReleasesService:
  typeof import("./platform-douyin-miniapp-releases").PlatformDouyinMiniappReleasesService;

beforeAll(async () => {
  ({ PlatformDouyinMiniappReleasesService } = await import(
    "./platform-douyin-miniapp-releases"
  ));
});

const INSTALLATION_ID = "22222222-2222-4222-8222-222222222222";
const RELEASE_ID = "11111111-1111-4111-8111-111111111111";
const OPERATOR_ID = "55555555-5555-4555-8555-555555555555";
const CLAIM_TOKEN = "77777777-7777-4777-8777-777777777777";
const NOW = "2026-07-20T03:00:00.000Z";

const authContext: AuthContext = {
  authUserId: "44444444-4444-4444-8444-444444444444",
  employeeId: OPERATOR_ID,
  tenantId: null,
  tenantName: null,
  tenantSlug: null,
  tenantStatus: null,
  isPlatformAdmin: true,
  employeeName: "平台管理员",
  employeeStatus: "active",
  departmentId: null,
  tenantDepartmentId: null,
  departmentCode: null,
  departmentName: null,
  postId: null,
  postName: null,
  avatar: null,
  roleCodes: ["platform_admin"],
  roles: [],
  permissions: [{ code: "platform.douyin_miniapp.manage", scope: "all" }],
};

const target = {
  id: INSTALLATION_ID,
  authorizer_appid: "tt-authorizer-1",
  deployment_key: "merchant-demo",
  installation_kind: "merchant" as const,
  authorization_status: "active" as const,
  permission_snapshot: [{ id: 1 }],
};

const release: DouyinMiniappReleaseRecord = {
  id: RELEASE_ID,
  installation_id: INSTALLATION_ID,
  template_id: "9133504853504535288",
  template_version: "1.2.3-beta.1",
  description: "装修模板首发",
  channel: "default",
  ext_json: {
    extEnable: true,
    extAppid: target.authorizer_appid,
    ext: { deployment_key: target.deployment_key },
  },
  status: "uploaded",
  douyin_log_id: "upload-log",
  test_qr_url: null,
  audit_host_names: [],
  audit_note: null,
  audit_result: null,
  submitted_at: null,
  audited_at: null,
  released_at: null,
  platform_operator_id: OPERATOR_ID,
  created_at: "2026-07-20T01:00:00.000Z",
  updated_at: "2026-07-20T01:00:00.000Z",
};

function dependencies() {
  const installationRepository = {
    findReleaseTargetById: mock(async () => target),
    syncReleaseMetadata: mock(async () => true),
  };
  const update = mock(async (_id: string, patch: Record<string, unknown>) => ({
    ...release,
    ...(patch.status ? { status: patch.status } : {}),
  }));
  const releaseRepository = {
    listByInstallation: mock(async () => ({ list: [release], total: 1 })),
    findById: mock(async () => release),
    claimOperation: mock(async () => ({
      releaseId: RELEASE_ID,
      claimToken: CLAIM_TOKEN,
      claimExpiresAt: "2026-07-20T03:02:00.000Z",
      recoveryRequired: false,
    })),
    getOrCreateAndClaimUpload: mock(async () => ({
      ...release,
      status: "created" as const,
      operation_name: "upload" as const,
      operation_claim_token: CLAIM_TOKEN,
      operation_claim_expires_at: "2026-07-20T03:02:00.000Z",
      recovery_required: false,
    })),
    patchClaimed: mock(async (id: string, _claim: string, patch: Record<string, unknown>) =>
      update(id, patch)),
    updateClaimed: mock(async (id: string, _claim: string, patch: Record<string, unknown>) =>
      update(id, patch)),
  };
  const accessPolicy = { assertPermission: mock(() => "all" as const) };
  const accessTokens = {
    getAuthorizerAccessToken: mock(async () => "authorizer-access-token"),
  };
  const gateway = {
    uploadTemplateVersion: mock(async () => ({ logId: "upload-log" })),
    getTestQrCode: mock(async () => ({
      qrCodeUrl: "https://p3.douyinpic.com/test.png",
      logId: "qr-log",
    })),
    getAvailableAuditHosts: mock(async () => ({
      hostNames: ["douyin"],
      releasedHostNames: [],
      logId: "hosts-log",
    })),
    submitVersionAudit: mock(async () => ({ logId: "audit-log" })),
    getVersionList: mock(async () => ({
      audit: { version: release.template_version, status: 1 },
      logId: "versions-log",
    })),
    releaseVersion: mock(async () => ({ logId: "release-log" })),
  };
  return {
    installationRepository,
    releaseRepository,
    accessPolicy,
    accessTokens,
    gateway,
    now: () => NOW,
    claimToken: () => CLAIM_TOKEN,
  };
}

function providerError(logId = "safe-log"): AppError {
  return new AppError(502, "unsafe secret", "DOUYIN_OPEN_PLATFORM_API_ERROR", {
    log_id: logId,
    raw: "access_token=secret",
  });
}

async function caught(operation: () => Promise<unknown>): Promise<unknown> {
  try {
    await operation();
  } catch (error) {
    return error;
  }
}

describe("PlatformDouyinMiniappReleasesService provider failure ledger", () => {
  test("upload failure marks a created ledger failed and exposes only safe metadata", async () => {
    const deps = dependencies();
    deps.gateway.uploadTemplateVersion = mock(async () => { throw providerError(); });

    const error = await caught(() => new PlatformDouyinMiniappReleasesService(deps as never)
      .upload(authContext, INSTALLATION_ID, {
        template_id: release.template_id,
        template_version: release.template_version,
        description: release.description,
        channel: "default",
      }));

    expect(error).toMatchObject({
      statusCode: 502,
      code: "DOUYIN_OPEN_PLATFORM_API_ERROR",
      details: { log_id: "safe-log" },
    });
    expect(JSON.stringify(error)).not.toContain("access_token=secret");
    expect(deps.releaseRepository.updateClaimed).toHaveBeenCalledWith(RELEASE_ID, CLAIM_TOKEN, {
      status: "failed",
      douyinLogId: "safe-log",
      auditResult: { status: "failed", error_code: "DOUYIN_OPEN_PLATFORM_API_ERROR" },
      platformOperatorId: OPERATOR_ID,
    });
    expect(deps.installationRepository.syncReleaseMetadata).not.toHaveBeenCalled();
  });

  test("QR gateway failure preserves uploaded status and writes a safe failure ledger", async () => {
    const deps = dependencies();
    deps.gateway.getTestQrCode = mock(async () => { throw providerError("qr-failure-log"); });

    const error = await caught(() => new PlatformDouyinMiniappReleasesService(deps as never)
      .getTestQr(authContext, INSTALLATION_ID, RELEASE_ID));

    expect(error).toMatchObject({
      code: "DOUYIN_OPEN_PLATFORM_API_ERROR",
      details: { log_id: "qr-failure-log" },
    });
    expect(deps.releaseRepository.updateClaimed).toHaveBeenCalledWith(RELEASE_ID, CLAIM_TOKEN, {
      status: "uploaded",
      douyinLogId: "qr-failure-log",
      auditResult: { status: "failed", error_code: "DOUYIN_OPEN_PLATFORM_API_ERROR" },
      platformOperatorId: OPERATOR_ID,
    });
    expect(JSON.stringify(deps.releaseRepository.updateClaimed.mock.calls)).not.toContain(
      "access_token=secret",
    );
  });

  test("audit rejection clears its intent while sync failure preserves business status", async () => {
    const auditDeps = dependencies();
    auditDeps.releaseRepository.findById = mock(async () => ({ ...release, status: "testing" }));
    let auditSubmitCalls = 0;
    auditDeps.gateway.submitVersionAudit = mock(async () => {
      auditSubmitCalls += 1;
      if (auditSubmitCalls === 1) throw providerError("audit-fail");
      return { logId: "audit-retry-log" };
    });
    await caught(() => new PlatformDouyinMiniappReleasesService(auditDeps as never).submitAudit(
      authContext,
      INSTALLATION_ID,
      RELEASE_ID,
      { host_names: ["douyin"], audit_note: "装修模板提审" },
    ));
    expect(auditDeps.releaseRepository.updateClaimed).toHaveBeenCalledWith(RELEASE_ID, CLAIM_TOKEN, {
      status: "testing",
      auditHostNames: [],
      auditNote: null,
      douyinLogId: "audit-fail",
      auditResult: { status: "failed", error_code: "DOUYIN_OPEN_PLATFORM_API_ERROR" },
      platformOperatorId: OPERATOR_ID,
    });
    expect(auditDeps.installationRepository.syncReleaseMetadata).not.toHaveBeenCalled();
    auditDeps.releaseRepository.findById = mock(async () => ({
      ...release,
      status: "testing",
      audit_host_names: [],
      audit_note: null,
    }));
    await new PlatformDouyinMiniappReleasesService(auditDeps as never).submitAudit(
      authContext,
      INSTALLATION_ID,
      RELEASE_ID,
      { host_names: ["douyin"], audit_note: "装修模板提审" },
    );
    expect(auditDeps.gateway.submitVersionAudit).toHaveBeenCalledTimes(2);
    expect(auditDeps.gateway.getVersionList).not.toHaveBeenCalled();
    expect(auditDeps.releaseRepository.patchClaimed).toHaveBeenCalledWith(
      RELEASE_ID,
      CLAIM_TOKEN,
      {
        status: "testing",
        auditHostNames: ["douyin"],
        auditNote: "装修模板提审",
        auditResult: null,
        platformOperatorId: OPERATOR_ID,
      },
    );

    const syncDeps = dependencies();
    syncDeps.releaseRepository.findById = mock(async () => ({
      ...release,
      status: "audit_pending",
    }));
    syncDeps.gateway.getVersionList = mock(async () => { throw providerError("sync-fail"); });
    await caught(() => new PlatformDouyinMiniappReleasesService(syncDeps as never)
      .syncStatus(authContext, INSTALLATION_ID, RELEASE_ID));
    expect(syncDeps.releaseRepository.updateClaimed).toHaveBeenCalledWith(RELEASE_ID, CLAIM_TOKEN, {
      status: "audit_pending",
      douyinLogId: "sync-fail",
      auditResult: { status: "failed", error_code: "DOUYIN_OPEN_PLATFORM_API_ERROR" },
      platformOperatorId: OPERATOR_ID,
    });
    expect(syncDeps.installationRepository.syncReleaseMetadata).not.toHaveBeenCalled();
  });

  test("audit timeout keeps the intent and reconciles before any retry", async () => {
    const deps = dependencies();
    deps.releaseRepository.findById = mock(async () => ({ ...release, status: "testing" }));
    deps.gateway.submitVersionAudit = mock(async () => {
      throw new AppError(502, "请求超时", "DOUYIN_OPEN_PLATFORM_TIMEOUT");
    });
    deps.gateway.getVersionList = mock(async () => ({
      logId: "versions-log",
    })) as never;
    const service = new PlatformDouyinMiniappReleasesService(deps as never);
    const input = { host_names: ["douyin"], audit_note: "装修模板提审" };

    await caught(() => service.submitAudit(
      authContext,
      INSTALLATION_ID,
      RELEASE_ID,
      input,
    ));
    expect(deps.releaseRepository.updateClaimed).toHaveBeenCalledWith(
      RELEASE_ID,
      CLAIM_TOKEN,
      {
        status: "testing",
        auditHostNames: input.host_names,
        auditNote: input.audit_note,
        auditResult: {
          status: "failed",
          error_code: "DOUYIN_OPEN_PLATFORM_TIMEOUT",
        },
        platformOperatorId: OPERATOR_ID,
      },
    );
    deps.releaseRepository.findById = mock(async () => ({
      ...release,
      status: "testing",
      audit_host_names: input.host_names,
      audit_note: input.audit_note,
    }));
    const retryError = await caught(() => service.submitAudit(
      authContext,
      INSTALLATION_ID,
      RELEASE_ID,
      input,
    ));

    expect(retryError).toMatchObject({ code: "DOUYIN_RELEASE_OUTCOME_UNCERTAIN" });
    expect(deps.gateway.submitVersionAudit).toHaveBeenCalledTimes(1);
    expect(deps.gateway.getVersionList).toHaveBeenCalledTimes(1);
  });

  test("publish failure preserves freshly persisted approval and no released metadata", async () => {
    const deps = dependencies();
    deps.releaseRepository.findById = mock(async () => ({
      ...release,
      status: "audit_pending",
    }));
    deps.gateway.releaseVersion = mock(async () => { throw providerError("release-failure-log"); });

    const error = await caught(() => new PlatformDouyinMiniappReleasesService(deps as never)
      .publish(authContext, INSTALLATION_ID, RELEASE_ID));

    expect(error).toMatchObject({
      statusCode: 502,
      code: "DOUYIN_OPEN_PLATFORM_API_ERROR",
      details: { log_id: "release-failure-log" },
    });
    expect(deps.releaseRepository.patchClaimed).toHaveBeenCalledWith(RELEASE_ID, CLAIM_TOKEN, {
      status: "audit_approved",
      auditResult: { status: "approved" },
      submittedAt: NOW,
      auditedAt: NOW,
      douyinLogId: "versions-log",
      platformOperatorId: OPERATOR_ID,
    });
    expect(deps.releaseRepository.patchClaimed).toHaveBeenLastCalledWith(RELEASE_ID, CLAIM_TOKEN, {
      status: "audit_approved",
      auditResult: { status: "approved", error_code: "DOUYIN_OPEN_PLATFORM_API_ERROR" },
      submittedAt: NOW,
      auditedAt: NOW,
      douyinLogId: "release-failure-log",
      platformOperatorId: OPERATOR_ID,
    });
    expect(deps.releaseRepository.updateClaimed).not.toHaveBeenCalled();
    expect(deps.installationRepository.syncReleaseMetadata).not.toHaveBeenCalled();
  });
});

describe("PlatformDouyinMiniappReleasesService persistence failures", () => {
  test("does not disguise release update AppErrors as provider failures", async () => {
    const persistenceError = new AppError(
      500,
      "抖音小程序发布存储失败",
      "DOUYIN_MINIAPP_RELEASE_REPOSITORY_ERROR",
    );
    const deps = dependencies();
    deps.releaseRepository.updateClaimed = mock(async () => { throw persistenceError; }) as never;

    const error = await caught(() => new PlatformDouyinMiniappReleasesService(deps as never)
      .getTestQr(authContext, INSTALLATION_ID, RELEASE_ID));

    expect(error).toBe(persistenceError);
    expect(deps.releaseRepository.updateClaimed).toHaveBeenCalledTimes(1);
  });

  test("does not disguise installation patch AppErrors as provider failures", async () => {
    const persistenceError = new AppError(
      500,
      "更新抖音小程序发布元数据失败",
      "DOUYIN_INSTALLATION_REPOSITORY_ERROR",
    );
    const deps = dependencies();
    deps.installationRepository.syncReleaseMetadata = mock(async () => {
      throw persistenceError;
    });

    const error = await caught(() => new PlatformDouyinMiniappReleasesService(deps as never)
      .upload(authContext, INSTALLATION_ID, {
        template_id: release.template_id,
        template_version: release.template_version,
        description: release.description,
        channel: "default",
      }));

    expect(error).toBe(persistenceError);
  });
});

describe("PlatformDouyinMiniappReleasesService operation claims and recovery", () => {
  test("returns stable in-progress before QR provider access when claim is busy", async () => {
    const deps = dependencies();
    deps.releaseRepository.claimOperation = mock(async () => null) as never;
    const error = await caught(() => new PlatformDouyinMiniappReleasesService(deps as never)
      .getTestQr(authContext, INSTALLATION_ID, RELEASE_ID));
    expect(error).toMatchObject({ statusCode: 409, code: "DOUYIN_RELEASE_OPERATION_IN_PROGRESS" });
    expect(deps.gateway.getTestQrCode).not.toHaveBeenCalled();
    expect(deps.releaseRepository.claimOperation).toHaveBeenCalledWith({
      releaseId: RELEASE_ID,
      expectedStatuses: ["uploaded", "testing"],
      operationName: "test_qr",
      claimToken: CLAIM_TOKEN,
      claimExpiresAt: "2026-07-20T03:02:00.000Z",
      platformOperatorId: OPERATOR_ID,
    });
  });

  test("returns in-progress for an installation-busy atomic upload", async () => {
    const deps = dependencies();
    deps.releaseRepository.getOrCreateAndClaimUpload = mock(async () => null) as never;
    const error = await caught(() => new PlatformDouyinMiniappReleasesService(deps as never)
      .upload(authContext, INSTALLATION_ID, {
        template_id: release.template_id,
        template_version: release.template_version,
        description: release.description,
        channel: "default",
      }));
    expect(error).toMatchObject({ code: "DOUYIN_RELEASE_OPERATION_IN_PROGRESS" });
    expect(deps.gateway.uploadTemplateVersion).not.toHaveBeenCalled();
  });

  test("does not replay an upload when an expired claim has no exact version evidence", async () => {
    const deps = dependencies();
    deps.releaseRepository.getOrCreateAndClaimUpload = mock(async () => ({
      ...release,
      status: "created",
      operation_name: "upload",
      operation_claim_token: CLAIM_TOKEN,
      operation_claim_expires_at: "2026-07-20T03:02:00.000Z",
      recovery_required: true,
    }));
    deps.gateway.getVersionList = mock(async () => ({ logId: "versions-log" })) as never;
    const error = await caught(() => new PlatformDouyinMiniappReleasesService(deps as never)
      .upload(authContext, INSTALLATION_ID, {
        template_id: release.template_id,
        template_version: release.template_version,
        description: release.description,
        channel: "default",
      }));
    expect(error).toMatchObject({ statusCode: 409, code: "DOUYIN_RELEASE_OUTCOME_UNCERTAIN" });
    expect(deps.gateway.uploadTemplateVersion).not.toHaveBeenCalled();
    expect(deps.releaseRepository.updateClaimed).not.toHaveBeenCalled();
  });

  test("does not replay publish after stale claim when current is unconfirmed", async () => {
    const deps = dependencies();
    deps.releaseRepository.findById = mock(async () => ({ ...release, status: "audit_approved" }));
    deps.releaseRepository.claimOperation = mock(async () => ({
      releaseId: RELEASE_ID,
      claimToken: CLAIM_TOKEN,
      claimExpiresAt: "2026-07-20T03:02:00.000Z",
      recoveryRequired: true,
    }));
    const error = await caught(() => new PlatformDouyinMiniappReleasesService(deps as never)
      .publish(authContext, INSTALLATION_ID, RELEASE_ID));
    expect(error).toMatchObject({ code: "DOUYIN_RELEASE_OUTCOME_UNCERTAIN" });
    expect(deps.gateway.releaseVersion).not.toHaveBeenCalled();
    expect(deps.releaseRepository.updateClaimed).not.toHaveBeenCalled();
  });

  test("sync completion uses claim CAS so a newer released state cannot be overwritten", async () => {
    const deps = dependencies();
    deps.releaseRepository.findById = mock(async () => ({ ...release, status: "audit_pending" }));
    deps.releaseRepository.updateClaimed = mock(async () => null) as never;
    const error = await caught(() => new PlatformDouyinMiniappReleasesService(deps as never)
      .syncStatus(authContext, INSTALLATION_ID, RELEASE_ID));
    expect(error).toMatchObject({ code: "DOUYIN_RELEASE_STATE_CONFLICT" });
    expect(deps.releaseRepository.updateClaimed).toHaveBeenCalledWith(
      RELEASE_ID,
      CLAIM_TOKEN,
      expect.objectContaining({ status: "audit_approved" }),
    );
  });
});
