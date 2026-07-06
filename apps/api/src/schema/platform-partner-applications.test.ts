import { describe, expect, test } from "bun:test";
import {
  PlatformPartnerApplicationSendCodeSchema,
  SubmitPlatformPartnerApplicationSchema,
} from "./platform-partner-applications";

describe("platform partner application schemas", () => {
  test("accepts mini-program application SMS code", () => {
    const result = SubmitPlatformPartnerApplicationSchema.safeParse({
      applicant_name: "信阳星河装饰运营中心",
      subject_type: "company",
      contact_name: "李经理",
      phone: "13800138000",
      sms_code: "123456",
      region_codes: [],
      source_channel: "mini_program",
      agree_privacy: true,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sms_code).toBe("123456");
    }
  });

  test("rejects invalid application phone", () => {
    const result = PlatformPartnerApplicationSendCodeSchema.safeParse({
      phone: "123456",
    });

    expect(result.success).toBe(false);
  });
});
