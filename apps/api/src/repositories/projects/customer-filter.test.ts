import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { SupabaseDB } from "@/utils/supabase";
import { projectRepository } from "./legacy-repository";

const TENANT_ID = "11111111-1111-4111-8111-111111111111";
const CUSTOMER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

let adminClientSpy: { mockRestore: () => void } | null = null;

afterEach(() => {
  adminClientSpy?.mockRestore();
  adminClientSpy = null;
});

describe("projectRepository customer filter", () => {
  test("applies tenant and customer filters to pagination count", async () => {
    const calls: Array<[string, ...unknown[]]> = [];
    const result = Promise.resolve({ data: null, error: null, count: 0 });
    const query = {
      eq(column: string, value: unknown) {
        calls.push(["eq", column, value]);
        return this;
      },
      in(column: string, value: unknown) {
        calls.push(["in", column, value]);
        return this;
      },
      or(value: string) {
        calls.push(["or", value]);
        return this;
      },
      then<TResult1 = unknown, TResult2 = never>(
        onFulfilled?: ((value: {
          data: null;
          error: null;
          count: number;
        }) => TResult1 | PromiseLike<TResult1>) | null,
        onRejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
      ) {
        return result.then(onFulfilled, onRejected);
      },
    };
    const client = {
      from(table: string) {
        calls.push(["from", table]);
        return {
          select(columns: string, options: unknown) {
            calls.push(["select", columns, options]);
            return query;
          },
        };
      },
    };
    adminClientSpy = spyOn(SupabaseDB, "getAdminClient").mockReturnValue(
      client as unknown as ReturnType<typeof SupabaseDB.getAdminClient>,
    );

    await projectRepository.count({
      tenantId: TENANT_ID,
      visibleProjectIds: null,
      customerId: CUSTOMER_ID,
    });

    expect(calls).toContainEqual(["eq", "tenant_id", TENANT_ID]);
    expect(calls).toContainEqual(["eq", "customer_id", CUSTOMER_ID]);
  });
});
