import { beforeAll, describe, expect, mock, test } from "bun:test";

import { AppError } from "@/errors/app-error";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

let Repository: typeof import("./tenant-douyin-leads")
  .TenantDouyinLeadsRepository;

beforeAll(async () => {
  ({ TenantDouyinLeadsRepository: Repository } = await import(
    "./tenant-douyin-leads"
  ));
});

const TENANT_ID = "11111111-1111-4111-8111-111111111111";
const EMPLOYEE_ID = "55555555-5555-4555-8555-555555555555";
const DEPARTMENT_ID = "99999999-9999-4999-8999-999999999999";
type Result = { data: unknown; error: unknown; count?: number | null };
type Call = { method: string; args: unknown[] };

function clientWith(result: Result) {
  const calls: Call[] = [];
  class Query implements PromiseLike<Result> {
    private chain(method: string, args: unknown[]) {
      calls.push({ method, args });
      return this;
    }
    select(...args: unknown[]) { return this.chain("select", args); }
    eq(...args: unknown[]) { return this.chain("eq", args); }
    ilike(...args: unknown[]) { return this.chain("ilike", args); }
    order(...args: unknown[]) { return this.chain("order", args); }
    range(...args: unknown[]) { return this.chain("range", args); }
    then<TResult1 = Result, TResult2 = never>(
      onfulfilled?: ((value: Result) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) {
      return Promise.resolve(result).then(onfulfilled, onrejected);
    }
  }
  return {
    calls,
    client: {
      from: mock((table: string) => {
        calls.push({ method: "from", args: [table] });
        return new Query();
      }),
    },
  };
}

function input(scope: "self" | "department" | "assigned" | "all") {
  return { tenantId: TENANT_ID, scope, employeeId: EMPLOYEE_ID,
    tenantDepartmentId: DEPARTMENT_ID, page: 2, pageSize: 20 };
}

describe("TenantDouyinLeadsRepository assignee candidates", () => {
  test("forces tenant and active status with exact count, fields and range", async () => {
    const context = clientWith({ data: [{ id: EMPLOYEE_ID, name: "王顾问" }],
      error: null, count: 21 });
    await expect(new Repository(context.client as never).listAssigneeCandidates({
      ...input("all"), keyword: "王顾问",
    })).resolves.toEqual({
      rows: [{ id: EMPLOYEE_ID, name: "王顾问" }], total: 21,
    });
    expect(context.calls).toContainEqual({ method: "from", args: ["employees"] });
    expect(context.calls).toContainEqual({ method: "select",
      args: ["id,name", { count: "exact" }] });
    expect(context.calls).toContainEqual({ method: "eq",
      args: ["tenant_id", TENANT_ID] });
    expect(context.calls).toContainEqual({ method: "eq",
      args: ["status", "active"] });
    expect(context.calls).toContainEqual({ method: "ilike",
      args: ["name", "%王顾问%"] });
    expect(context.calls).toContainEqual({ method: "range", args: [20, 39] });
    expect(context.calls.findIndex((call) => call.method === "ilike"))
      .toBeLessThan(context.calls.findIndex((call) => call.method === "range"));
    expect(context.calls.filter((call) => call.method === "order")).toEqual([
      { method: "order", args: ["name", { ascending: true }] },
      { method: "order", args: ["id", { ascending: true }] },
    ]);
  });

  test("preserves nullable and long persisted names for service normalization", async () => {
    const longName = "王".repeat(101);
    const context = clientWith({ data: [
      { id: EMPLOYEE_ID, name: null },
      { id: "77777777-7777-4777-8777-777777777777", name: longName },
    ], error: null, count: 2 });
    await expect(new Repository(context.client as never)
      .listAssigneeCandidates(input("all"))).resolves.toMatchObject({
      rows: [{ id: EMPLOYEE_ID, name: null }, { name: longName }], total: 2,
    });
  });

  test("forces department and self-compatible scope filters", async () => {
    for (const [scope, field, value] of [
      ["department", "tenant_department_id", DEPARTMENT_ID],
      ["self", "id", EMPLOYEE_ID],
      ["assigned", "id", EMPLOYEE_ID],
    ] as const) {
      const context = clientWith({ data: [], error: null, count: 0 });
      await new Repository(context.client as never).listAssigneeCandidates(
        input(scope),
      );
      expect(context.calls).toContainEqual({ method: "eq", args: [field, value] });
    }
  });

  test("returns only strict candidate fields and keeps database errors redacted", async () => {
    for (const result of [
      { data: [], error: null, count: null },
      { data: [{ id: "invalid", name: null }], error: null, count: 1 },
      { data: null, error: { message: "database secret" }, count: null },
    ]) {
      try {
        await new Repository(clientWith(result).client as never)
          .listAssigneeCandidates(input("all"));
        throw new TypeError("expected rejection");
      } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        expect(error).toMatchObject({ statusCode: 500, code: "DB_ERROR",
          details: undefined });
        expect(String((error as Error).message)).not.toContain("database secret");
      }
    }
  });
});
