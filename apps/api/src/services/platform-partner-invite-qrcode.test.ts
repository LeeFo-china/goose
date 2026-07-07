import { describe, expect, mock, test } from "bun:test";
import { resolvePartnerInviteQrcodeRequest } from "@/services/platform-partner-invite-qrcode";

describe("partner invite QR code generation", () => {
  test("uses the configured onboarding page and production path validation flag", async () => {
    const getString = mock(async (key: string, fallback = "") => {
      if (key === "WECHAT_PARTNER_ONBOARDING_PAGE") {
        return "packageVisitor/pages/tenant-onboarding/index";
      }
      if (key === "WECHAT_MINIPROGRAM_ENV_VERSION") return "trial";
      return fallback;
    });
    const getBoolean = mock(async (key: string, fallback: boolean) => {
      if (key === "WECHAT_MINIPROGRAM_QRCODE_CHECK_PATH") return true;
      return fallback;
    });

    const request = await resolvePartnerInviteQrcodeRequest({
      scene: "CP-411500-000000000201",
      settings: { getString, getBoolean },
      normalizeEnvVersion: (value) =>
        value === "trial" || value === "develop" ? value : "release",
    });

    expect(getBoolean).toHaveBeenCalledWith(
      "WECHAT_MINIPROGRAM_QRCODE_CHECK_PATH",
      true,
    );
    expect(request).toEqual({
      page: "packageVisitor/pages/tenant-onboarding/index",
      scene: "CP-411500-000000000201",
      envVersion: "trial",
      checkPath: true,
    });
  });
});
