import { describe, expect, test } from "bun:test";
import {
  douyinAuditRejectionReason,
  getDouyinReleaseAuditOptions,
  releaseAuditStatusLabel,
  releaseAuditStatusTone,
  type PlatformDouyinInstallation,
  type PlatformDouyinReleaseAudit,
} from "./platform-douyin-release-audit-rules";

const installations: PlatformDouyinInstallation[] = [
  {
    id: "merchant-1",
    authorizer_appid: "ttd033a68e4e56ccd301",
    installation_kind: "merchant",
    authorization_status: "active",
    tenant: { id: "tenant-1", name: "固始晴天" },
  },
  {
    id: "template-1",
    authorizer_appid: "tt0d647bd99301341b01",
    installation_kind: "template_development",
    authorization_status: "active",
    tenant: { id: "tenant-2", name: "模板租户" },
  },
];

describe("getDouyinReleaseAuditOptions", () => {
  test("selects only active merchant installations", () => {
    expect(getDouyinReleaseAuditOptions(installations)).toEqual({
      merchants: [installations[0]],
      defaultMerchantId: "merchant-1",
    });
  });

  test("fails closed when no merchant is available", () => {
    expect(getDouyinReleaseAuditOptions([])).toEqual({
      merchants: [],
      defaultMerchantId: "",
    });
  });
});

describe("release audit status display", () => {
  test("labels and tones rejected releases as dangerous", () => {
    expect(releaseAuditStatusLabel("audit_rejected")).toBe("审核驳回");
    expect(releaseAuditStatusTone("audit_rejected")).toBe("danger");
  });
});

describe("douyinAuditRejectionReason", () => {
  test("returns the official reason only for rejected releases", () => {
    const release: PlatformDouyinReleaseAudit = {
      id: "release-1",
      installation_id: "merchant-1",
      template_id: "77595",
      template_version: "0.1.3",
      description: "体验版",
      status: "audit_rejected",
      audit_result: {
        status: "rejected",
        reason: "小程序功能不完整且可用性低",
      },
      audited_at: "2026-08-14T10:33:11.784+00:00",
      updated_at: "2026-08-14T10:33:11.826+00:00",
    };

    expect(douyinAuditRejectionReason(release)).toBe(
      "小程序功能不完整且可用性低",
    );
  });

  test("does not expose a stale reason for non-rejected releases", () => {
    const release: PlatformDouyinReleaseAudit = {
      id: "release-2",
      installation_id: "merchant-1",
      template_id: "77595",
      template_version: "0.1.3",
      description: "体验版",
      status: "audit_pending",
      audit_result: { status: "pending", reason: "should not render" },
      audited_at: null,
      updated_at: "2026-08-14T10:33:11.826+00:00",
    };

    expect(douyinAuditRejectionReason(release)).toBeNull();
  });
});
