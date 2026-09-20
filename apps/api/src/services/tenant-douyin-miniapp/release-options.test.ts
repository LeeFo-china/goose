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
  is_tenant_selectable: true,
  confirmed_by_employee_id: "22222222-2222-4222-8222-222222222222",
  confirmed_at: "2026-09-17T10:00:00.000Z",
  selectability_updated_at: "2026-09-17T10:00:00.000Z",
  selectability_updated_by_employee_id: "22222222-2222-4222-8222-222222222222",
  created_at: "2026-09-17T10:00:00.000Z",
};
const release: DouyinMiniappReleaseRecord = {
  id: "33333333-3333-4333-8333-333333333333",
  installation_id: "44444444-4444-4444-8444-444444444444",
  deployable_template_id: null,
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
      templates: [template],
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
      templates: [template], releases: [current], versions: {
        latest: { version: "0.1.39", summary: "[#78690] 新版模板" }, logId: "ok",
      },
    })[0]).toMatchObject({ source: "release", actions: ["submit_audit"] });
    expect(buildTenantDouyinReleaseOptions({
      templates: [template], releases: [current], versions: {
        latest: { version: "0.1.39", summary: "[#78689] 旧模板" }, logId: "wrong",
      },
    })).toEqual([]);
  });

  test("keeps a confirmed template selectable when provider status is unavailable", () => {
    expect(buildTenantDouyinReleaseOptions({ templates: [template], releases: [release], versions: null }))
      .toEqual([expect.objectContaining({ actions: ["create_test_version"] })]);
  });

  test("labels current, stable, and rollback templates without hiding selectable history", () => {
    const stable = { ...template, id: "66666666-6666-4666-8666-666666666666",
      template_id: "78688", template_version: "0.1.38", is_current: false };
    const rollback = { ...template, id: "77777777-7777-4777-8777-777777777777",
      template_id: "78687", template_version: "0.1.37", is_current: false };

    const options = buildTenantDouyinReleaseOptions({
      templates: [template, stable, rollback], releases: [], versions: {
        current: { version: "0.1.38", summary: "[#78688] 稳定模板" },
        logId: "versions-log",
      },
    });

    expect(options.map((item) => [item.template_id, item.selection_kind,
      item.is_recommended, item.actions])).toEqual([
      ["78690", "recommended", true, ["create_test_version"]],
      ["78688", "current_online", false, []],
      ["78687", "rollback", false, ["create_test_version"]],
    ]);
  });
});
