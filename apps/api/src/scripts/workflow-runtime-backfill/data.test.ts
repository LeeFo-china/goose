import { beforeEach, describe, expect, mock, test } from "bun:test";

const eqCalls: Array<[string, unknown]> = [];
const inCalls: Array<[string, unknown[]]> = [];
const query = {
  data: [],
  error: null,
  select: mock(function (this: typeof query) {
    return this;
  }),
  eq: mock(function (this: typeof query, column: string, value: unknown) {
    eqCalls.push([column, value]);
    return this;
  }),
  in: mock(function (this: typeof query, column: string, values: unknown[]) {
    inCalls.push([column, values]);
    return this;
  }),
};
const from = mock(() => query);

mock.module("@/utils/supabase", () => ({
  SupabaseDB: {
    getAdminClient: () => ({ from }),
  },
}));

beforeEach(() => {
  eqCalls.length = 0;
  inCalls.length = 0;
  from.mockClear();
});

describe("listExistingInstances", () => {
  test("checks every workflow definition for the same tenant and subject", async () => {
    const { listExistingInstances } = await import("./data");

    await listExistingInstances({
      tenantId: "tenant-1",
      subjectType: "customer",
      subjectIds: ["customer-1"],
    });

    expect(from).toHaveBeenCalledWith("workflow_instances");
    expect(eqCalls).toEqual([
      ["tenant_id", "tenant-1"],
      ["subject_type", "customer"],
    ]);
    expect(eqCalls.some(([column]) => column === "definition_id")).toBe(false);
    expect(inCalls).toEqual([["subject_id", ["customer-1"]]]);
  });
});
