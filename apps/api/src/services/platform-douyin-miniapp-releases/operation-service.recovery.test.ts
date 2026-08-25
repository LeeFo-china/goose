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
const NOW = "2026-07-20T03:00:00.000Z";
const LOCAL_ERROR = new AppError(500, "local write failed", "LOCAL_WRITE_FAILED");

const installation = {
  id: INSTALLATION_ID,
  authorizer_appid: "tt-authorizer-1",
  deployment_key: "merchant-demo",
  installation_kind: "merchant" as const,
  authorization_status: "active" as const,
  permission_snapshot: [{ id: 1 }],
};

function release(status: DouyinMiniappReleaseRecord["status"]): DouyinMiniappReleaseRecord {
  return {
    id: RELEASE_ID,
    installation_id: INSTALLATION_ID,
    template_id: "9133504853504535288",
    template_version: "1.2.3-beta.1",
    description: "装修模板首发",
    channel: "default",
    ext_json: {
      extEnable: true,
      extAppid: installation.authorizer_appid,
      ext: { deployment_key: installation.deployment_key },
    },
    status,
    douyin_log_id: null,
    test_qr_url: null,
    latest_test_qr_url: null,
    audit_qr_url: null,
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
}

function applyPatch(
  current: DouyinMiniappReleaseRecord,
  patch: UpdateDouyinMiniappReleaseInput,
): DouyinMiniappReleaseRecord {
  return {
    ...current,
    ...(patch.status !== undefined ? { status: patch.status } : {}),
    ...(patch.douyinLogId !== undefined ? { douyin_log_id: patch.douyinLogId } : {}),
    ...(patch.testQrUrl !== undefined ? { test_qr_url: patch.testQrUrl } : {}),
    ...(patch.auditHostNames !== undefined ? { audit_host_names: [...patch.auditHostNames] } : {}),
    ...(patch.auditNote !== undefined ? { audit_note: patch.auditNote } : {}),
    ...(patch.auditResult !== undefined ? { audit_result: patch.auditResult } : {}),
    ...(patch.submittedAt !== undefined ? { submitted_at: patch.submittedAt } : {}),
    ...(patch.auditedAt !== undefined ? { audited_at: patch.auditedAt } : {}),
    ...(patch.releasedAt !== undefined ? { released_at: patch.releasedAt } : {}),
    platform_operator_id: patch.platformOperatorId,
  };
}

function harness(
  status: DouyinMiniappReleaseRecord["status"],
  options: {
    metadataFailures?: number;
    initialRecovery?: boolean;
    patchFailureAt?: number;
    updateFailures?: number;
  } = {},
) {
  let current = release(status);
  let claims = 0;
  let uploadClaims = 0;
  let metadataCalls = 0;
  let patchCalls = 0;
  let updateCalls = 0;
  const initialRecovery = options.initialRecovery ?? false;
  const installationRepository = {
    syncReleaseMetadata: mock(async () => {
      metadataCalls += 1;
      if (metadataCalls <= (options.metadataFailures ?? 0)) throw LOCAL_ERROR;
      return true;
    }),
  };
  const patchClaimed = mock(async (
    _id: string,
    _token: string,
    patch: UpdateDouyinMiniappReleaseInput,
  ) => {
    patchCalls += 1;
    if (patchCalls === options.patchFailureAt) throw LOCAL_ERROR;
    return current = applyPatch(current, patch);
  });
  const updateClaimed = mock(async (
    _id: string,
    _token: string,
    patch: UpdateDouyinMiniappReleaseInput,
  ) => {
    updateCalls += 1;
    if (updateCalls <= (options.updateFailures ?? 0)) throw LOCAL_ERROR;
    return current = applyPatch(current, patch);
  });
  const releaseRepository = {
    findById: mock(async () => current),
    claimOperation: mock(async () => {
      claims += 1;
      return {
        releaseId: RELEASE_ID,
        claimToken: CLAIM_TOKEN,
        claimExpiresAt: "2026-07-20T03:02:00.000Z",
        recoveryRequired: initialRecovery || claims > 1,
      };
    }),
    getOrCreateAndClaimUpload: mock(async () => {
      uploadClaims += 1;
      return {
        ...current,
        operation_name: "upload" as const,
        operation_claim_token: CLAIM_TOKEN,
        operation_claim_expires_at: "2026-07-20T03:02:00.000Z",
        recovery_required: initialRecovery || uploadClaims > 1,
      };
    }),
    patchClaimed,
    updateClaimed,
  };
  const accessTokens = {
    getAuthorizerAccessToken: mock(async () => "authorizer-access-token"),
  };
  const gateway = {
    uploadTemplateVersion: mock(async () => ({ logId: "upload-log" })),
    getTestQrCode: mock(async () => ({ qrCodeUrl: "https://p3.douyinpic.com/qr.png", logId: "qr" })),
    getAvailableAuditHosts: mock(async () => ({
      hostNames: ["douyin", "toutiao"], releasedHostNames: [], logId: "hosts-log",
    })),
    submitVersionAudit: mock(async () => ({ logId: "audit-log" })),
    getVersionList: mock(async () => ({
      audit: { version: current.template_version, status: 1 }, logId: "versions-log",
    })),
    releaseVersion: mock(async () => ({ logId: "release-log" })),
  };
  const claimToken = mock(() => CLAIM_TOKEN);
  const operations = new PlatformDouyinMiniappReleaseOperations({
    installationRepository,
    releaseRepository,
    accessTokens,
    gateway,
    now: () => NOW,
    claimToken,
  } as never);
  return {
    operations,
    installationRepository,
    releaseRepository,
    accessTokens,
    gateway,
    claimToken,
    current: () => current,
  };
}

async function caught(operation: () => Promise<unknown>): Promise<unknown> {
  try {
    await operation();
  } catch (error) {
    return error;
  }
}

const uploadInput = {
  template_id: "9133504853504535288",
  template_version: "1.2.3-beta.1",
  description: "装修模板首发",
  channel: "default" as const,
};
const auditInput = { host_names: ["douyin", "toutiao"], audit_note: "装修模板提审" };

describe("Douyin miniapp release operation recovery", () => {
  test("upload reconciles after its successful mutator final patch failed", async () => {
    const h = harness("created", { patchFailureAt: 1 });
    expect(await caught(() => h.operations.upload(
      installation, INSTALLATION_ID, OPERATOR_ID, uploadInput,
    ))).toBe(LOCAL_ERROR);
    await h.operations.upload(installation, INSTALLATION_ID, OPERATOR_ID, uploadInput);
    expect(h.gateway.uploadTemplateVersion).toHaveBeenCalledTimes(1);
    expect(h.gateway.getVersionList).toHaveBeenCalledTimes(1);
    expect(h.current().status).toBe("audit_approved");
  });

  test("submit reconciles after its successful mutator final patch failed", async () => {
    const h = harness("testing", { patchFailureAt: 2 });
    expect(await caught(() => h.operations.submitAudit(
      installation, INSTALLATION_ID, h.current(), OPERATOR_ID, auditInput,
    ))).toBe(LOCAL_ERROR);
    await h.operations.submitAudit(
      installation, INSTALLATION_ID, h.current(), OPERATOR_ID, auditInput,
    );
    expect(h.gateway.submitVersionAudit).toHaveBeenCalledTimes(1);
    expect(h.gateway.getVersionList).toHaveBeenCalledTimes(1);
    expect(h.current().status).toBe("audit_approved");
  });

  test("publish reconciles current after its successful mutator final patch failed", async () => {
    const h = harness("audit_pending", { patchFailureAt: 2 });
    let versionCalls = 0;
    h.gateway.getVersionList = mock(async () => {
      versionCalls += 1;
      return versionCalls === 1
        ? { audit: { version: uploadInput.template_version, status: 1 }, logId: "audit-log" }
        : { current: { version: uploadInput.template_version }, logId: "current-log" };
    }) as never;
    expect(await caught(() => h.operations.publish(
      installation, INSTALLATION_ID, h.current(), OPERATOR_ID,
    ))).toBe(LOCAL_ERROR);
    await h.operations.publish(installation, INSTALLATION_ID, h.current(), OPERATOR_ID);
    expect(h.gateway.releaseVersion).toHaveBeenCalledTimes(1);
    expect(h.gateway.getVersionList).toHaveBeenCalledTimes(2);
    expect(h.current().status).toBe("released");
  });

  test("upload provider success followed by local failure retries without re-upload", async () => {
    const h = harness("created", { metadataFailures: 1 });
    expect(await caught(() => h.operations.upload(
      installation, INSTALLATION_ID, OPERATOR_ID, uploadInput,
    ))).toBe(LOCAL_ERROR);
    await h.operations.upload(installation, INSTALLATION_ID, OPERATOR_ID, uploadInput);
    expect(h.gateway.uploadTemplateVersion).toHaveBeenCalledTimes(1);
    expect(h.accessTokens.getAuthorizerAccessToken).toHaveBeenCalledTimes(1);
    expect(h.releaseRepository.updateClaimed).toHaveBeenCalledTimes(1);
  });

  test("metadata persistence uses release identity and exact claim token", async () => {
    const h = harness("created");
    await h.operations.upload(installation, INSTALLATION_ID, OPERATOR_ID, uploadInput);
    expect(h.installationRepository.syncReleaseMetadata).toHaveBeenCalledWith(
      INSTALLATION_ID,
      RELEASE_ID,
      CLAIM_TOKEN,
    );
  });

  test("submit provider success followed by local failure retries without re-submit", async () => {
    const h = harness("testing", { metadataFailures: 1 });
    expect(await caught(() => h.operations.submitAudit(
      installation, INSTALLATION_ID, h.current(), OPERATOR_ID, auditInput,
    ))).toBe(LOCAL_ERROR);
    await h.operations.submitAudit(
      installation, INSTALLATION_ID, h.current(), OPERATOR_ID, auditInput,
    );
    expect(h.gateway.submitVersionAudit).toHaveBeenCalledTimes(1);
    expect(h.gateway.getAvailableAuditHosts).toHaveBeenCalledTimes(1);
    expect(h.accessTokens.getAuthorizerAccessToken).toHaveBeenCalledTimes(1);
  });

  test("publish provider success followed by local failure retries without re-release", async () => {
    const h = harness("audit_pending", { metadataFailures: 1 });
    expect(await caught(() => h.operations.publish(
      installation, INSTALLATION_ID, h.current(), OPERATOR_ID,
    ))).toBe(LOCAL_ERROR);
    await h.operations.publish(installation, INSTALLATION_ID, h.current(), OPERATOR_ID);
    expect(h.gateway.releaseVersion).toHaveBeenCalledTimes(1);
    expect(h.gateway.getVersionList).toHaveBeenCalledTimes(1);
    expect(h.accessTokens.getAuthorizerAccessToken).toHaveBeenCalledTimes(1);
  });

  test("upload reconciliation to current repairs every applicable installation timestamp", async () => {
    const h = harness("created", { initialRecovery: true });
    h.gateway.getVersionList = mock(async () => ({
      current: { version: uploadInput.template_version }, logId: "versions-log",
    })) as never;
    await h.operations.upload(installation, INSTALLATION_ID, OPERATOR_ID, uploadInput);
    expect(h.gateway.uploadTemplateVersion).not.toHaveBeenCalled();
    expect(h.installationRepository.syncReleaseMetadata).toHaveBeenCalledWith(
      INSTALLATION_ID, RELEASE_ID, CLAIM_TOKEN,
    );
    expect(h.current()).toMatchObject({ submitted_at: NOW, audited_at: NOW, released_at: NOW });
  });

  test("submit reconciliation accepts host sets in any order and repairs current metadata", async () => {
    const h = harness("testing", { initialRecovery: true });
    await h.releaseRepository.patchClaimed(RELEASE_ID, CLAIM_TOKEN, {
      status: "testing",
      auditHostNames: ["toutiao", "douyin"],
      auditNote: auditInput.audit_note,
      platformOperatorId: OPERATOR_ID,
    });
    h.gateway.getVersionList = mock(async () => ({
      current: { version: uploadInput.template_version }, logId: "versions-log",
    })) as never;
    await h.operations.submitAudit(
      installation, INSTALLATION_ID, h.current(), OPERATOR_ID, auditInput,
    );
    expect(h.gateway.submitVersionAudit).not.toHaveBeenCalled();
    expect(h.installationRepository.syncReleaseMetadata).toHaveBeenCalledWith(
      INSTALLATION_ID, RELEASE_ID, CLAIM_TOKEN,
    );
    expect(h.current()).toMatchObject({ submitted_at: NOW, audited_at: NOW, released_at: NOW });
  });

  test("access token failure clears a normal claim and retains a recovery claim", async () => {
    const normal = harness("uploaded");
    normal.accessTokens.getAuthorizerAccessToken = mock(async () => { throw LOCAL_ERROR; }) as never;
    await caught(() => normal.operations.getTestQr(installation, normal.current(), OPERATOR_ID));
    expect(normal.releaseRepository.updateClaimed).toHaveBeenCalledTimes(1);
    expect(normal.releaseRepository.patchClaimed).not.toHaveBeenCalled();

    const recovery = harness("uploaded", { initialRecovery: true });
    recovery.accessTokens.getAuthorizerAccessToken = mock(async () => { throw LOCAL_ERROR; }) as never;
    await caught(() => recovery.operations.getTestQr(installation, recovery.current(), OPERATOR_ID));
    expect(recovery.releaseRepository.patchClaimed).toHaveBeenCalledTimes(1);
    expect(recovery.releaseRepository.updateClaimed).not.toHaveBeenCalled();
    expect(recovery.gateway.getTestQrCode).not.toHaveBeenCalled();
  });

  test("terminal metadata repair also survives a final claim-release update failure", async () => {
    const h = harness("created", { updateFailures: 1 });
    expect(await caught(() => h.operations.upload(
      installation, INSTALLATION_ID, OPERATOR_ID, uploadInput,
    ))).toBe(LOCAL_ERROR);
    await h.operations.upload(installation, INSTALLATION_ID, OPERATOR_ID, uploadInput);
    expect(h.gateway.uploadTemplateVersion).toHaveBeenCalledTimes(1);
    expect(h.installationRepository.syncReleaseMetadata).toHaveBeenCalledTimes(2);
    expect(h.releaseRepository.updateClaimed).toHaveBeenCalledTimes(2);
  });

  test("normal sync and publish clear their claim when audit evidence is invalid", async () => {
    for (const operation of ["sync", "publish"] as const) {
      for (const evidence of ["mismatch", "unsupported"] as const) {
        const h = harness("audit_pending");
        h.gateway.getVersionList = mock(async () => ({
          audit: {
            version: evidence === "mismatch" ? "9.9.9" : uploadInput.template_version,
            status: evidence === "unsupported" ? 99 : 1,
          },
          logId: "versions-log",
        })) as never;
        await caught(() => operation === "sync"
          ? h.operations.syncStatus(installation, INSTALLATION_ID, h.current(), OPERATOR_ID)
          : h.operations.publish(installation, INSTALLATION_ID, h.current(), OPERATOR_ID));
        expect(h.releaseRepository.updateClaimed).toHaveBeenCalledWith(
          RELEASE_ID,
          CLAIM_TOKEN,
          { status: "audit_pending", platformOperatorId: OPERATOR_ID },
        );
        expect(h.releaseRepository.patchClaimed).not.toHaveBeenCalled();
      }
    }
  });

  test("stale publish without exact current or audit evidence stays uncertain and claimed", async () => {
    const h = harness("audit_approved", { initialRecovery: true });
    h.gateway.getVersionList = mock(async () => ({ logId: "versions-log" })) as never;
    const error = await caught(() => h.operations.publish(
      installation, INSTALLATION_ID, h.current(), OPERATOR_ID,
    ));
    expect(error).toMatchObject({ code: "DOUYIN_RELEASE_OUTCOME_UNCERTAIN" });
    expect(h.releaseRepository.updateClaimed).not.toHaveBeenCalled();
    expect(h.releaseRepository.patchClaimed).not.toHaveBeenCalled();
  });

  test("pending audit reads repair lastSubmittedAt before releasing the claim", async () => {
    for (const operation of ["sync", "publish"] as const) {
      const h = harness("audit_pending");
      h.gateway.getVersionList = mock(async () => ({
        audit: { version: uploadInput.template_version, status: 0 },
        logId: "versions-log",
      })) as never;
      await caught(() => operation === "sync"
        ? h.operations.syncStatus(installation, INSTALLATION_ID, h.current(), OPERATOR_ID)
        : h.operations.publish(installation, INSTALLATION_ID, h.current(), OPERATOR_ID));
      expect(h.installationRepository.syncReleaseMetadata).toHaveBeenCalledWith(
        INSTALLATION_ID, RELEASE_ID, CLAIM_TOKEN,
      );
      expect(h.releaseRepository.updateClaimed).toHaveBeenCalledTimes(1);
    }
  });

  test("submit re-reads audit_pending after claim and repairs instead of resubmitting", async () => {
    const h = harness("testing");
    const stale = h.current();
    h.releaseRepository.findById = mock(async () => ({
      ...stale,
      status: "audit_pending" as const,
      audit_host_names: [...auditInput.host_names],
      audit_note: auditInput.audit_note,
      submitted_at: NOW,
    }));
    await h.operations.submitAudit(
      installation, INSTALLATION_ID, stale, OPERATOR_ID, auditInput,
    );
    expect(h.gateway.submitVersionAudit).not.toHaveBeenCalled();
    expect(h.gateway.getAvailableAuditHosts).not.toHaveBeenCalled();
    expect(h.installationRepository.syncReleaseMetadata).toHaveBeenCalledWith(
      INSTALLATION_ID, RELEASE_ID, CLAIM_TOKEN,
    );
  });

  test("publish re-reads released after claim and never calls releaseVersion", async () => {
    const h = harness("audit_approved");
    const stale = h.current();
    h.releaseRepository.findById = mock(async () => ({
      ...stale,
      status: "released" as const,
      submitted_at: NOW,
      audited_at: NOW,
      released_at: NOW,
    }));
    await h.operations.publish(installation, INSTALLATION_ID, stale, OPERATOR_ID);
    expect(h.gateway.getVersionList).not.toHaveBeenCalled();
    expect(h.gateway.releaseVersion).not.toHaveBeenCalled();
    expect(h.releaseRepository.updateClaimed).toHaveBeenCalledWith(
      RELEASE_ID,
      CLAIM_TOKEN,
      { status: "released", platformOperatorId: OPERATOR_ID },
    );
  });

  test("sync provider failure preserves the fresh rejected state read after claim", async () => {
    const h = harness("audit_pending");
    const stale = h.current();
    h.releaseRepository.findById = mock(async () => ({ ...stale, status: "audit_rejected" as const }));
    h.accessTokens.getAuthorizerAccessToken = mock(async () => { throw LOCAL_ERROR; }) as never;
    await caught(() => h.operations.syncStatus(
      installation, INSTALLATION_ID, stale, OPERATOR_ID,
    ));
    expect(h.releaseRepository.updateClaimed).toHaveBeenCalledWith(
      RELEASE_ID,
      CLAIM_TOKEN,
      expect.objectContaining({ status: "audit_rejected" }),
    );
  });

  test("release timeout retains claim and stale recovery never replays releaseVersion", async () => {
    const h = harness("audit_pending");
    h.gateway.releaseVersion = mock(async () => { throw LOCAL_ERROR; }) as never;
    await caught(() => h.operations.publish(
      installation, INSTALLATION_ID, h.current(), OPERATOR_ID,
    ));
    const error = await caught(() => h.operations.publish(
      installation, INSTALLATION_ID, h.current(), OPERATOR_ID,
    ));
    expect(error).toMatchObject({ code: "DOUYIN_RELEASE_OUTCOME_UNCERTAIN" });
    expect(h.gateway.releaseVersion).toHaveBeenCalledTimes(1);
    expect(h.releaseRepository.patchClaimed).toHaveBeenCalled();
    expect(h.releaseRepository.updateClaimed).not.toHaveBeenCalled();
  });

  test("upload access token failure keeps created retryable and next attempt uploads once", async () => {
    const h = harness("created");
    let tokenCalls = 0;
    h.accessTokens.getAuthorizerAccessToken = mock(async () => {
      tokenCalls += 1;
      if (tokenCalls === 1) throw LOCAL_ERROR;
      return "authorizer-access-token";
    }) as never;
    h.releaseRepository.getOrCreateAndClaimUpload = mock(async () => ({
      ...h.current(),
      operation_name: "upload" as const,
      operation_claim_token: CLAIM_TOKEN,
      operation_claim_expires_at: "2026-07-20T03:02:00.000Z",
      recovery_required: false,
    }));
    await caught(() => h.operations.upload(
      installation, INSTALLATION_ID, OPERATOR_ID, uploadInput,
    ));
    expect(h.current().status).toBe("created");
    await h.operations.upload(installation, INSTALLATION_ID, OPERATOR_ID, uploadInput);
    expect(h.gateway.uploadTemplateVersion).toHaveBeenCalledTimes(1);
    expect(h.current()).toMatchObject({ status: "uploaded", audit_result: null });
  });
});
