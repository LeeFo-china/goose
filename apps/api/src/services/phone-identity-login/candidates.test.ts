import { describe, expect, test } from "bun:test";

import { ErrorCodes } from "@/errors/error-codes";
import type {
  PhoneCustomerRecord,
  PhoneEmployeeRecord,
} from "@/repositories/phone-identity-candidates";
import type { PlatformPartnerMemberRecord } from "@/repositories/platform-partner-portal-types";
import { buildPhoneIdentityCandidates } from "./candidates";

const CURRENT_AUTH_USER_ID = "auth-current";

describe("buildPhoneIdentityCandidates", () => {
  test("returns no candidates for no raw records", () => {
    const result = buildPhoneIdentityCandidates(baseInput());

    expect(result).toEqual({ rawMatchCount: 0, candidates: [] });
  });

  test("counts inactive tenant customer as raw match but not candidate", () => {
    const result = buildPhoneIdentityCandidates(baseInput({
      customers: [customer({ tenant: tenant({ status: "disabled" }) })],
    }));

    expect(result.rawMatchCount).toBe(1);
    expect(result.candidates).toEqual([]);
  });

  test("counts disabled employee as raw match but not candidate", () => {
    const result = buildPhoneIdentityCandidates(baseInput({
      employees: [employee({ status: "disabled" })],
    }));

    expect(result.rawMatchCount).toBe(1);
    expect(result.candidates).toEqual([]);
  });

  test("returns a bindable active partner candidate", () => {
    const result = buildPhoneIdentityCandidates(baseInput({
      partnerMembers: [partnerMember({ status: "pending_bind", auth_user_id: null })],
    }));

    expect(result.rawMatchCount).toBe(1);
    expect(result.candidates).toMatchObject([{
      targetMode: "platform_partner",
      bindingState: "bindable",
      roleLabel: "城市合伙人",
      title: "城市合伙人",
      subtitle: "张三",
    }]);
  });

  test("deduplicates the same customer by tenant and customer ID", () => {
    const duplicate = customer({ id: "customer-1", tenant_id: "tenant-1" });
    const result = buildPhoneIdentityCandidates(baseInput({
      customers: [duplicate, duplicate],
    }));

    expect(result.rawMatchCount).toBe(2);
    expect(result.candidates).toHaveLength(1);
  });

  test("keeps two tenant customers as two candidates", () => {
    const result = buildPhoneIdentityCandidates(baseInput({
      customers: [
        customer({ id: "customer-1", tenant_id: "tenant-1", tenant: tenant({ id: "tenant-1", name: "A装饰" }) }),
        customer({ id: "customer-2", tenant_id: "tenant-2", tenant: tenant({ id: "tenant-2", name: "B装饰" }) }),
      ],
    }));

    expect(result.candidates.map((item) => item.customerId)).toEqual([
      "customer-1",
      "customer-2",
    ]);
  });

  test("keeps customer and employee candidates for the same phone", () => {
    const result = buildPhoneIdentityCandidates(baseInput({
      customers: [customer()],
      employees: [employee()],
    }));

    expect(result.candidates.map((item) => item.targetMode)).toEqual([
      "customer",
      "tenant_employee",
    ]);
  });

  test("marks current identities by direct user and active membership", () => {
    const result = buildPhoneIdentityCandidates(baseInput({
      customers: [customer({ user_id: CURRENT_AUTH_USER_ID })],
      employees: [employee({ id: "employee-2", user_id: "other-user" })],
      activeMembershipKeys: new Set(["employee:tenant-1:employee-2"]),
    }));

    expect(result.candidates.map((item) => item.bindingState)).toEqual([
      "current",
      "current",
    ]);
  });

  test("marks unbound records bindable", () => {
    const result = buildPhoneIdentityCandidates(baseInput({
      customers: [customer({ user_id: null })],
    }));

    expect(result.candidates[0]?.bindingState).toBe("bindable");
  });

  test("marks records bound to active WeChat users as rebind required", () => {
    const result = buildPhoneIdentityCandidates(baseInput({
      customers: [customer({ user_id: "other-user" })],
      employees: [employee({ user_id: "employee-user" })],
      activeWechatOauthUserIds: new Set(["other-user", "employee-user"]),
    }));

    expect(result.candidates.map((item) => item.bindingState)).toEqual([
      "rebind_required",
      "rebind_required",
    ]);
    expect(result.candidates.map((item) => item.rebindKind)).toEqual([
      "tenant_wechat",
      "tenant_wechat",
    ]);
  });

  test("sorts share tenant customer first", () => {
    const result = buildPhoneIdentityCandidates(baseInput({
      shareTenantId: "tenant-2",
      customers: [
        customer({ id: "customer-1", tenant_id: "tenant-1", tenant: tenant({ id: "tenant-1", name: "A装饰" }) }),
        customer({ id: "customer-2", tenant_id: "tenant-2", tenant: tenant({ id: "tenant-2", name: "Z装饰" }) }),
      ],
    }));

    expect(result.candidates.map((item) => item.customerId)).toEqual([
      "customer-2",
      "customer-1",
    ]);
    expect(result.candidates[0]?.sharePreferred).toBe(true);
  });

  test("throws when de-duplicated candidates exceed 100", () => {
    const customers = Array.from({ length: 101 }, (_, index) =>
      customer({
        id: `customer-${index}`,
        tenant_id: `tenant-${index}`,
        tenant: tenant({ id: `tenant-${index}` }),
      })
    );

    expect(() => buildPhoneIdentityCandidates(baseInput({ customers })))
      .toThrow(expect.objectContaining({
        code: ErrorCodes.IDENTITY_CANDIDATE_LIMIT_EXCEEDED,
      }));
  });
});

function baseInput(overrides: Partial<Parameters<typeof buildPhoneIdentityCandidates>[0]> = {}) {
  let nextId = 1;
  return {
    currentAuthUserId: CURRENT_AUTH_USER_ID,
    customers: [],
    employees: [],
    partnerMembers: [],
    activeMembershipKeys: new Set<string>(),
    activeWechatOauthUserIds: new Set<string>(),
    shareTenantId: null,
    createCandidateId: () => `candidate-${nextId++}`,
    ...overrides,
  };
}

function tenant(overrides: Record<string, unknown> = {}) {
  return {
    id: "tenant-1",
    name: "某某装饰",
    status: "active",
    ...overrides,
  };
}

function customer(overrides: Partial<PhoneCustomerRecord> = {}): PhoneCustomerRecord {
  return {
    id: "customer-1",
    tenant_id: "tenant-1",
    user_id: null,
    name: "李四",
    phone: "13800138000",
    tenant: tenant(),
    ...overrides,
  };
}

function employee(overrides: Partial<PhoneEmployeeRecord> = {}): PhoneEmployeeRecord {
  return {
    id: "employee-1",
    tenant_id: "tenant-1",
    user_id: null,
    name: "王五",
    phone: "13800138000",
    status: "active",
    tenant: tenant(),
    tenant_department: { alias_name: "工程部", code: "engineering" },
    post: { name: "项目经理", code: "pm" },
    ...overrides,
  };
}

function partnerMember(
  overrides: Partial<PlatformPartnerMemberRecord> = {},
): PlatformPartnerMemberRecord {
  return {
    id: "partner-member-1",
    partner_id: "partner-1",
    auth_user_id: null,
    name: "张三",
    phone: "13800138000",
    role: "owner",
    status: "active",
    partner: {
      id: "partner-1",
      name: "城市合伙人",
      status: "active",
      region_codes: [],
    },
    ...overrides,
  };
}
