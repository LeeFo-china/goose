import { describe, expect, test } from "bun:test";
import type { DouyinMiniappReleaseRecord } from "@/repositories/douyin-miniapp-releases";
import { buildTenantDouyinReleaseOptions } from "./release-options";

const template = {
  id: "11111111-1111-4111-8111-111111111111",
  template_app_id: "tt0d647bd99301341b01" as const,
  source_draft_id: "1024",
  template_id: "78690",
  template_version: "0.1.39",
  description: "新版模板",
  channel: "default" as const,
  is_current: true,
  confirmed_by_employee_id: "22222222-2222-4222-8222-222222222222",
  confirmed_at: "2026-09-17T10:00:00.000Z",
  created_at: "2026-09-17T10:00:00.000Z",
};
const release: DouyinMiniappReleaseRecord = {
  id: "33333333-3333-4333-8333-333333333333",
  installation_id: "44444444-4444-4444-8444-444444444444",
  template_id: "78689", template_version: "0.1.39", description: "旧模板",
  provider_summary: "[#78689] 旧模板", channel: "default", ext_json: {
    extEnable: true, extAppid: "tt-authorizer",
    ext: { deployment_key: "merchant-demo", deployment_environment: "production" },
  }, status: "testing",
  douyin_log_id: null, test_qr_url: "https://example.test/qr.png",
  latest_test_qr_url: "https://example.test/qr.png", audit_qr_url: null,
  audit_host_names: [], audit_note: null, audit_result: null, submitted_at: null,
  audited_at: null, released_at: null,
  platform_operator_id: "55555555-5555-4555-8555-555555555555",
  created_at: "2026-09-17T09:00:00.000Z", updated_at: "2026-09-17T09:00:00.000Z",
};

describe("tenant Douyin release options", () => {
  test("offers a confirmed same-version revision instead of the legacy test release", () => {
    expect(buildTenantDouyinReleaseOptions({
      template,
      releases: [release],
      versions: {
        latest: { version: "0.1.39", summary: "[#78689] 旧模板" },
        logId: "versions-log",
      },
    })).toEqual([expect.objectContaining({
      source: "confirmed_template", template_id: "78690",
      stage: "ready_to_upload", actions: ["create_test_version"],
    })]);
  });

  test("offers actions only when the exact marked provider stage matches", () => {
    const current = { ...release, template_id: "78690", description: "新版模板",
      provider_summary: "[#78690] 新版模板" };
    expect(buildTenantDouyinReleaseOptions({
      template, releases: [current], versions: {
        latest: { version: "0.1.39", summary: "[#78690] 新版模板" }, logId: "ok",
      },
    })[0]).toMatchObject({ source: "release", actions: ["submit_audit"] });
    expect(buildTenantDouyinReleaseOptions({
      template, releases: [current], versions: {
        latest: { version: "0.1.39", summary: "[#78689] 旧模板" }, logId: "wrong",
      },
    })).toEqual([]);
  });

  test("keeps a confirmed template selectable when provider status is unavailable", () => {
    expect(buildTenantDouyinReleaseOptions({ template, releases: [release], versions: null }))
      .toEqual([expect.objectContaining({ actions: ["create_test_version"] })]);
  });
});
