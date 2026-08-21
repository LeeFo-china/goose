import { beforeAll, describe, expect, mock, test } from "bun:test";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

let CustomerSourceService: typeof import("./customer-sources").CustomerSourceService;

beforeAll(async () => {
  ({ CustomerSourceService } = await import("./customer-sources"));
});

describe("CustomerSourceService source summaries", () => {
  test("maps bounded repository summaries without regrouping source rows", async () => {
    const listByCustomerIds = mock(async () => [{
      customerId: "22222222-2222-4222-8222-222222222222",
      total: 42,
      latestSource: null,
      hasOldCustomerNewLead: true,
      hasPlatformNewLead: false,
      hasEmployeeShare: true,
    }]);
    const service = new CustomerSourceService({ listByCustomerIds } as never);

    const result = await service.getCustomerSourceSummaryMap({
      authContext: {
        authUserId: "auth-1",
        employeeId: "employee-1",
        tenantId: "11111111-1111-4111-8111-111111111111",
        tenantName: "测试租户",
        tenantSlug: "test",
        tenantStatus: "active",
        isPlatformAdmin: false,
        employeeName: "测试员工",
        employeeStatus: "active",
        departmentId: null,
        tenantDepartmentId: null,
        departmentCode: null,
        departmentName: null,
        postId: null,
        postName: null,
        avatar: null,
        roleCodes: [],
        roles: [],
        permissions: [],
      },
      customerIds: ["22222222-2222-4222-8222-222222222222"],
    });

    expect(listByCustomerIds).toHaveBeenCalledWith({
      tenantId: "11111111-1111-4111-8111-111111111111",
      customerIds: ["22222222-2222-4222-8222-222222222222"],
    });
    expect(result.get("22222222-2222-4222-8222-222222222222")).toEqual({
      total: 42,
      latest_source: null,
      source_tags: ["old_customer_new_lead", "employee_share"],
      has_old_customer_new_lead: true,
      has_platform_new_lead: false,
      has_employee_share: true,
    });
  });
});
