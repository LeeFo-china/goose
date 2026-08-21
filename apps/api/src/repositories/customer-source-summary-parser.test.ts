import { describe, expect, test } from "bun:test";
import { parseCustomerSourceSummaryRows } from "./customer-source-summary-parser";

const TENANT_ID = "11111111-1111-4111-8111-111111111111";
const CUSTOMER_ID = "22222222-2222-4222-8222-222222222222";

function emptySummary(overrides: Record<string, unknown> = {}) {
  return {
    customer_id: CUSTOMER_ID,
    total: 0,
    latest_source: null,
    has_old_customer_new_lead: false,
    has_platform_new_lead: false,
    has_employee_share: false,
    ...overrides,
  };
}

describe("customer source summary RPC parser", () => {
  test("accepts one exact tenant-scoped row for every requested customer", () => {
    expect(parseCustomerSourceSummaryRows([emptySummary()], {
      tenantId: TENANT_ID,
      customerIds: [CUSTOMER_ID],
    })).toEqual([{
      customerId: CUSTOMER_ID,
      total: 0,
      latestSource: null,
      hasOldCustomerNewLead: false,
      hasPlatformNewLead: false,
      hasEmployeeShare: false,
    }]);
  });

  test("rejects missing, duplicate, out-of-scope and unknown response fields", () => {
    const input = { tenantId: TENANT_ID, customerIds: [CUSTOMER_ID] };

    expect(parseCustomerSourceSummaryRows([], input)).toBeNull();
    expect(parseCustomerSourceSummaryRows([
      emptySummary({ customer_id: "33333333-3333-4333-8333-333333333333" }),
    ], input)).toBeNull();
    expect(parseCustomerSourceSummaryRows([
      emptySummary({ raw_rows: [{ metadata: { raw_response: "unsafe" } }] }),
    ], input)).toBeNull();
    expect(parseCustomerSourceSummaryRows([
      emptySummary(),
      emptySummary(),
    ], {
      tenantId: TENANT_ID,
      customerIds: [CUSTOMER_ID, "33333333-3333-4333-8333-333333333333"],
    })).toBeNull();
  });
});
