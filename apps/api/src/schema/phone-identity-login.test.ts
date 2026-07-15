import { describe, expect, test } from "bun:test";

import {
  PhoneIdentityLoginSelectSchema,
  PhoneIdentityLoginSendCodeSchema,
  PhoneIdentityLoginVerifySchema,
} from "./phone-identity-login";

describe("phone identity login schemas", () => {
  test("accepts the three valid request forms", () => {
    expect(
      PhoneIdentityLoginSendCodeSchema.safeParse({
        phone: "13800138000",
      }).success,
    ).toBe(true);
    expect(
      PhoneIdentityLoginVerifySchema.safeParse({
        phone: "13800138000",
        code: "123456",
        share_token: "share_token_123",
      }).success,
    ).toBe(true);
    expect(
      PhoneIdentityLoginVerifySchema.safeParse({
        phone: "13800138000",
        share_token: "share_token_123",
      }).success,
    ).toBe(true);
    expect(
      PhoneIdentityLoginSelectSchema.safeParse({
        selection_token: "A".repeat(43),
        candidate_id: "00000000-0000-4000-8000-000000000001",
      }).success,
    ).toBe(true);
  });

  test("rejects role, database identity, and unknown fields", () => {
    for (const body of [
      { phone: "13800138000", target_role: "customer" },
      {
        phone: "13800138000",
        code: "123456",
        auth_user_id: crypto.randomUUID(),
      },
      {
        selection_token: "A".repeat(43),
        candidate_id: crypto.randomUUID(),
        tenant_id: crypto.randomUUID(),
      },
    ]) {
      const schema = "code" in body
        ? PhoneIdentityLoginVerifySchema
        : "selection_token" in body
          ? PhoneIdentityLoginSelectSchema
          : PhoneIdentityLoginSendCodeSchema;
      expect(schema.safeParse(body).success).toBe(false);
    }
  });

  test("rejects malformed phone, code, token, and share token", () => {
    expect(
      PhoneIdentityLoginSendCodeSchema.safeParse({ phone: "1380013800" })
        .success,
    ).toBe(false);
    expect(
      PhoneIdentityLoginVerifySchema.safeParse({
        phone: "13800138000",
        code: "12a456",
      }).success,
    ).toBe(false);
    expect(
      PhoneIdentityLoginVerifySchema.safeParse({
        phone: "13800138000",
        code: "123456",
        share_token: "contains spaces",
      }).success,
    ).toBe(false);
    expect(
      PhoneIdentityLoginSelectSchema.safeParse({
        selection_token: "short",
        candidate_id: "not-a-uuid",
      }).success,
    ).toBe(false);
  });
});
