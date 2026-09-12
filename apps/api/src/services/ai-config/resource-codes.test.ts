import { describe, expect, test } from "bun:test";

import { createAiResourceCode } from "./resource-codes";

const deterministicUuid = () => "11111111-1111-4111-8111-111111111111";

describe("AI resource codes", () => {
  test("creates opaque codes for each supported resource prefix", () => {
    expect(createAiResourceCode("prv", deterministicUuid))
      .toBe("prv_11111111111141118111111111111111");
    expect(createAiResourceCode("mdl", deterministicUuid))
      .toBe("mdl_11111111111141118111111111111111");
    expect(createAiResourceCode("scene", deterministicUuid))
      .toBe("scene_11111111111141118111111111111111");
  });

  test("uses the runtime UUID factory without losing its Crypto receiver", () => {
    expect(createAiResourceCode("mdl")).toMatch(/^mdl_[0-9a-f]{32}$/);
  });

  test("fails explicitly when the injected factory returns an invalid UUID", () => {
    expect(() => createAiResourceCode("mdl", () => "not-a-uuid"))
      .toThrowError("Invalid UUID returned by AI resource code factory");
  });
});
