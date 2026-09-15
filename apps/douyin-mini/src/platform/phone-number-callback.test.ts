import { describe, expect, test } from "bun:test";
import { resolvePhoneNumberCallback } from "./phone-number-callback";

describe("resolvePhoneNumberCallback", () => {
  test("uses the new phone code after consent", () => {
    expect(resolvePhoneNumberCallback({ detail: { code: " phone-code ", errMsg: "getPhoneNumber:ok" } }))
      .toEqual({ code: "phone-code" });
  });

  test("does not mistake an empty code after consent for a refusal", () => {
    expect(resolvePhoneNumberCallback({ detail: { code: "", errMsg: "getPhoneNumber:ok" } }).error)
      .toContain("未返回手机号令牌");
  });

  test("identifies a legacy encrypted callback without exposing encrypted data", () => {
    const result = resolvePhoneNumberCallback({
      detail: { encryptedData: "private-ciphertext", iv: "private-iv", errMsg: "getPhoneNumber:ok" },
    });
    expect(result.error).toContain("旧版手机号回调");
    expect(result.error).not.toContain("private-ciphertext");
  });

  test("reports platform authorization and permission errors distinctly", () => {
    expect(resolvePhoneNumberCallback({ detail: { errMsg: "getPhoneNumber:fail auth deny" } }).error)
      .toContain("拒绝");
    expect(resolvePhoneNumberCallback({ detail: { errMsg: "getPhoneNumber:fail no permission" } }).error)
      .toContain("未开通");
  });
});
