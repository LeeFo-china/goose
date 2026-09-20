import { describe, expect, test } from "bun:test";
import { selectDefaultReleaseOption, versionActionCopy } from "./workspace-version-policy";
import type { TenantDouyinReleaseOption } from "./workspace-types";

function option(overrides: Partial<TenantDouyinReleaseOption> = {}): TenantDouyinReleaseOption {
  return {
    id: "11111111-1111-4111-8111-111111111111", source: "release",
    release_id: "11111111-1111-4111-8111-111111111111", template_id: "78689",
    template_version: "0.1.39", description: "旧模板", stage: "testing",
    actions: ["submit_audit"], test_qr_url: null,
    updated_at: "2026-09-17T10:00:00.000Z", is_recommended: false,
    selection_kind: "release", ...overrides,
  };
}

describe("Douyin workspace version policy", () => {
  test("defaults to the confirmed template revision", () => {
    const confirmed = option({ id: "22222222-2222-4222-8222-222222222222",
      source: "confirmed_template", release_id: null, template_id: "78690",
      stage: "ready_to_upload", actions: ["create_test_version"],
      is_recommended: true, selection_kind: "recommended" });
    expect(selectDefaultReleaseOption([option(), confirmed])).toBe(confirmed);
  });

  test("describes the exact revision action", () => {
    expect(versionActionCopy(option({ source: "confirmed_template", release_id: null,
      template_id: "78690", stage: "ready_to_upload",
      actions: ["create_test_version"], is_recommended: true,
      selection_kind: "recommended" }))).toEqual({
      title: "0.1.39 · 推荐版本",
      description: "旧模板",
      primaryLabel: "生成 0.1.39 测试码",
    });
  });

  test("prefers the recommendation and explains rollback review", () => {
    const stable = option({ id: "22222222-2222-4222-8222-222222222222",
      source: "confirmed_template", release_id: null, selection_kind: "stable" });
    const recommended = option({ id: "33333333-3333-4333-8333-333333333333",
      source: "confirmed_template", release_id: null, is_recommended: true,
      selection_kind: "recommended" });
    expect(selectDefaultReleaseOption([stable, recommended])).toBe(recommended);
    expect(versionActionCopy(option({ source: "confirmed_template", release_id: null,
      selection_kind: "rollback" }))).toMatchObject({
      title: "0.1.39 · 旧版回退",
      description: "生成后需要重新体验、提审和发布，不会立即替换当前线上版本。",
    });
  });

  test("posts the selected template identity to the explicit endpoint", async () => {
    const source = await Bun.file("components/douyin-miniapp/workspace-actions.tsx").text();
    expect(source).toContain('"/tenant/douyin-miniapp/releases/from-template"');
    expect(source).toContain("expected_template_record_id: selectedOption.id");
    expect(source).toContain("expected_template_id: selectedOption.template_id");
  });
});
