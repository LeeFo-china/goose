import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { projectRepository } from "@/repositories/projects";
import { ProjectListQuerySchema } from "@/schema/projects";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";
import { loadProjects, projectListCacheKey } from "./lists";

const TENANT_ID = "11111111-1111-4111-8111-111111111111";
const CUSTOMER_A_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CUSTOMER_B_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const activeSpies: Array<{ mockRestore: () => void }> = [];

afterEach(() => {
  for (const activeSpy of activeSpies.splice(0)) {
    activeSpy.mockRestore();
  }
});

describe("project customer list isolation", () => {
  test("uses customer_id as part of the project list cache key", () => {
    const authContext = buildAuthContext();
    const customerAQuery = ProjectListQuerySchema.parse({
      customer_id: CUSTOMER_A_ID,
    });
    const customerBQuery = ProjectListQuerySchema.parse({
      customer_id: CUSTOMER_B_ID,
    });

    expect(projectListCacheKey.call({}, authContext, customerAQuery)).not.toBe(
      projectListCacheKey.call({}, authContext, customerBQuery),
    );
  });

  test("passes customer_id to both project rows and pagination count", async () => {
    const visibleProjectsSpy = spyOn(
      accessPolicyService,
      "getVisibleProjectIdsByOwnership",
    ).mockResolvedValue(["project-b"]);
    const countSpy = spyOn(projectRepository, "count").mockImplementation(
      async (filters) => filters.customerId === CUSTOMER_B_ID ? 1 : 0,
    );
    const listRowsSpy = spyOn(projectRepository, "listRows").mockImplementation(
      async ({ filters }) => filters.customerId === CUSTOMER_B_ID
        ? [{ id: "project-b", customer_id: CUSTOMER_B_ID }]
        : [],
    );
    activeSpies.push(visibleProjectsSpy, countSpy, listRowsSpy);

    const result = await loadProjects.call({}, {
      tenantId: TENANT_ID,
      authContext: buildAuthContext(),
      query: ProjectListQuerySchema.parse({ customer_id: CUSTOMER_B_ID }),
    });

    const expectedFilters = expect.objectContaining({
      tenantId: TENANT_ID,
      visibleProjectIds: ["project-b"],
      customerId: CUSTOMER_B_ID,
    });
    expect(countSpy).toHaveBeenCalledWith(expectedFilters);
    expect(listRowsSpy).toHaveBeenCalledWith({
      filters: expectedFilters,
      from: 0,
      to: 19,
    });
    expect(result.rows).toEqual([{
      id: "project-b",
      customer_id: CUSTOMER_B_ID,
    }]);
    expect(result.pagination.total).toBe(1);
  });

  test("returns no projects for customer A after loading customer B", async () => {
    const visibleProjectsSpy = spyOn(
      accessPolicyService,
      "getVisibleProjectIdsByOwnership",
    ).mockResolvedValue(["project-b"]);
    const countSpy = spyOn(projectRepository, "count").mockImplementation(
      async (filters) => filters.customerId === CUSTOMER_B_ID ? 1 : 0,
    );
    const listRowsSpy = spyOn(projectRepository, "listRows").mockImplementation(
      async ({ filters }) => filters.customerId === CUSTOMER_B_ID
        ? [{ id: "project-b", customer_id: CUSTOMER_B_ID }]
        : [],
    );
    activeSpies.push(visibleProjectsSpy, countSpy, listRowsSpy);

    const customerBResult = await loadProjects.call({}, {
      tenantId: TENANT_ID,
      authContext: buildAuthContext(),
      query: ProjectListQuerySchema.parse({ customer_id: CUSTOMER_B_ID }),
    });
    const customerAResult = await loadProjects.call({}, {
      tenantId: TENANT_ID,
      authContext: buildAuthContext(),
      query: ProjectListQuerySchema.parse({ customer_id: CUSTOMER_A_ID }),
    });

    expect(customerBResult.rows).toHaveLength(1);
    expect(customerAResult.rows).toEqual([]);
    expect(customerAResult.pagination).toMatchObject({
      total: 0,
      totalPages: 0,
    });
  });
});

function buildAuthContext(): AuthContext {
  return {
    authUserId: "auth-1",
    employeeId: "employee-1",
    tenantId: TENANT_ID,
    tenantName: null,
    tenantSlug: null,
    tenantStatus: "active",
    isPlatformAdmin: false,
    employeeName: "业务员",
    employeeStatus: "active",
    departmentId: null,
    tenantDepartmentId: "department-1",
    departmentCode: "MARKETING",
    departmentName: "市场部",
    postId: null,
    postName: null,
    avatar: null,
    roleCodes: [],
    roles: [],
    permissions: [],
  };
}
