import { describe, expect, test } from "bun:test";

import { PLATFORM_PAYMENT_SECRET_SETTING_KEYS } from "./definitions";
import { DEFINITIONS_WECHAT_NOTIFY } from "./definitions-wechat-notify";

describe("wechat message setting definitions", () => {
  test("keeps the virtual-payment message token dedicated and secret", () => {
    expect(DEFINITIONS_WECHAT_NOTIFY.find((definition) =>
      definition.key === "WECHAT_VIRTUAL_PAYMENT_MESSAGE_TOKEN"
    )).toMatchObject({
      groupCode: "payment",
      valueType: "string",
      isSecret: true,
      envNames: ["WECHAT_VIRTUAL_PAYMENT_MESSAGE_TOKEN"],
    });
    expect(PLATFORM_PAYMENT_SECRET_SETTING_KEYS.has(
      "WECHAT_VIRTUAL_PAYMENT_MESSAGE_TOKEN",
    )).toBe(true);
  });

  test("keeps the original ID separate from the AppID and non-secret", () => {
    const originalId = DEFINITIONS_WECHAT_NOTIFY.find((definition) =>
      definition.key === "WECHAT_MINIPROGRAM_ORIGINAL_ID"
    );
    const appId = DEFINITIONS_WECHAT_NOTIFY.find((definition) =>
      definition.key === "WECHAT_APPID"
    );

    expect(originalId).toMatchObject({
      groupCode: "wechat",
      valueType: "string",
      envNames: ["WECHAT_MINIPROGRAM_ORIGINAL_ID"],
    });
    expect(originalId?.isSecret).not.toBe(true);
    expect(originalId?.key).not.toBe(appId?.key);
    expect(originalId?.description).toContain("gh_");
  });
});
