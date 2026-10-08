import { beforeAll, describe, expect, test } from "bun:test";
import { createClient } from "@supabase/supabase-js";

process.env.SUPABASE_URL = "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH = "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
let Repository: typeof import("./wechat-employee-identities").WechatEmployeeIdentityRepository;
beforeAll(async () => { Repository = (await import("./wechat-employee-identities")).WechatEmployeeIdentityRepository; });

describe("WeChat employee conditional binding", () => {
  for (const userId of [null, "canonical-user"]) {
    test(`compares phone, version and original binding ${userId} in the update itself`, async () => {
      const requests: Array<{ url: URL; method: string; body: unknown }> = [];
      const client = createClient("http://127.0.0.1:54321", "dummy-key", {
        global: { fetch: Object.assign(async (input: string | URL | Request, init?: RequestInit) => {
          requests.push({ url: new URL(String(input)), method: init?.method ?? "GET", body: JSON.parse(String(init?.body)) });
          return Response.json({ id: "employee-a" });
        }, { preconnect() {} }) },
      });
      await new Repository(client).bindEmployeeAuthUser({ employeeId: "employee-a", authUserId: "verified-user", expected: {
        phone: "18800000001", version: 4, user_id: userId, tenant_id: "tenant-a", status: "active",
      } });
      expect(requests).toHaveLength(1);
      expect(requests[0]?.method).toBe("PATCH");
      expect(requests[0]?.body).toEqual({ user_id: "verified-user" });
      expect(Object.fromEntries(requests[0]!.url.searchParams)).toEqual({
        id: "eq.employee-a", phone: "eq.18800000001", version: "eq.4",
        user_id: userId === null ? "is.null" : "eq.canonical-user",
        tenant_id: "eq.tenant-a", status: "eq.active", select: "id",
      });
    });
  }

  test("zero changed rows is an identity conflict and database failure stays a database error", async () => {
    for (const fails of [false, true]) {
      const client = createClient("http://127.0.0.1:54321", "dummy-key", {
        global: { fetch: Object.assign(async () => Response.json(fails ? { message: "unavailable" } : null,
          { status: fails ? 503 : 200 }), { preconnect() {} }) },
      });
      await expect(new Repository(client).bindEmployeeAuthUser({ employeeId: "employee-a", authUserId: "verified-user", expected: {
        phone: "18800000001", version: 4, user_id: null, tenant_id: null, status: "active",
      } })).rejects.toMatchObject({ statusCode: fails ? 500 : 409, code: fails ? "DB_ERROR" : "IDENTITY_OPTION_UNAVAILABLE" });
    }
  });

  test("candidate lookup includes version and needs only two rows to detect an ambiguous phone", async () => {
    const requests: URL[] = [];
    const client = createClient("http://127.0.0.1:54321", "dummy-key", {
      global: { fetch: Object.assign(async (input: string | URL | Request) => {
        requests.push(new URL(String(input)));
        return Response.json([]);
      }, { preconnect() {} }) },
    });
    await new Repository(client).listEmployeeLoginCandidatesByPhone("18800000001");
    expect(requests[0]?.searchParams.get("select")?.split(",")).toContain("version");
    expect(requests[0]?.searchParams.get("limit")).toBe("2");
  });
});
