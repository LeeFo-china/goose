import { describe, expect, mock, test } from "bun:test";
import type { DouyinMiniappReleaseRecord } from "@/repositories/douyin-miniapp-releases";
import type { AuthContext } from "@/services/authorization";
import { PlatformDouyinMiniappReleasesService } from "./platform-douyin-miniapp-releases";

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
  permission_snapshot: [{ id: 1, category: "untrusted label" }],
  template_id: null,
  template_version: null,
};

const release: DouyinMiniappReleaseRecord = {
  id: RELEASE_ID,
  installation_id: INSTALLATION_ID,
  template_id: "9133504853504535288",
  template_version: "1.2.3-beta.1",
  description: "装修模板首发",
  channel: "default" as const,
  ext_json: {
    extEnable: true as const,
    extAppid: target.authorizer_appid,
    ext: { deployment_key: target.deployment_key },
  },
  status: "uploaded" as const,
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

function dependencies(overrides: Record<string, unknown> = {}) {
  const installationRepository = {
    findReleaseTargetById: mock(async (_id: string) => target),
    syncReleaseMetadata: mock(async () => true),
  };
  const update = mock(async (_id: string, patch: Record<string, unknown>) => ({
    ...release,
    ...(patch.status ? { status: patch.status } : {}),
    ...(patch.douyinLogId ? { douyin_log_id: patch.douyinLogId } : {}),
    ...(patch.testQrUrl ? { test_qr_url: patch.testQrUrl } : {}),
  }));
  const releaseRepository = {
    listByInstallation: mock(async (_input: unknown) => ({ list: [release], total: 1 })),
    findById: mock(async (_id: string) => release),
    claimOperation: mock(async () => ({
      releaseId: RELEASE_ID,
      claimToken: CLAIM_TOKEN,
      claimExpiresAt: "2026-07-20T03:02:00.000Z",
      recoveryRequired: false,
    })),
    getOrCreateAndClaimUpload: mock(async (input: Record<string, unknown>) => ({
      ...release,
      status: "created" as const,
      channel: input.channel,
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
  const accessPolicy = {
    assertPermission: mock((_context: AuthContext, _permission: string): "all" | "self" => "all"),
  };
  const accessTokens = {
    getAuthorizerAccessToken: mock(async (_input: unknown) => "authorizer-access-token"),
  };
  const gateway = {
    uploadTemplateVersion: mock(async (_input: unknown) => ({ logId: "upload-log" })),
    getTestQrCode: mock(async (_input: unknown) => ({
      qrCodeUrl: "https://p3.douyinpic.com/test.png",
      logId: "qr-log",
    })),
    getAvailableAuditHosts: mock(async (_input: unknown) => ({
      hostNames: ["douyin", "toutiao"],
      releasedHostNames: [],
      logId: "hosts-log",
    })),
    submitVersionAudit: mock(async (_input: unknown) => ({ logId: "audit-log" })),
    getVersionList: mock(async (_input: unknown) => ({
      audit: { version: release.template_version, status: 1 },
      logId: "versions-log",
    })),
    releaseVersion: mock(async (_input: unknown) => ({ logId: "release-log" })),
  };
  return {
    installationRepository,
    releaseRepository,
    accessPolicy,
    accessTokens,
    gateway,
    now: () => NOW,
    claimToken: () => CLAIM_TOKEN,
    ...overrides,
  };
}

describe("PlatformDouyinMiniappReleasesService", () => {
  test("requires a platform all-scope employee operator before repository access", async () => {
    for (const context of [
      { ...authContext, isPlatformAdmin: false },
      { ...authContext, employeeId: null },
    ]) {
      const deps = dependencies();
      const service = new PlatformDouyinMiniappReleasesService(deps as never);
      await expect(service.list(context, INSTALLATION_ID, { page: 1, pageSize: 20 }))
        .rejects.toMatchObject({ statusCode: 403 });
      expect(deps.installationRepository.findReleaseTargetById).not.toHaveBeenCalled();
    }

    const deps = dependencies();
    deps.accessPolicy.assertPermission = mock((): "all" | "self" => "self");
    await expect(new PlatformDouyinMiniappReleasesService(deps as never)
      .list(authContext, INSTALLATION_ID, { page: 1, pageSize: 20 }))
      .rejects.toMatchObject({ statusCode: 403 });
    expect(deps.accessPolicy.assertPermission).toHaveBeenCalledWith(
      authContext,
      "platform.douyin_miniapp.manage",
    );
  });

  test("lists one existing installation with bounded pagination", async () => {
    const deps = dependencies();
    const result = await new PlatformDouyinMiniappReleasesService(deps as never)
      .list(authContext, INSTALLATION_ID, { page: 2, pageSize: 100 });

    expect(deps.releaseRepository.listByInstallation).toHaveBeenCalledWith({
      installationId: INSTALLATION_ID,
      page: 2,
      pageSize: 100,
    });
    expect(result.pagination).toEqual({ page: 2, pageSize: 100, total: 1, totalPages: 1 });
  });

  test("rejects pagination outside the service boundary", async () => {
    const deps = dependencies();
    await expect(new PlatformDouyinMiniappReleasesService(deps as never)
      .list(authContext, INSTALLATION_ID, { page: 1, pageSize: 101 }))
      .rejects.toMatchObject({ statusCode: 400 });
    expect(deps.installationRepository.findReleaseTargetById).not.toHaveBeenCalled();
  });

  test("uploads with server-owned ext_json and only sends channel one as tag", async () => {
    for (const channel of ["default", "1"] as const) {
      const deps = dependencies();
      const service = new PlatformDouyinMiniappReleasesService(deps as never);
      await service.upload(authContext, INSTALLATION_ID, {
        template_id: release.template_id,
        template_version: release.template_version,
        description: "  装修模板首发  ",
        channel,
      });

      expect(deps.releaseRepository.getOrCreateAndClaimUpload).toHaveBeenCalledWith({
        installationId: INSTALLATION_ID,
        templateId: release.template_id,
        templateVersion: release.template_version,
        description: release.description,
        channel,
        extJson: release.ext_json,
        platformOperatorId: OPERATOR_ID,
        claimToken: CLAIM_TOKEN,
        claimExpiresAt: "2026-07-20T03:02:00.000Z",
      });
      expect(deps.gateway.uploadTemplateVersion).toHaveBeenCalledWith({
        authorizerAccessToken: "authorizer-access-token",
        appId: target.authorizer_appid,
        templateId: release.template_id,
        extJson: release.ext_json,
        userDescription: release.description,
        userVersion: release.template_version,
        ...(channel === "1" ? { tag: "1" } : {}),
      });
      expect(deps.installationRepository.syncReleaseMetadata).toHaveBeenCalledWith(
        INSTALLATION_ID, RELEASE_ID, CLAIM_TOKEN,
      );
    }
  });

  test("requires active merchant installation, deployment key, and numeric permission id 1", async () => {
    for (const invalidTarget of [
      { ...target, authorization_status: "disabled" },
      { ...target, installation_kind: "template_development" },
      { ...target, deployment_key: null },
      { ...target, permission_snapshot: [{ id: "1" }, { category: "开发管理权限" }] },
    ]) {
      const deps = dependencies({
        installationRepository: {
          findReleaseTargetById: mock(async () => invalidTarget),
          syncReleaseMetadata: mock(async () => true),
        },
      });
      await expect(new PlatformDouyinMiniappReleasesService(deps as never).upload(
        authContext,
        INSTALLATION_ID,
        {
          template_id: release.template_id,
          template_version: release.template_version,
          description: release.description,
          channel: "default",
        },
      )).rejects.toMatchObject({ statusCode: 409 });
      expect(deps.gateway.uploadTemplateVersion).not.toHaveBeenCalled();
    }
  });

  test("rejects malformed upload values before creating a ledger", async () => {
    const deps = dependencies();
    await expect(new PlatformDouyinMiniappReleasesService(deps as never).upload(
      authContext,
      INSTALLATION_ID,
      {
        template_id: release.template_id,
        template_version: "v1.2",
        description: release.description,
        channel: "default",
      },
    )).rejects.toMatchObject({ statusCode: 400 });
    expect(deps.releaseRepository.getOrCreateAndClaimUpload).not.toHaveBeenCalled();
  });

  test("rejects a release owned by another installation before gateway access", async () => {
    const deps = dependencies();
    deps.releaseRepository.findById = mock(async () => ({
      ...release,
      installation_id: "66666666-6666-4666-8666-666666666666",
    }));
    await expect(new PlatformDouyinMiniappReleasesService(deps as never)
      .getTestQr(authContext, INSTALLATION_ID, RELEASE_ID))
      .rejects.toMatchObject({ statusCode: 404 });
    expect(deps.gateway.getTestQrCode).not.toHaveBeenCalled();
  });

  test("creates latest test QR only from uploaded or testing", async () => {
    const deps = dependencies();
    await new PlatformDouyinMiniappReleasesService(deps as never)
      .getTestQr(authContext, INSTALLATION_ID, RELEASE_ID);
    expect(deps.gateway.getTestQrCode).toHaveBeenCalledWith({
      authorizerAccessToken: "authorizer-access-token",
      appId: target.authorizer_appid,
    });
    expect(deps.releaseRepository.updateClaimed).toHaveBeenCalledWith(RELEASE_ID, CLAIM_TOKEN, {
      status: "testing",
      testQrUrl: "https://p3.douyinpic.com/test.png",
      douyinLogId: "qr-log",
      platformOperatorId: OPERATOR_ID,
    });
  });

  test("rejects test QR from a non-testable release state", async () => {
    const deps = dependencies();
    deps.releaseRepository.findById = mock(async () => ({
      ...release,
      status: "audit_pending",
    }));
    await expect(new PlatformDouyinMiniappReleasesService(deps as never)
      .getTestQr(authContext, INSTALLATION_ID, RELEASE_ID))
      .rejects.toMatchObject({ statusCode: 409 });
    expect(deps.gateway.getTestQrCode).not.toHaveBeenCalled();
  });

  test("submits testing release only after checking unique host subset", async () => {
    const deps = dependencies();
    deps.releaseRepository.findById = mock(async () => ({ ...release, status: "testing" }));
    const service = new PlatformDouyinMiniappReleasesService(deps as never);
    await service.submitAudit(authContext, INSTALLATION_ID, RELEASE_ID, {
      host_names: ["douyin"],
      audit_note: "  装修模板提审  ",
    });
    expect(deps.gateway.getAvailableAuditHosts).toHaveBeenCalledTimes(1);
    expect(deps.gateway.submitVersionAudit).toHaveBeenCalledWith({
      authorizerAccessToken: "authorizer-access-token",
      appId: target.authorizer_appid,
      hostNames: ["douyin"],
      auditNote: "装修模板提审",
    });
    expect(deps.installationRepository.syncReleaseMetadata).toHaveBeenCalledWith(
      INSTALLATION_ID, RELEASE_ID, CLAIM_TOKEN,
    );

    const invalid = dependencies();
    invalid.releaseRepository.findById = mock(async () => ({ ...release, status: "testing" }));
    await expect(new PlatformDouyinMiniappReleasesService(invalid as never).submitAudit(
      authContext,
      INSTALLATION_ID,
      RELEASE_ID,
      { host_names: ["unknown"], audit_note: "装修模板提审" },
    )).rejects.toMatchObject({ statusCode: 400 });
    expect(invalid.gateway.submitVersionAudit).not.toHaveBeenCalled();
  });

  test("rejects duplicate audit hosts and sensitive notes before gateway access", async () => {
    for (const input of [
      { host_names: ["douyin", "douyin"], audit_note: "装修模板提审" },
      { host_names: ["douyin"], audit_note: "包含 access_token 信息" },
    ]) {
      const deps = dependencies();
      deps.releaseRepository.findById = mock(async () => ({ ...release, status: "testing" }));
      await expect(new PlatformDouyinMiniappReleasesService(deps as never).submitAudit(
        authContext,
        INSTALLATION_ID,
        RELEASE_ID,
        input,
      )).rejects.toMatchObject({ statusCode: 400 });
      expect(deps.gateway.getAvailableAuditHosts).not.toHaveBeenCalled();
      expect(deps.gateway.submitVersionAudit).not.toHaveBeenCalled();
    }
  });

  test("rejects audit submission from a non-testing release state", async () => {
    const deps = dependencies();
    await expect(new PlatformDouyinMiniappReleasesService(deps as never).submitAudit(
      authContext,
      INSTALLATION_ID,
      RELEASE_ID,
      { host_names: ["douyin"], audit_note: "装修模板提审" },
    )).rejects.toMatchObject({ statusCode: 409 });
    expect(deps.gateway.getAvailableAuditHosts).not.toHaveBeenCalled();
  });

  test("syncs only an exact audit version and maps provider status", async () => {
    for (const [providerStatus, status] of [
      [0, "audit_pending"],
      [1, "audit_approved"],
      [2, "audit_rejected"],
      [3, "failed"],
    ] as const) {
      const deps = dependencies();
      deps.releaseRepository.findById = mock(async () => ({
        ...release,
        status: "audit_pending",
      }));
      deps.gateway.getVersionList = mock(async () => ({
        audit: { version: release.template_version, status: providerStatus, reason: "provider reason" },
        logId: "versions-log",
      }));
      await new PlatformDouyinMiniappReleasesService(deps as never)
        .syncStatus(authContext, INSTALLATION_ID, RELEASE_ID);
      expect(deps.releaseRepository.updateClaimed).toHaveBeenCalledWith(RELEASE_ID, CLAIM_TOKEN, {
        status,
        auditResult: { status: status === "audit_pending" ? "pending"
          : status === "audit_approved" ? "approved"
          : status === "audit_rejected" ? "rejected" : "failed", reason: "provider reason" },
        douyinLogId: "versions-log",
        submittedAt: NOW,
        ...(status === "audit_pending" ? {} : { auditedAt: NOW }),
        platformOperatorId: OPERATOR_ID,
      });
      expect(deps.installationRepository.syncReleaseMetadata).toHaveBeenCalledWith(
        INSTALLATION_ID, RELEASE_ID, CLAIM_TOKEN,
      );
    }
  });

  test("rejects sync when Douyin has no exact audit version", async () => {
    const deps = dependencies();
    deps.releaseRepository.findById = mock(async () => ({ ...release, status: "audit_pending" }));
    deps.gateway.getVersionList = mock(async () => ({
      audit: { version: "9.9.9", status: 1 },
      logId: "versions-log",
    }));
    await expect(new PlatformDouyinMiniappReleasesService(deps as never)
      .syncStatus(authContext, INSTALLATION_ID, RELEASE_ID))
      .rejects.toMatchObject({ statusCode: 409 });
    expect(deps.releaseRepository.updateClaimed).toHaveBeenCalledWith(
      RELEASE_ID,
      CLAIM_TOKEN,
      { status: "audit_pending", platformOperatorId: OPERATOR_ID },
    );
    expect(deps.installationRepository.syncReleaseMetadata).not.toHaveBeenCalled();
  });

  test("publishes only after a fresh exact approved audit sync", async () => {
    const deps = dependencies();
    deps.releaseRepository.findById = mock(async () => ({
      ...release,
      status: "audit_pending",
    }));
    await new PlatformDouyinMiniappReleasesService(deps as never)
      .publish(authContext, INSTALLATION_ID, RELEASE_ID);
    expect(deps.gateway.getVersionList).toHaveBeenCalledTimes(1);
    expect(deps.gateway.releaseVersion).toHaveBeenCalledTimes(1);
    expect(deps.releaseRepository.updateClaimed).toHaveBeenLastCalledWith(RELEASE_ID, CLAIM_TOKEN, {
      status: "released",
      auditResult: { status: "approved" },
      submittedAt: NOW,
      auditedAt: NOW,
      releasedAt: NOW,
      douyinLogId: "release-log",
      platformOperatorId: OPERATOR_ID,
    });
    expect(deps.installationRepository.syncReleaseMetadata).toHaveBeenLastCalledWith(
      INSTALLATION_ID, RELEASE_ID, CLAIM_TOKEN,
    );
  });

  test("refuses publish when fresh exact audit status is not approved", async () => {
    for (const [providerStatus, status, auditStatus] of [
      [0, "audit_pending", "pending"],
      [2, "audit_rejected", "rejected"],
      [3, "failed", "failed"],
    ] as const) {
      const deps = dependencies();
      deps.releaseRepository.findById = mock(async () => ({
        ...release,
        status: "audit_approved",
      }));
      deps.gateway.getVersionList = mock(async () => ({
        audit: { version: release.template_version, status: providerStatus, reason: "fresh reason" },
        logId: "versions-log",
      }));
      await expect(new PlatformDouyinMiniappReleasesService(deps as never)
        .publish(authContext, INSTALLATION_ID, RELEASE_ID))
        .rejects.toMatchObject({ statusCode: 409, code: "DOUYIN_RELEASE_NOT_APPROVED" });
      expect(deps.releaseRepository.updateClaimed).toHaveBeenCalledWith(RELEASE_ID, CLAIM_TOKEN, {
        status,
        auditResult: { status: auditStatus, reason: "fresh reason" },
        douyinLogId: "versions-log",
        submittedAt: NOW,
        ...(status === "audit_pending" ? {} : { auditedAt: NOW }),
        platformOperatorId: OPERATOR_ID,
      });
      expect(deps.installationRepository.syncReleaseMetadata).toHaveBeenCalledWith(
        INSTALLATION_ID, RELEASE_ID, CLAIM_TOKEN,
      );
      expect(deps.gateway.releaseVersion).not.toHaveBeenCalled();
    }
  });

});
