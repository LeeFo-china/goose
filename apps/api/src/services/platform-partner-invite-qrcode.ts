import { systemSettingsService } from "@/services/system-settings";
import { wechatOpenLinkService } from "@/services/wechat-open-link";

const DEFAULT_PARTNER_ONBOARDING_PAGE = "pages/visitor/index";

type PartnerInviteQrcodeSettings = Pick<
  typeof systemSettingsService,
  "getString" | "getBoolean"
>;

export type PartnerInviteQrcodeRequest = {
  page: string;
  scene: string;
  envVersion: "release" | "trial" | "develop";
  checkPath: boolean;
};

export async function resolvePartnerInviteQrcodeRequest(input: {
  scene: string;
  settings?: PartnerInviteQrcodeSettings;
  normalizeEnvVersion?: (value: string) => PartnerInviteQrcodeRequest["envVersion"];
}): Promise<PartnerInviteQrcodeRequest> {
  const settings = input.settings ?? systemSettingsService;
  const normalizeEnvVersion = input.normalizeEnvVersion ??
    wechatOpenLinkService.normalizeEnvVersion.bind(wechatOpenLinkService);
  const page = await settings.getString(
    "WECHAT_PARTNER_ONBOARDING_PAGE",
    DEFAULT_PARTNER_ONBOARDING_PAGE,
  );
  const envVersion = normalizeEnvVersion(
    await settings.getString("WECHAT_MINIPROGRAM_ENV_VERSION", "release"),
  );
  const checkPath = await settings.getBoolean(
    "WECHAT_MINIPROGRAM_QRCODE_CHECK_PATH",
    true,
  );

  return {
    page,
    scene: input.scene,
    envVersion,
    checkPath,
  };
}

export async function generatePartnerInviteCodeQrcode(input: {
  scene: string;
}) {
  const request = await resolvePartnerInviteQrcodeRequest(input);
  const buffer = await wechatOpenLinkService.generateUnlimitedCode(request);

  return { buffer, contentType: "image/png" as const };
}
