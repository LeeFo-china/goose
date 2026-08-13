import { describe, expect, test } from "bun:test";
import { getDouyinReleasePageOptions } from
  "./platform-douyin-release-rules";

const merchant = {
  id: "22222222-2222-4222-8222-222222222222",
  authorizer_appid: "ttd033a68e4e56ccd301",
  installation_kind: "merchant" as const,
  authorization_status: "active" as const,
  permission_snapshot: [{ id: 1 }],
  tenant: { id: "tenant-a", name: "5H 验收租户 A" },
};

describe("getDouyinReleasePageOptions", () => {
  test("uses the active template installation and only publishable merchants", () => {
    const disabledMerchant = {
      ...merchant,
      id: "33333333-3333-4333-8333-333333333333",
      authorization_status: "disabled" as const,
    };
    const missingDevelopmentPermission = {
      ...merchant,
      id: "44444444-4444-4444-8444-444444444444",
      permission_snapshot: [{ id: 2 }],
    };

    expect(getDouyinReleasePageOptions([
      disabledMerchant,
      missingDevelopmentPermission,
      merchant,
    ])).toEqual({
      merchants: [merchant],
      defaultMerchantId: merchant.id,
    });
  });

  test("returns no default when there is no publishable merchant", () => {
    expect(getDouyinReleasePageOptions([])).toEqual({
      merchants: [],
      defaultMerchantId: "",
    });
  });
});
