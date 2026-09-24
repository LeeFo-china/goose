import { describe, expect, test } from "bun:test";
import { buildGb28181VideoChannelCode } from "./gb28181-channel-code";

describe("GB28181 video channel code", () => {
  test("derives the single IPC video channel code from Tencent's device code", () => {
    expect(buildGb28181VideoChannelCode("99958005371320000007")).toBe(
      "99958005371310000007",
    );
  });

  test("keeps each Tencent device on a distinct channel code", () => {
    expect(buildGb28181VideoChannelCode("99958005371320000007")).not.toBe(
      buildGb28181VideoChannelCode("99958005371320000008"),
    );
  });

  test("does not invent a code from malformed vendor data", () => {
    expect(buildGb28181VideoChannelCode(null)).toBeNull();
    expect(buildGb28181VideoChannelCode("device-id")).toBeNull();
    expect(buildGb28181VideoChannelCode("9995800537132000000A")).toBeNull();
  });
});
