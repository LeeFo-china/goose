import { describe, expect, mock, test } from "bun:test";
import type { AuthContext } from "@/services/authorization";
import { initializeConvertedPotentialCustomerWorkflow } from
  "@/services/tenant-douyin-lead-customer-workflow";

const TENANT_ID = "11111111-1111-4111-8111-111111111111";
const CUSTOMER_ID = "44444444-4444-4444-8444-444444444444";
const EMPLOYEE_ID = "55555555-5555-4555-8555-555555555555";
const authContext = {
  tenantId: TENANT_ID,
  employeeId: EMPLOYEE_ID,
} as AuthContext;
const customer = {
  id: CUSTOMER_ID,
  tenant_id: TENANT_ID,
  status: "potential",
  owner_id: EMPLOYEE_ID,
};

function fixture(overrides: {
  customer?: typeof customer | null;
  initialize?: () => Promise<
    | { status: "ready"; attempts: number }
    | {
      status: "degraded";
      attempts: number;
      code: "CUSTOMER_WORKFLOW_INITIALIZATION_FAILED";
      reason: string;
    }
  >;
} = {}) {
  const findCustomerAccess = mock(async () =>
    overrides.customer === undefined ? customer : overrides.customer);
  const initialize = mock(overrides.initialize ?? (async () => ({
    status: "ready" as const,
    attempts: 1,
  })));
  return {
    findCustomerAccess,
    initialize,
    run: () => initializeConvertedPotentialCustomerWorkflow({
      authContext,
      tenantId: TENANT_ID,
      customerId: CUSTOMER_ID,
      repository: { findCustomerAccess },
      workflowInitialization: { initialize },
    }),
  };
}

describe("converted customer workflow initialization", () => {
  test("initializes a potential customer with its current owner", async () => {
    const context = fixture();

    await context.run();

    expect(context.findCustomerAccess).toHaveBeenCalledWith(
      TENANT_ID,
      CUSTOMER_ID,
    );
    expect(context.initialize).toHaveBeenCalledWith({
      authContext,
      tenantId: TENANT_ID,
      customerId: CUSTOMER_ID,
      ownerId: EMPLOYEE_ID,
    });
  });

  test("skips initialization after conversion to a progressed customer", async () => {
    const context = fixture({ customer: { ...customer, status: "following" } });

    await context.run();

    expect(context.findCustomerAccess).toHaveBeenCalledTimes(1);
    expect(context.initialize).not.toHaveBeenCalled();
  });

  test("rejects missing, cross-tenant, and status-less customers", async () => {
    const invalidCustomers = [
      null,
      { ...customer, tenant_id: "99999999-9999-4999-8999-999999999999" },
      { ...customer, status: null },
    ];
    for (const invalidCustomer of invalidCustomers) {
      const context = fixture({ customer: invalidCustomer as typeof customer | null });

      await expect(context.run()).rejects.toMatchObject({
        statusCode: 500,
        code: "DOUYIN_LEAD_RESPONSE_INVALID",
      });
      expect(context.initialize).not.toHaveBeenCalled();
    }
  });

  test("returns a stable retryable error after initializer retries degrade", async () => {
    const context = fixture({ initialize: async () => ({
      status: "degraded" as const,
      attempts: 2,
      code: "CUSTOMER_WORKFLOW_INITIALIZATION_FAILED" as const,
      reason: "temporary_database_error",
    }) });

    await expect(context.run()).rejects.toMatchObject({
      statusCode: 503,
      code: "CUSTOMER_WORKFLOW_INITIALIZATION_FAILED",
      message: "客户工作流初始化失败，请稍后重试",
    });
  });
});
