import { describe, expect, test } from "bun:test";
import {
  isSupplierOrderBlockingReason,
  SUPPLIER_CONTRACT_LIFECYCLE_STATUS_VALUES,
  SUPPLIER_ONBOARDING_STATUS_VALUES,
  SUPPLIER_OPERATIONAL_STATUS_VALUES,
  SUPPLIER_ORDER_BLOCKING_REASON_VALUES,
  SUPPLIER_QUALIFICATION_HEALTH_VALUES,
  SUPPLIER_QUALIFICATION_VERIFICATION_STATUS_VALUES,
  SUPPLIER_TYPE_VALUES,
  TENANT_SUPPLIER_RELATIONSHIP_STATUS_VALUES,
} from "./supplier";

describe("supplier domain contracts", () => {
  test("exposes supplier lifecycle values", () => {
    expect(SUPPLIER_TYPE_VALUES).toEqual([
      "manufacturer",
      "brand_agent",
      "distributor",
      "retailer",
      "other",
    ]);
    expect(SUPPLIER_ONBOARDING_STATUS_VALUES).toEqual([
      "draft",
      "pending_review",
      "approved",
      "rejected",
    ]);
    expect(SUPPLIER_OPERATIONAL_STATUS_VALUES).toEqual([
      "active",
      "suspended",
      "blacklisted",
    ]);
    expect(SUPPLIER_QUALIFICATION_VERIFICATION_STATUS_VALUES).toEqual([
      "pending",
      "verified",
      "rejected",
    ]);
    expect(SUPPLIER_QUALIFICATION_HEALTH_VALUES).toEqual([
      "valid",
      "expiring",
      "expired",
      "missing",
    ]);
    expect(TENANT_SUPPLIER_RELATIONSHIP_STATUS_VALUES).toEqual([
      "evaluating",
      "active",
      "suspended",
      "terminated",
      "blacklisted",
    ]);
    expect(SUPPLIER_CONTRACT_LIFECYCLE_STATUS_VALUES).toEqual([
      "draft",
      "active",
      "terminated",
    ]);
    expect(SUPPLIER_ORDER_BLOCKING_REASON_VALUES).toEqual([
      "module_disabled",
      "supplier_not_approved",
      "supplier_suspended",
      "supplier_blacklisted",
      "relationship_not_active",
      "required_qualification_missing",
      "required_qualification_expired",
      "active_contract_required",
    ]);
  });

  test("identifies supplier order blocking reasons", () => {
    expect(isSupplierOrderBlockingReason("supplier_blacklisted")).toBe(true);
    expect(isSupplierOrderBlockingReason("unknown")).toBe(false);
  });
});
