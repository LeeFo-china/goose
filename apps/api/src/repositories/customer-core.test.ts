import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { SupabaseDB } from "@/utils/supabase";
import { customerCoreRepository } from "./customer-core";

const TENANT_ID = "11111111-1111-4111-8111-111111111111";
const CUSTOMER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PROJECT = {
  id: "22222222-2222-4222-8222-222222222222",
  customer_id: CUSTOMER_ID,
  name: "客户 A 设计项目",
  status: "designing",
  created_at: "2026-09-30T10:00:00.000Z",
};

let adminClientSpy: { mockRestore: () => void } | null = null;

afterEach(() => {
  adminClientSpy?.mockRestore();
  adminClientSpy = null;
});

describe("customerCoreRepository latest project", () => {
  test("exposes a bounded latest-project lookup", () => {
    expect(typeof customerCoreRepository.findLatestProject).toBe("function");
  });

  test("queries one latest project by tenant and customer with stable ordering", async () => {
    const calls: Array<[string, ...unknown[]]> = [];
    const client = buildClient(calls, PROJECT);
    adminClientSpy = spyOn(SupabaseDB, "getAdminClient").mockReturnValue(
      client as unknown as ReturnType<typeof SupabaseDB.getAdminClient>,
    );

    const result = await customerCoreRepository.findLatestProject({
      tenantId: TENANT_ID,
      customerId: CUSTOMER_ID,
    });

    expect(result).toEqual(PROJECT);
    expect(calls).toContainEqual(["from", "projects"]);
    expect(calls).toContainEqual([
      "select",
      "id, customer_id, name, status, created_at",
    ]);
    expect(calls).toContainEqual(["eq", "tenant_id", TENANT_ID]);
    expect(calls).toContainEqual(["eq", "customer_id", CUSTOMER_ID]);
    expect(calls).toContainEqual([
      "order",
      "created_at",
      { ascending: false },
    ]);
    expect(calls).toContainEqual(["order", "id", { ascending: false }]);
    expect(calls).toContainEqual(["limit", 1]);
    expect(calls).toContainEqual(["maybeSingle"]);
  });

  test("returns null when the customer has no project", async () => {
    const calls: Array<[string, ...unknown[]]> = [];
    const client = buildClient(calls, null);
    adminClientSpy = spyOn(SupabaseDB, "getAdminClient").mockReturnValue(
      client as unknown as ReturnType<typeof SupabaseDB.getAdminClient>,
    );

    await expect(customerCoreRepository.findLatestProject({
      tenantId: TENANT_ID,
      customerId: CUSTOMER_ID,
    })).resolves.toBeNull();
  });
});

function buildClient(
  calls: Array<[string, ...unknown[]]>,
  data: typeof PROJECT | null,
) {
  const query = {
    eq(column: string, value: unknown) {
      calls.push(["eq", column, value]);
      return this;
    },
    order(column: string, options: unknown) {
      calls.push(["order", column, options]);
      return this;
    },
    limit(value: number) {
      calls.push(["limit", value]);
      return this;
    },
    async maybeSingle() {
      calls.push(["maybeSingle"]);
      return { data, error: null };
    },
  };

  return {
    from(table: string) {
      calls.push(["from", table]);
      return {
        select(columns: string) {
          calls.push(["select", columns]);
          return query;
        },
      };
    },
  };
}
