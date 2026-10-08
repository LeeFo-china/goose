import { beforeAll, describe, expect, test } from "bun:test";
import { createClient } from "@supabase/supabase-js";

process.env.SUPABASE_URL = "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH = "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
let EmployeeAdminSessionsRepository: typeof import("@/repositories/employee-admin-sessions").EmployeeAdminSessionsRepository;
let EmployeeAdminSessionsService: typeof import("./employee-admin-sessions").EmployeeAdminSessionsService;
let assertAdminCredentialVersion: typeof import("./employee-admin-sessions").assertAdminCredentialVersion;
beforeAll(async () => {
  ({ EmployeeAdminSessionsRepository } = await import("@/repositories/employee-admin-sessions"));
  ({ EmployeeAdminSessionsService, assertAdminCredentialVersion } = await import("./employee-admin-sessions"));
});

const employee = {
  id: "employee-a", tenant_id: "tenant-a", user_id: "user-a",
  status: "active", phone: "18800000001", version: 3, admin_auth_version: 2,
};

describe("employee admin sessions", () => {
  test("rejects missing, stale, malformed and nonpositive credential versions", () => {
    for (const [actual, claimed] of [[2, undefined], [2, 1], [0, 0], [-1, -1], [1.5, 1.5], [NaN, NaN]] as const) {
      expect(() => assertAdminCredentialVersion(actual, claimed)).toThrow("登录状态已失效");
    }
    expect(() => assertAdminCredentialVersion(2, 2)).not.toThrow();
  });

  test("two independent services observe database changes without cached auth context", async () => {
    let current = { ...employee };
    let reads = 0;
    const createService = () => new EmployeeAdminSessionsService({
      repository: new EmployeeAdminSessionsRepository(createClient("http://127.0.0.1:54321", "dummy-key", {
        global: { fetch: Object.assign(async () => { reads += 1; return Response.json([current]); }, { preconnect() {} }) },
      })),
    });
    const first = createService();
    const second = createService();
    await first.assertSession("user-a", 2);
    await second.assertSession("user-a", 2);
    current = { ...current, phone: "18800000002", version: 4, admin_auth_version: 3 };
    await expect(first.assertSession("user-a", 2)).rejects.toMatchObject({ statusCode: 401 });
    await expect(second.assertSession("user-a", 2)).rejects.toMatchObject({ statusCode: 401 });
    await second.assertSession("user-a", 3);
    expect(reads).toBe(5);
  });

  for (const rows of [[], [employee, { ...employee, id: "employee-b" }],
    [{ ...employee, status: "inactive" }], [{ ...employee, user_id: "other-user" }]]) {
    test(`rejects unavailable or ambiguous mapping ${JSON.stringify(rows)}`, async () => {
      const service = new EmployeeAdminSessionsService({ repository: {
        findByAuthUserId: async () => rows,
        findByEmployeeId: async () => rows,
        bindFirstLogin: async () => [],
      } });
      await expect(service.assertSession("user-a", 2)).rejects.toMatchObject({ statusCode: 401, code: "ADMIN_SESSION_REVOKED" });
    });
  }
});
