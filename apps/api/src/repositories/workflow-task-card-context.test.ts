import { beforeEach, describe, expect, mock, test } from "bun:test";

type QueryCall = {
  table: string;
  select: string;
  inFilters: Array<[string, unknown[]]>;
  equalFilters: Array<[string, unknown]>;
  limit: number | null;
};

const calls: QueryCall[] = [];
const rowsByTable: Record<string, unknown[]> = {
  supplier_purchase_batches: [{
    id: "batch-1",
    batch_no: "PB-20260830-00000001",
    project_id: "project-1",
    total_amount: "2680.00",
    item_count: 4,
    supplier_count: 2,
    submitted_by_employee_id: "employee-1",
    submitted_at: "2026-08-30T03:30:00.000Z",
    updated_at: "2026-08-30T03:31:00.000Z",
  }],
  employees: [{ id: "employee-1", name: "黄蓉" }],
};

class QueryMock {
  private readonly call: QueryCall;

  constructor(private readonly table: string) {
    this.call = {
      table,
      select: "",
      inFilters: [],
      equalFilters: [],
      limit: null,
    };
    calls.push(this.call);
  }

  select(columns: string) {
    this.call.select = columns;
    return this;
  }

  in(column: string, values: unknown[]) {
    this.call.inFilters.push([column, values]);
    return this;
  }

  eq(column: string, value: unknown) {
    this.call.equalFilters.push([column, value]);
    return this;
  }

  async limit(limit: number) {
    this.call.limit = limit;
    return { data: rowsByTable[this.table] ?? [], error: null };
  }
}

mock.module("@/utils/supabase", () => ({
  SupabaseDB: {
    getAdminClient: () => ({
      from: (table: string) => new QueryMock(table),
    }),
  },
}));

describe("workflowTaskCardContextRepository supplier batch summaries", () => {
  beforeEach(() => calls.splice(0));

  test("loads one tenant-scoped and bounded batch summary query", async () => {
    const { workflowTaskCardContextRepository } = await import(
      "./workflow-task-card-context"
    );

    const summaries = await workflowTaskCardContextRepository
      .listSupplierPurchaseBatchSummariesByIds({
        tenantId: "tenant-1",
        batchIds: ["batch-1", "batch-1"],
      });

    expect(summaries).toEqual([{
      id: "batch-1",
      batch_no: "PB-20260830-00000001",
      project_id: "project-1",
      total_amount: 2680,
      item_count: 4,
      supplier_count: 2,
      submitted_by_employee_id: "employee-1",
      submitted_at: "2026-08-30T03:30:00.000Z",
    }]);
    expect(calls).toEqual([{
      table: "supplier_purchase_batches",
      select: expect.stringContaining("batch_no"),
      inFilters: [["id", ["batch-1"]]],
      equalFilters: [["tenant_id", "tenant-1"]],
      limit: 100,
    }]);
    expect(calls[0]?.select).not.toContain("*");
  });

  test("loads applicant names in one tenant-scoped batch query", async () => {
    const { workflowTaskCardContextRepository } = await import(
      "./workflow-task-card-context"
    );

    const employees = await workflowTaskCardContextRepository
      .listEmployeeSummariesByIds({
        tenantId: "tenant-1",
        employeeIds: ["employee-1", "employee-1"],
      });

    expect(employees).toEqual([{ id: "employee-1", name: "黄蓉" }]);
    expect(calls).toEqual([{
      table: "employees",
      select: expect.stringContaining("id"),
      inFilters: [["id", ["employee-1"]]],
      equalFilters: [["tenant_id", "tenant-1"]],
      limit: 100,
    }]);
  });
});
