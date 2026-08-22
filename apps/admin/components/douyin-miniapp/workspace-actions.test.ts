import { describe, expect, mock, test } from "bun:test";

import {
  availableWorkspaceActions,
  canSubmitAudit,
  parseAuditHostNames,
  startAuthorizationFlow,
} from "./workspace-actions";
import type { TenantDouyinWorkspace } from "./workspace-types";

function approvedWorkspace(): TenantDouyinWorkspace {
  return {
    tenant: {
      id: "00000000-0000-4000-8000-000000000001",
      name: "好店装修内部租户",
    },
    authorization_state: "active",
    release_state: "audit_approved",
    installation: {
      id: "00000000-0000-4000-8000-000000000002",
      authorizer_appid: "ttd033a68e4e56ccd301",
      installation_kind: "merchant",
      authorization_status: "active",
      permission_snapshot: [{ id: 1 }],
      runtime_config: {
        brand: { logo_url: null, qualifications: [] },
        theme: {
          primary_color: "#F5B900",
          navigation_text_color: "black",
        },
        features: {
          cases: true,
          sites: true,
          sms_lead: true,
          douyin_phone: false,
          phone_capture_mode: "sms",
        },
        home_banners: [],
        trust_metrics: [],
        privacy_policy_version: "2026-07",
      },
      template_version: "0.1.2",
      template_release_id: "00000000-0000-4000-8000-000000000003",
      created_at: "2026-07-26T08:00:00.000Z",
      updated_at: "2026-07-26T09:00:00.000Z",
    },
    public_profile: {
      public_name: "好店装修服务",
      introduction: "专注施工档案与透明装修服务",
      public_phone: "0371-12345678",
      status: "published",
      version: 2,
      submitted_at: "2026-07-25T08:00:00.000Z",
      reviewed_at: "2026-07-25T09:00:00.000Z",
      review_remark: null,
      published_at: "2026-07-25T10:00:00.000Z",
      updated_at: "2026-07-25T10:00:00.000Z",
    },
    public_content: {
      cases: 6,
      sites: 3,
      active_service_areas: 2,
    },
    available_template: {
      template_id: "77595",
      version: "0.1.2",
      description: "租户品牌、案例、工地与免费咨询联调版本",
      confirmed_at: "2026-07-26T08:00:00.000Z",
      state: "in_progress",
    },
    latest_release: {
      id: "00000000-0000-4000-8000-000000000003",
      installation_id: "00000000-0000-4000-8000-000000000002",
      template_id: "77595",
      template_version: "0.1.2",
      description: "租户品牌、案例、工地与免费咨询联调版本",
      status: "audit_approved",
      test_qr_url: "https://example.com/qr.png",
      audit_host_names: ["douyin"],
      audit_note: "装修行业模板联调版本",
      audit_result: {
        audit_id: "audit-1",
        status: "approved",
      },
      submitted_at: "2026-07-26T09:30:00.000Z",
      audited_at: "2026-07-26T10:00:00.000Z",
      released_at: null,
      created_at: "2026-07-26T08:00:00.000Z",
      updated_at: "2026-07-26T10:00:00.000Z",
    },
  };
}

describe("tenant Douyin workspace actions", () => {
  test("offers production publish after audit approval", () => {
    expect(availableWorkspaceActions(approvedWorkspace())).toEqual([
      "publish",
    ]);
  });

  test("offers current-template creation when a new version is available", () => {
    const workspace = approvedWorkspace();
    workspace.available_template = {
      template_id: "77596",
      version: "0.1.4",
      description: "新版工地页面",
      confirmed_at: "2026-08-13T08:00:00.000Z",
      state: "new_available",
    };
    workspace.release_state = "released";
    if (workspace.latest_release) {
      workspace.latest_release.status = "released";
      workspace.latest_release.released_at = "2026-07-26T10:00:00.000Z";
    }

    expect(availableWorkspaceActions(workspace)).toEqual([
      "create_test_version",
    ]);
  });

  test("continues an unfinished release before offering the newer template", () => {
    const expectations = [
      ["created", "create_test_version"],
      ["uploaded", "get_test_qr"],
      ["testing", "submit_audit"],
      ["audit_pending", "sync_status"],
      ["audit_approved", "publish"],
    ] as const;

    for (const [status, action] of expectations) {
      const workspace = approvedWorkspace();
      workspace.available_template = {
        template_id: "77596",
        version: "0.1.4",
        description: "新版工地页面",
        confirmed_at: "2026-08-13T08:00:00.000Z",
        state: "new_available",
      };
      workspace.release_state = status;
      if (workspace.latest_release) {
        workspace.latest_release.status = status;
      }

      expect(availableWorkspaceActions(workspace)).toEqual([action]);
    }
  });

  test("offers status sync for rejected or failed releases", () => {
    for (const [releaseState, status] of [
      ["audit_rejected", "audit_rejected"],
      ["sync_error", "failed"],
    ] as const) {
      const workspace = approvedWorkspace();
      workspace.release_state = releaseState;
      if (workspace.latest_release) {
        workspace.latest_release.status = status;
      }

      expect(availableWorkspaceActions(workspace)).toEqual(["sync_status"]);
    }
  });

  test("keeps status sync visible while a newer template is available", () => {
    for (const [releaseState, status] of [
      ["audit_rejected", "audit_rejected"],
      ["sync_error", "failed"],
    ] as const) {
      const workspace = approvedWorkspace();
      workspace.available_template = {
        template_id: "77596",
        version: "0.1.4",
        description: "新版工地页面",
        confirmed_at: "2026-08-13T08:00:00.000Z",
        state: "new_available",
      };
      workspace.release_state = releaseState;
      if (workspace.latest_release) {
        workspace.latest_release.status = status;
      }

      expect(availableWorkspaceActions(workspace)).toEqual([
        "sync_status",
        "create_test_version",
      ]);
    }
  });

  test("requires every audit checklist item", () => {
    expect(canSubmitAudit({
      authorizationActive: true,
      profilePublished: true,
      testQrReady: true,
      readinessReady: true,
      auditFieldsComplete: false,
    })).toBe(false);
  });

  test("normalizes comma and newline separated host names without duplicates", () => {
    expect(parseAuditHostNames("douyin, open.douyin.com\ndouyin")).toEqual([
      "douyin",
      "open.douyin.com",
    ]);
  });

  test("offers a new QR when the stored signed URL is expired", () => {
    const workspace = approvedWorkspace();
    workspace.release_state = "testing";
    if (workspace.latest_release) {
      workspace.latest_release.status = "testing";
      workspace.latest_release.test_qr_url =
        "https://p3-developer-sign.bytemaimg.com/test.jpeg?x-expires=1";
    }

    expect(availableWorkspaceActions(workspace)).toEqual(["get_test_qr"]);
  });

  test("opens a blank tab before requesting the authorization link", async () => {
    const events: string[] = [];
    const replace = mock((url: string) => events.push(`replace:${url}`));
    const close = mock(() => events.push("close"));

    await startAuthorizationFlow({
      openPopup: () => {
        events.push("open");
        return { close, location: { replace } };
      },
      requestLink: async () => {
        events.push("request");
        return { link: "https://open.douyin.com/authorize/example" };
      },
    });

    expect(events).toEqual([
      "open",
      "request",
      "replace:https://open.douyin.com/authorize/example",
    ]);
    expect(close).not.toHaveBeenCalled();
  });

  test("does not generate a link when the browser blocks the popup", async () => {
    const requestLink = mock(async () => ({
      link: "https://open.douyin.com/authorize/example",
    }));

    await expect(startAuthorizationFlow({
      openPopup: () => null,
      requestLink,
    })).rejects.toMatchObject({ code: "DOUYIN_AUTHORIZATION_POPUP_BLOCKED" });
    expect(requestLink).not.toHaveBeenCalled();
  });
});
