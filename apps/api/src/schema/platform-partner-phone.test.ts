import { describe, expect, test } from "bun:test";
import {
  SubmitPlatformPartnerApplicationSchema,
} from "./platform-partner-applications";
import {
  PlatformPartnerCreateSchema,
  PlatformPartnerMemberCreateSchema,
  PlatformPartnerUpdateSchema,
} from "./platform-partners";
import { PartnerAuthSendCodeSchema } from "./platform-partner-portal";

describe("platform partner phone schemas", () => {
  test("rejects partner application phone numbers longer than 11 digits", () => {
    const result = SubmitPlatformPartnerApplicationSchema.safeParse({
      applicant_name: "E2E城市合伙人申请",
      subject_type: "company",
      contact_name: "自动验收",
      phone: "1390705110522",
      region_codes: [],
      agree_privacy: true,
    });

    expect(result.success).toBe(false);
  });

  test("rejects invalid phone numbers for partner admin mutations", () => {
    const createResult = PlatformPartnerCreateSchema.safeParse({
      name: "信阳城市合伙人",
      subject_type: "company",
      contact_name: "自动验收",
      phone: "1390705110522",
      level_id: "00000000-0000-4000-8000-000000000001",
      region_codes: ["411500"],
    });
    const updateResult = PlatformPartnerUpdateSchema.safeParse({
      phone: "1390705110522",
    });
    const memberResult = PlatformPartnerMemberCreateSchema.safeParse({
      name: "自动验收",
      phone: "1390705110522",
      role: "owner",
    });

    expect(createResult.success).toBe(false);
    expect(updateResult.success).toBe(false);
    expect(memberResult.success).toBe(false);
  });

  test("rejects invalid phone numbers for partner portal binding", () => {
    const result = PartnerAuthSendCodeSchema.safeParse({
      phone: "1390705110522",
    });

    expect(result.success).toBe(false);
  });

  test("accepts valid mainland mobile phone numbers", () => {
    expect(
      SubmitPlatformPartnerApplicationSchema.safeParse({
        applicant_name: "信阳城市合伙人",
        subject_type: "company",
        contact_name: "张三",
        phone: "13907051105",
        region_codes: [],
        agree_privacy: true,
      }).success,
    ).toBe(true);
    expect(
      PlatformPartnerMemberCreateSchema.safeParse({
        name: "张三",
        phone: "13907051105",
        role: "owner",
      }).success,
    ).toBe(true);
  });
});
