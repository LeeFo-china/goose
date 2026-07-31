import { expect, mock, test } from "bun:test";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

test("payment evidence lookup is one bounded tenant-scoped active query", async () => {
  const { SupplierPaymentEvidenceFilesRepository } = await import(
    "./supplier-payment-evidence-files"
  );
  const trace = {
    equals: [] as Array<[string, unknown]>,
    nullChecks: [] as Array<[string, unknown]>,
    inCalls: [] as Array<[string, unknown[]]>,
    selects: [] as string[],
    limits: [] as number[],
  };
  const record = {
    object_key: "tenants/tenant-1/expense-request/evidence.png",
    tenant_id: "tenant-1",
    scene: "expense_request",
    status: "active",
    deleted_at: null,
    created_by_employee_id: "employee-1",
  };
  const builder: Record<string, unknown> = {};
  builder.select = mock((columns: string) => {
    trace.selects.push(columns);
    return builder;
  });
  builder.eq = mock((field: string, value: unknown) => {
    trace.equals.push([field, value]);
    return builder;
  });
  builder.is = mock((field: string, value: unknown) => {
    trace.nullChecks.push([field, value]);
    return builder;
  });
  builder.in = mock((field: string, values: unknown[]) => {
    trace.inCalls.push([field, values]);
    return builder;
  });
  builder.limit = mock(async (limit: number) => {
    trace.limits.push(limit);
    return { data: [record], error: null };
  });
  const repository = new SupplierPaymentEvidenceFilesRepository(() => ({
    from: mock(() => builder),
  }) as never);

  await expect(repository.findActiveByObjectKeys({
    objectKeys: [record.object_key],
    tenantId: "tenant-1",
    limit: 9,
  })).resolves.toEqual([record]);

  expect(trace.selects).toEqual([
    "object_key,tenant_id,scene,status,deleted_at,created_by_employee_id",
  ]);
  expect(trace.inCalls).toEqual([["object_key", [record.object_key]]]);
  expect(trace.equals).toEqual([
    ["tenant_id", "tenant-1"],
    ["status", "active"],
  ]);
  expect(trace.nullChecks).toEqual([["deleted_at", null]]);
  expect(trace.limits).toEqual([9]);
});
