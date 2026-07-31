import { beforeEach, describe, expect, mock, test } from "bun:test";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const emptyPage = {
  list: [],
  pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
};
const list = mock(async () => emptyPage);

mock.module("@/services/supplier-payables", () => ({
  supplierPayablesService: { list },
}));

const auth = {
  tenantId: "85000000-0000-4000-8000-000000000001",
  authUserId: "85000000-0000-4000-8000-000000000002",
  employeeId: "85000000-0000-4000-8000-000000000003",
};
const PROJECT_ID = "85000000-0000-4000-8000-000000000004";

async function controller() {
  const { default: value } = await import(".");
  Object.defineProperty(value, "getRequiredTenantContext", {
    configurable: true,
    value: mock(async () => auth),
  });
  return value;
}

describe("SupplierPayablesController", () => {
  beforeEach(() => list.mockClear());

  test("registers the payable route once", async () => {
    const value = await controller();
    const routes: Array<{ method: string; path: string }> = [];
    value.registerExtraRoutes({
      get: (path: string) => routes.push({ method: "GET", path }),
    } as never);
    expect(routes).toEqual([
      { method: "GET", path: "/supplier-payables" },
    ]);
  });

  test("parses bounded filters and wraps the service result", async () => {
    const value = await controller();
    const response = await value.listPayables({
      query: {
        project_id: PROJECT_ID,
        status: "open",
        page: "2",
        pageSize: "100",
      },
    } as never);

    expect(list).toHaveBeenCalledWith(auth, {
      project_id: PROJECT_ID,
      status: "open",
      page: 2,
      pageSize: 100,
    });
    expect(response).toEqual({ data: emptyPage, message: "success" });
  });

  test("rejects pages larger than 100 before calling the service", async () => {
    const value = await controller();
    await expect(value.listPayables({
      query: { page: "1", pageSize: "101" },
    } as never)).rejects.toMatchObject({
      statusCode: 400,
      code: "VALIDATION_ERROR",
    });
    expect(list).not.toHaveBeenCalled();
  });

  test("keeps database access out of the controller", async () => {
    const source = await Bun.file(new URL("./index.ts", import.meta.url)).text();
    const forbiddenClientName = ["Supabase", "DB"].join("");
    expect(source).not.toContain(forbiddenClientName);
    expect(source).not.toContain(".from(");
    expect(source).not.toContain(".rpc(");
  });
});
