import { describe, expect, test } from "bun:test";
import { buildUnlimitedCodePayload } from "@/services/wechat-open-link";

describe("wechatOpenLinkService", () => {
  test("builds unlimited mini-program code payload with caller supplied check_path", () => {
    expect(buildUnlimitedCodePayload({
      page: "packageVisitor/pages/tenant-onboarding/index",
      scene: "CP-411500-000000000201",
      envVersion: "release",
      checkPath: true,
    })).toEqual({
      page: "packageVisitor/pages/tenant-onboarding/index",
      scene: "CP-411500-000000000201",
      env_version: "release",
      check_path: true,
    });
  });
});
