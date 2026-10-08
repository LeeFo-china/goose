import { beforeAll, describe, expect, test } from "bun:test";
import { createClient } from "@supabase/supabase-js";

process.env.SUPABASE_URL = "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH = "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
let EmployeeAdminSessionsRepository: typeof import("./employee-admin-sessions").EmployeeAdminSessionsRepository;
beforeAll(async () => { ({ EmployeeAdminSessionsRepository } = await import("./employee-admin-sessions")); });

describe("employee admin security snapshot repository", () => {
  test("bounds user mapping and employee lookup to two minimal rows", async () => {
    const requests: URL[] = [];
    const client = createClient("http://127.0.0.1:54321", "dummy-key", {
      global: { fetch: Object.assign(async (input: string | URL | Request) => {
        requests.push(new URL(String(input)));
        return Response.json([]);
      }, { preconnect() {} }) },
    });
    const repository = new EmployeeAdminSessionsRepository(client);
    expect(await repository.findByAuthUserId("user-a")).toEqual([]);
    expect(await repository.findByEmployeeId("employee-a")).toEqual([]);
    expect(requests).toHaveLength(2);
    for (const url of requests) {
      expect(url.pathname).toBe("/rest/v1/employees");
      expect(url.searchParams.get("limit")).toBe("2");
      expect(url.searchParams.get("select")).toBe("id,tenant_id,user_id,status,phone,version,admin_auth_version");
    }
    expect(requests[0]?.searchParams.get("user_id")).toBe("eq.user-a");
    expect(requests[1]?.searchParams.get("id")).toBe("eq.employee-a");
  });

  test("preserves database errors instead of treating failures as missing employees", async () => {
    const client = createClient("http://127.0.0.1:54321", "dummy-key", {
      global: { fetch: Object.assign(async () => Response.json({ message: "unavailable" }, { status: 503 }), { preconnect() {} }) },
    });
    await expect(new EmployeeAdminSessionsRepository(client).findByAuthUserId("user-a"))
      .rejects.toMatchObject({ statusCode: 500, code: "DB_ERROR" });
  });

  test("first binding only updates the unchanged unbound employee and never cleans other identities", async () => {
    const requests: Array<{ url: URL; method: string; body: unknown }> = [];
    const client = createClient("http://127.0.0.1:54321", "dummy-key", {
      global: { fetch: Object.assign(async (input: string | URL | Request, init?: RequestInit) => {
        requests.push({ url: new URL(String(input)), method: init?.method ?? "GET", body: JSON.parse(String(init?.body)) });
        return Response.json([]);
      }, { preconnect() {} }) },
    });
    const repository = new EmployeeAdminSessionsRepository(client);
    await repository.bindFirstLogin({ id: "employee-a", tenant_id: "tenant-a", user_id: null,
      phone: "18800000001", status: "active", version: 3, admin_auth_version: 2 }, "new-user");
    expect(requests).toHaveLength(1);
    const request = requests[0];
    expect(request?.method).toBe("PATCH");
    expect(request?.body).toEqual({ user_id: "new-user" });
    expect(Object.fromEntries(request!.url.searchParams)).toMatchObject({
      id: "eq.employee-a", user_id: "is.null", tenant_id: "eq.tenant-a", phone: "eq.18800000001",
      version: "eq.3", admin_auth_version: "eq.2", status: "eq.active",
    });
  });
});
