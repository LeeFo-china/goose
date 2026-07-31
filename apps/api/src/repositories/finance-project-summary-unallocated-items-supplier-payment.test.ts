import { describe, expect, mock, test } from "bun:test";

const filters: Array<[string, string, unknown]> = [];

class UnallocatedItemsQuery {
  select() {
    return this;
  }
  eq(column: string, value: unknown) {
    filters.push(["eq", column, value]);
    return this;
  }
  neq(column: string, value: unknown) {
    filters.push(["neq", column, value]);
    return this;
  }
  is(column: string, value: unknown) {
    filters.push(["is", column, value]);
    return this;
  }
  in(column: string, value: unknown) {
    filters.push(["in", column, value]);
    return this;
  }
  order() {
    return this;
  }
  limit() {
    return Promise.resolve({ data: [], error: null });
  }
}

mock.module("@/utils/supabase/index", () => ({
  SupabaseDB: {
    getAdminClient: () => ({
      from: mock(() => new UnallocatedItemsQuery()),
    }),
  },
}));

describe("finance project unallocated expense preview", () => {
  test("excludes supplier payment cash from unallocated cost items", async () => {
    filters.length = 0;
    const { listFinanceProjectUnallocatedExpenseItems } = await import(
      "./finance-project-summary-unallocated-items"
    );

    await listFinanceProjectUnallocatedExpenseItems({
      tenantId: "tenant-1",
      projectIds: ["project-1"],
      limitPerProject: 3,
    });

    expect(filters).toContainEqual([
      "neq",
      "entry_type",
      "supplier_payment",
    ]);
  });
});
