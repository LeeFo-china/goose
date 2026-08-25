import { describe, expect, mock, test } from "bun:test";
import { AppError } from "@/errors/app-error";
import type {
  DouyinMiniappReleaseRecord,
  UpdateDouyinMiniappReleaseInput,
} from "@/repositories/douyin-miniapp-releases";
import { PlatformDouyinMiniappReleaseOperations } from "./operation-service";

const INSTALLATION_ID = "22222222-2222-4222-8222-222222222222";
const RELEASE_ID = "11111111-1111-4111-8111-111111111111";
const OPERATOR_ID = "55555555-5555-4555-8555-555555555555";
const CLAIM_TOKEN = "77777777-7777-4777-8777-777777777777";
const NOW = "2026-07-27T01:00:00.000Z";
const auditInput = {
  host_names: ["douyin"],
  audit_note: "装修模板提审",
};
const installation = {
  id: INSTALLATION_ID,
  authorizer_appid: "tt-authorizer-1",
  deployment_key: "merchant-demo",
  installation_kind: "merchant" as const,
  authorization_status: "active" as const,
  permission_snapshot: [{ id: 1 }],
};

function release(
  overrides: Partial<DouyinMiniappReleaseRecord> = {},
): DouyinMiniappReleaseRecord {
  return {
    id: RELEASE_ID,
    installation_id: INSTALLATION_ID,
    template_id: "77595",
    template_version: "0.1.2",
    description: "装修模板联调",
    channel: "default",
    ext_json: {
      extEnable: true,
      extAppid: installation.authorizer_appid,
      ext: { deployment_key: installation.deployment_key },
    },
    status: "testing",
    douyin_log_id: null,
    test_qr_url: "https://p3.douyinpic.com/test.png",
    latest_test_qr_url: "https://p3.douyinpic.com/test.png",
    audit_qr_url: null,
    audit_host_names: [],
    audit_note: null,
    audit_result: null,
    submitted_at: null,
    audited_at: null,
    released_at: null,
    platform_operator_id: OPERATOR_ID,
    created_at: "2026-07-26T01:00:00.000Z",
    updated_at: "2026-07-26T01:00:00.000Z",
    ...overrides,
  };
}

function applyPatch(
  current: DouyinMiniappReleaseRecord,
  patch: UpdateDouyinMiniappReleaseInput,
): DouyinMiniappReleaseRecord {
  return {
    ...current,
    ...(patch.status !== undefined ? { status: patch.status } : {}),
    ...(patch.douyinLogId !== undefined
      ? { douyin_log_id: patch.douyinLogId }
      : {}),
    ...(patch.testQrUrl !== undefined
      ? { test_qr_url: patch.testQrUrl }
      : {}),
    ...(patch.latestTestQrUrl !== undefined
      ? { latest_test_qr_url: patch.latestTestQrUrl }
      : {}),
    ...(patch.auditQrUrl !== undefined ? { audit_qr_url: patch.auditQrUrl } : {}),
    ...(patch.auditHostNames !== undefined
      ? { audit_host_names: [...patch.auditHostNames] }
      : {}),
    ...(patch.auditNote !== undefined ? { audit_note: patch.auditNote } : {}),
    ...(patch.auditResult !== undefined
      ? { audit_result: patch.auditResult }
      : {}),
    ...(patch.submittedAt !== undefined
      ? { submitted_at: patch.submittedAt }
      : {}),
    ...(patch.auditedAt !== undefined
      ? { audited_at: patch.auditedAt }
      : {}),
    platform_operator_id: patch.platformOperatorId,
  };
}

function harness(
  initial: DouyinMiniappReleaseRecord,
  submitVersionAudit: () => Promise<{ readonly logId: string }>,
  getAuthorizerAccessToken: () => Promise<string> = async () =>
    "authorizer-access-token",
) {
  let current = initial;
  const patchClaimed = mock(async (
    _id: string,
    _claimToken: string,
    patch: UpdateDouyinMiniappReleaseInput,
  ) => current = applyPatch(current, patch));
  const updateClaimed = mock(async (
    _id: string,
    _claimToken: string,
    patch: UpdateDouyinMiniappReleaseInput,
  ) => current = applyPatch(current, patch));
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
    submitVersionAudit: mock(submitVersionAudit),
    getVersionList: mock(async () => ({ logId: "versions-log" })),
    releaseVersion: mock(async () => ({ logId: "release-log" })),
  };
  const operations = new PlatformDouyinMiniappReleaseOperations({
    installationRepository: {
      syncReleaseMetadata: mock(async () => true),
    },
    releaseRepository: {
      findById: mock(async () => current),
      claimOperation: mock(async () => ({
        releaseId: RELEASE_ID,
        claimToken: CLAIM_TOKEN,
        claimExpiresAt: "2026-07-27T01:02:00.000Z",
        recoveryRequired: false,
      })),
      getOrCreateAndClaimUpload: mock(async () => null),
      patchClaimed,
      updateClaimed,
    },
    accessTokens: {
      getAuthorizerAccessToken: mock(getAuthorizerAccessToken),
    },
    gateway,
    now: () => NOW,
    claimToken: () => CLAIM_TOKEN,
  } as never);
  return { operations, gateway, current: () => current };
}

async function caught(operation: () => Promise<unknown>): Promise<unknown> {
  try {
    await operation();
  } catch (error) {
    return error;
  }
}

describe("Douyin audit retry state", () => {
  test("regenerates a test QR from an audit rejection and clears review outcome", async () => {
    const h = harness(release({
      status: "audit_rejected",
      test_qr_url:
        "https://p3-developer-sign.bytemaimg.com/test.jpeg?x-expires=1",
      audit_host_names: ["douyin"],
      audit_note: "上次审核说明",
      audit_result: { status: "rejected", reason: "功能不完整" },
      submitted_at: "2026-07-26T02:00:00.000Z",
      audited_at: "2026-07-26T03:00:00.000Z",
    }), async () => ({ logId: "audit-log" }));

    await h.operations.getTestQr(installation, h.current(), OPERATOR_ID);

    expect(h.gateway.getTestQrCode).toHaveBeenCalledTimes(1);
    expect(h.current()).toMatchObject({
      status: "testing",
      test_qr_url: "https://p3.douyinpic.com/test.png",
      audit_host_names: [],
      audit_note: null,
      audit_result: null,
      submitted_at: null,
      audited_at: null,
    });
  });

  test("resubmits an audit rejection with a fresh audit intent", async () => {
    const h = harness(release({
      status: "audit_rejected",
      audit_host_names: ["old.douyin.com"],
      audit_note: "上次审核说明",
      audit_result: { status: "rejected", reason: "功能不完整" },
      submitted_at: "2026-07-26T02:00:00.000Z",
      audited_at: "2026-07-26T03:00:00.000Z",
    }), async () => ({ logId: "audit-retry-log" }));

    await h.operations.submitAudit(
      installation,
      INSTALLATION_ID,
      h.current(),
      OPERATOR_ID,
      auditInput,
    );

    expect(h.gateway.getAvailableAuditHosts).toHaveBeenCalledTimes(1);
    expect(h.gateway.submitVersionAudit).toHaveBeenCalledTimes(1);
    expect(h.current()).toMatchObject({
      status: "audit_pending",
      audit_host_names: auditInput.host_names,
      audit_note: auditInput.audit_note,
      audit_result: null,
      submitted_at: NOW,
      audited_at: null,
    });
  });

  test("retries after a new explicit platform rejection", async () => {
    let attempts = 0;
    const h = harness(release(), async () => {
      attempts += 1;
      if (attempts === 1) {
        throw new AppError(
          502,
          "平台拒绝",
          "DOUYIN_OPEN_PLATFORM_API_ERROR",
        );
      }
      return { logId: "audit-retry-log" };
    });

    await caught(() => h.operations.submitAudit(
      installation,
      INSTALLATION_ID,
      h.current(),
      OPERATOR_ID,
      auditInput,
    ));
    await h.operations.submitAudit(
      installation,
      INSTALLATION_ID,
      h.current(),
      OPERATOR_ID,
      auditInput,
    );

    expect(h.gateway.submitVersionAudit).toHaveBeenCalledTimes(2);
    expect(h.gateway.getVersionList).not.toHaveBeenCalled();
    expect(h.current()).toMatchObject({
      status: "audit_pending",
      audit_result: null,
    });
  });

  test("repairs a legacy explicit rejection before resubmitting", async () => {
    const h = harness(release({
      audit_host_names: auditInput.host_names,
      audit_note: auditInput.audit_note,
      audit_result: {
        status: "failed",
        error_code: "DOUYIN_OPEN_PLATFORM_API_ERROR",
      },
    }), async () => ({ logId: "legacy-retry-log" }));

    await h.operations.submitAudit(
      installation,
      INSTALLATION_ID,
      h.current(),
      OPERATOR_ID,
      auditInput,
    );

    expect(h.gateway.submitVersionAudit).toHaveBeenCalledTimes(1);
    expect(h.gateway.getVersionList).not.toHaveBeenCalled();
    expect(h.current()).toMatchObject({
      status: "audit_pending",
      audit_result: null,
    });
  });

  test("keeps a timeout intent and reconciles without resubmitting", async () => {
    const h = harness(release(), async () => {
      throw new AppError(502, "请求超时", "DOUYIN_OPEN_PLATFORM_TIMEOUT");
    });

    await caught(() => h.operations.submitAudit(
      installation,
      INSTALLATION_ID,
      h.current(),
      OPERATOR_ID,
      auditInput,
    ));
    const retryError = await caught(() => h.operations.submitAudit(
      installation,
      INSTALLATION_ID,
      h.current(),
      OPERATOR_ID,
      auditInput,
    ));

    expect(retryError).toMatchObject({
      code: "DOUYIN_RELEASE_OUTCOME_UNCERTAIN",
    });
    expect(h.gateway.submitVersionAudit).toHaveBeenCalledTimes(1);
    expect(h.gateway.getVersionList).toHaveBeenCalledTimes(1);
    expect(h.current()).toMatchObject({
      audit_host_names: auditInput.host_names,
      audit_note: auditInput.audit_note,
      audit_result: {
        status: "failed",
        error_code: "DOUYIN_OPEN_PLATFORM_TIMEOUT",
      },
    });
  });

  test("does not let a credential error reclassify an uncertain audit", async () => {
    let accessTokenCalls = 0;
    const h = harness(
      release(),
      async () => {
        throw new AppError(502, "请求超时", "DOUYIN_OPEN_PLATFORM_TIMEOUT");
      },
      async () => {
        accessTokenCalls += 1;
        if (accessTokenCalls === 2) {
          throw new AppError(
            502,
            "凭证请求失败",
            "DOUYIN_OPEN_PLATFORM_API_ERROR",
          );
        }
        return "authorizer-access-token";
      },
    );

    await caught(() => h.operations.submitAudit(
      installation,
      INSTALLATION_ID,
      h.current(),
      OPERATOR_ID,
      auditInput,
    ));
    await caught(() => h.operations.submitAudit(
      installation,
      INSTALLATION_ID,
      h.current(),
      OPERATOR_ID,
      auditInput,
    ));
    const retryError = await caught(() => h.operations.submitAudit(
      installation,
      INSTALLATION_ID,
      h.current(),
      OPERATOR_ID,
      auditInput,
    ));

    expect(retryError).toMatchObject({
      code: "DOUYIN_RELEASE_OUTCOME_UNCERTAIN",
    });
    expect(h.gateway.submitVersionAudit).toHaveBeenCalledTimes(1);
    expect(h.gateway.getVersionList).toHaveBeenCalledTimes(1);
    expect(h.current().audit_result).toEqual({
      status: "failed",
      error_code: "DOUYIN_OPEN_PLATFORM_TIMEOUT",
    });
  });
});
