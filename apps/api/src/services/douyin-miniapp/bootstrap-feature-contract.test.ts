import { describe, expect, test } from "bun:test";
import { bootstrapFeatures } from "./bootstrap-feature-contract";

const modernFeatures = {
  cases: true,
  sites: true,
  sms_lead: true,
  douyin_phone: true,
  phone_capture_mode: "douyin_phone",
} as const;

describe("bootstrapFeatures", () => {
  test("downgrades only phone fields for the 0.1.10 contract", () => {
    expect(bootstrapFeatures(modernFeatures, "legacy_0_1_10")).toEqual({
      ...modernFeatures,
      douyin_phone: false,
      phone_capture_mode: "sms",
    });
    expect(modernFeatures).toMatchObject({
      douyin_phone: true,
      phone_capture_mode: "douyin_phone",
    });
  });

  test("keeps modern phone fields for the runtime contract", () => {
    expect(bootstrapFeatures(modernFeatures, "runtime")).toBe(modernFeatures);
  });
});
