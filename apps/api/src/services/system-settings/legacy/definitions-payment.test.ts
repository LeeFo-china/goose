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
});
