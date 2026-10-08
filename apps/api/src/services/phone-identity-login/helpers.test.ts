import { describe, expect, test } from "bun:test";
import { serializeStoredCandidate } from "./helpers";
import type { PhoneIdentityCandidate } from "./types";

describe("persisted phone identity candidate contract", () => {
  test.each(["bindable", "current", "rebind_required"] as const)(
    "preserves the database-required fields for %s candidates",
    (bindingState) => {
      const candidate: PhoneIdentityCandidate = {
        candidateId: "00000000-0000-4000-8000-000000000001",
        targetMode: "customer",
        bindingState,
        rebindKind: bindingState === "rebind_required" ? "tenant_wechat" : undefined,
        tenantId: "00000000-0000-4000-8000-000000000002",
        customerId: "00000000-0000-4000-8000-000000000003",
        employeeId: null,
        partnerId: null,
        partnerMemberId: null,
        roleLabel: "客户",
        title: "回归装饰公司",
        subtitle: "回归客户",
        sharePreferred: true,
      };
      expect(serializeStoredCandidate(candidate)).toEqual({
        id: candidate.candidateId,
        target_mode: "customer",
        tenant_id: candidate.tenantId,
        customer_id: candidate.customerId,
        employee_id: null,
        partner_id: null,
        partner_member_id: null,
        binding_state: bindingState,
        display_snapshot: {
          role_label: "客户",
          title: "回归装饰公司",
          subtitle: "回归客户",
          rebind_kind: bindingState === "rebind_required" ? "tenant_wechat" : null,
        },
      });
    },
  );
});
