import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { customerCoreRepository } from "@/repositories/customer-core";
import { customerFollowUpService } from "@/services/customer-follow-ups";
import { customerPropertyService } from "@/services/customer-properties";
import * as customerShared from "./shared";

const CUSTOMER_A_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CUSTOMER_B_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PROJECT_A = {
  id: "22222222-2222-4222-8222-222222222222",
  customer_id: CUSTOMER_A_ID,
  name: "客户 A 设计项目",
  status: "designing",
  created_at: "2026-09-30T10:00:00.000Z",
};

const activeSpies: Array<{ mockRestore: () => void }> = [];

afterEach(() => {
  for (const activeSpy of activeSpies.splice(0)) {
    activeSpy.mockRestore();
  }
});

describe("customer detail latest project", () => {
  test("exposes a fail-closed project ownership invariant", () => {
    expect(
      typeof (customerShared as Record<string, unknown>)
        .assertCustomerLatestProject,
    ).toBe("function");
  });

  test("returns null when the customer has no project", () => {
    expect(
      customerShared.assertCustomerLatestProject(CUSTOMER_A_ID, null),
    ).toBeNull();
  });

  test("returns a project owned by the current customer", () => {
    expect(
      customerShared.assertCustomerLatestProject(CUSTOMER_A_ID, PROJECT_A),
    ).toEqual(PROJECT_A);
  });

  test("rejects a project owned by another customer", () => {
    expect(() =>
      customerShared.assertCustomerLatestProject(CUSTOMER_A_ID, {
        ...PROJECT_A,
        customer_id: CUSTOMER_B_ID,
      })
    ).toThrow("客户项目归属异常");
  });

  test("returns latest_project null from the customer detail response", async () => {
    mockDetailDependencies(null);

    const detail = await new TestCustomerController().buildDetail();

    expect(detail.latest_project).toBeNull();
    expect(customerCoreRepository.findLatestProject).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      customerId: CUSTOMER_A_ID,
    });
  });

  test("returns only the current customer's latest project in detail", async () => {
    mockDetailDependencies(PROJECT_A);

    const detail = await new TestCustomerController().buildDetail();

    expect(detail.latest_project).toEqual(PROJECT_A);
  });
});

const TENANT_ID = "11111111-1111-4111-8111-111111111111";

class TestCustomerController extends customerShared.CustomerBaseController {
  buildDetail() {
    return this.buildCustomerDetailResponse(
      {
        id: CUSTOMER_A_ID,
        owner_id: null,
        status: "potential",
      },
      { tenantId: TENANT_ID },
    );
  }
}

function mockDetailDependencies(project: typeof PROJECT_A | null) {
  activeSpies.push(
    spyOn(
      customerPropertyService,
      "getPrimaryCustomerPropertySummary",
    ).mockResolvedValue(null),
    spyOn(customerFollowUpService, "getLatestFollowUpMap").mockResolvedValue(
      new Map(),
    ),
    spyOn(customerCoreRepository, "findLatestProject").mockResolvedValue(project),
  );
}
