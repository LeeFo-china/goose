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
  test("does not offer publish to tenant users", () => {
    expect(availableWorkspaceActions(approvedWorkspace())).toEqual([
      "sync_status",
    ]);
  });

  test("requires every audit checklist item", () => {
    expect(canSubmitAudit({
      authorizationActive: true,
      profilePublished: true,
      testQrReady: true,
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
