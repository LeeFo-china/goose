import { describe, expect, test } from "bun:test";
import { selectDefaultReleaseOption, versionActionCopy } from "./workspace-version-policy";
import type { TenantDouyinReleaseOption } from "./workspace-types";

function option(overrides: Partial<TenantDouyinReleaseOption> = {}): TenantDouyinReleaseOption {
  return {
    id: "11111111-1111-4111-8111-111111111111", source: "release",
    release_id: "11111111-1111-4111-8111-111111111111", template_id: "78689",
    template_version: "0.1.39", description: "旧模板", stage: "testing",
    actions: ["submit_audit"], test_qr_url: null,
    updated_at: "2026-09-17T10:00:00.000Z", ...overrides,
  };
}

describe("Douyin workspace version policy", () => {
  test("defaults to the confirmed template revision", () => {
    const confirmed = option({ id: "22222222-2222-4222-8222-222222222222",
      source: "confirmed_template", release_id: null, template_id: "78690",
      stage: "ready_to_upload", actions: ["create_test_version"] });
    expect(selectDefaultReleaseOption([option(), confirmed])).toBe(confirmed);
  });

  test("describes the exact revision action", () => {
    expect(versionActionCopy(option({ source: "confirmed_template", release_id: null,
      template_id: "78690", stage: "ready_to_upload",
      actions: ["create_test_version"] }))).toEqual({
      title: "0.1.39 · 新模板修订",
      description: "版本号相同或更新，但模板包已经更新。",
      primaryLabel: "生成 0.1.39 测试码",
    });
  });
});
