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

  test("keeps both detail activity and sources endpoint nested phones masked", async () => {
    const page = {
      list: [{
        id: "source-1",
        source: "platform_lead",
        source_label: "平台线索",
        assigned_at: null,
        created_at: "2026-08-22T10:00:00.000Z",
        metadata: {},
        display_label: "平台线索",
        dedupe_result: null,
        is_old_customer_new_lead: false,
        is_platform_new_lead: true,
        is_employee_share: false,
        source_employee: null,
        assigned_by: null,
        platform_lead: {
          id: "lead-1",
          phone_masked: "138****8000",
          name: null,
          city: null,
          community: null,
          status: "pending",
          source: "douyin",
        },
        share_link: null,
      }],
      pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    };
    const listByCustomer = mock(async () => page);
    const findCustomerAccess = mock(async () => ({
      id: "22222222-2222-4222-8222-222222222222",
      owner_id: null,
      tenant_id: "11111111-1111-4111-8111-111111111111",
    }));
    const service = new CustomerSourceService({
      listByCustomer,
      findCustomerAccess,
    } as never);
    const authContext = {
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
      permissions: [{ code: "customer.read", scope: "all" as const }],
    };

    const includeActivitySources = await service.listAccessibleCustomerSources({
      tenantId: authContext.tenantId,
      customerId: "22222222-2222-4222-8222-222222222222",
      query: { page: 1, pageSize: 20 },
    });
    const sourcesEndpointReadOnly = await service.listCustomerSources({
      authContext,
      customerId: "22222222-2222-4222-8222-222222222222",
      query: { page: 1, pageSize: 20 },
    });
    const sourcesEndpointWithPhoneView = await service.listCustomerSources({
      authContext: {
        ...authContext,
        permissions: [
          ...authContext.permissions,
          { code: "customer.phone.view", scope: "all" as const },
        ],
      },
      customerId: "22222222-2222-4222-8222-222222222222",
      query: { page: 1, pageSize: 20 },
    });

    for (const result of [
      includeActivitySources,
      sourcesEndpointReadOnly,
      sourcesEndpointWithPhoneView,
    ]) {
      expect(result.list[0]?.platform_lead).toEqual(expect.objectContaining({
        phone_masked: "138****8000",
      }));
      expect(result.list[0]?.platform_lead).not.toHaveProperty("phone");
      expect(JSON.stringify(result)).not.toContain("13800138000");
    }
  });
});
