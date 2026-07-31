import { describe, expect, test } from "bun:test";
import { SETTING_DEFINITIONS } from "./definitions";

describe("payment system setting definitions", () => {
  test("defines platform wechat pay secret bundle as a secret json setting", () => {
    const definition = SETTING_DEFINITIONS.find((item) =>
      item.key === "PLATFORM_WECHAT_PAY_SECRET_BUNDLE"
    );

    expect(definition).toMatchObject({
      key: "PLATFORM_WECHAT_PAY_SECRET_BUNDLE",
      groupCode: "payment",
      valueType: "json",
      isSecret: true,
    });
  });

  test.each([
    "WECHAT_VIRTUAL_PAYMENT_SANDBOX_SECRET_BUNDLE",
    "WECHAT_VIRTUAL_PAYMENT_PRODUCTION_SECRET_BUNDLE",
  ])("defines protected virtual payment bundle %s", (key) => {
    expect(SETTING_DEFINITIONS.find((item) => item.key === key)).toMatchObject({
      key,
      groupCode: "payment",
      valueType: "json",
      isSecret: true,
      envNames: [key],
    });
  });
});
