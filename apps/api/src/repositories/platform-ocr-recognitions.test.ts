import { describe, expect, mock, test } from "bun:test";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

type Trace = {
  table: string[];
  selects: unknown[];
  inserts: unknown[];
  updates: unknown[];
  equals: Array<[string, unknown]>;
  nulls: Array<[string, unknown]>;
  ins: Array<[string, unknown]>;
  gtes: Array<[string, unknown]>;
  ltes: Array<[string, unknown]>;
  limits: unknown[];
};

function buildClient(trace: Trace, data: unknown = { id: "recognition-1" }) {
  const builder: Record<string, unknown> = {};
  builder.from = mock((table: string) => {
    trace.table.push(table);
    return builder;
  });
  builder.select = mock((columns: unknown) => {
    trace.selects.push(columns);
    return builder;
  });
  builder.insert = mock((payload: unknown) => {
    trace.inserts.push(payload);
    return builder;
  });
  builder.update = mock((payload: unknown) => {
    trace.updates.push(payload);
    return builder;
  });
  builder.eq = mock((field: string, value: unknown) => {
    trace.equals.push([field, value]);
    return builder;
  });
  builder.is = mock((field: string, value: unknown) => {
    trace.nulls.push([field, value]);
    return builder;
  });
  builder.in = mock((field: string, value: unknown) => {
    trace.ins.push([field, value]);
    return builder;
  });
  builder.gte = mock((field: string, value: unknown) => {
    trace.gtes.push([field, value]);
    return builder;
  });
  builder.lte = mock((field: string, value: unknown) => {
    trace.ltes.push([field, value]);
    return builder;
  });
  builder.limit = mock((value: unknown) => {
    trace.limits.push(value);
    return builder;
  });
  builder.maybeSingle = mock(async () => ({ data, error: null }));
  return builder;
}

async function loadRepository(trace: Trace, data?: unknown) {
  const client = buildClient(trace, data);
  mock.module("@/utils/supabase", () => ({
    SupabaseDB: { getAdminClient: () => client },
  }));
  return (await import("./platform-ocr-recognitions"))
    .platformOcrRecognitionRepository;
}

function trace(): Trace {
  return {
    table: [],
    selects: [],
    inserts: [],
    updates: [],
    equals: [],
    nulls: [],
    ins: [],
    gtes: [],
    ltes: [],
    limits: [],
  };
}

describe("platformOcrRecognitionRepository", () => {
  test("creates platform processing rows with explicit platform scope", async () => {
    const calls = trace();
    const repository = await loadRepository(calls);

    await repository.createProcessing({
      actorEmployeeId: "employee-1",
      scene: "supplier_onboarding",
      documentType: "business_license",
      providerAction: "BizLicenseOCR",
      fileObjectId: "file-1",
      fileChecksum: "checksum-1",
      idempotencyKey: "idem-1",
      dedupeKey: "dedupe-1",
      expiresAt: "2026-07-25T00:00:00.000Z",
    });

    expect(calls.inserts[0]).toMatchObject({
      scope_type: "platform",
      tenant_id: null,
      actor_employee_id: "employee-1",
      scene: "supplier_onboarding",
    });
  });

  test("finds owner-readable result by platform scope and actor employee", async () => {
    const calls = trace();
    const repository = await loadRepository(calls);

    await repository.findByIdForEmployee("recognition-1", "employee-1");

    expect(calls.equals).toEqual(expect.arrayContaining([
      ["id", "recognition-1"],
      ["scope_type", "platform"],
      ["actor_employee_id", "employee-1"],
    ]));
    expect(calls.nulls).toContainEqual(["tenant_id", null]);
    expect(calls.limits).toEqual([1]);
  });

  test("counts platform daily quota without tenant rows", async () => {
    const calls = trace();
    const repository = await loadRepository(calls);

    await repository.countPlatformSince("2026-07-24T00:00:00.000Z");

    expect(calls.selects).toContainEqual("id");
    expect(calls.equals).toContainEqual(["scope_type", "platform"]);
    expect(calls.nulls).toContainEqual(["tenant_id", null]);
    expect(calls.gtes).toContainEqual([
      "created_at",
      "2026-07-24T00:00:00.000Z",
    ]);
  });
});
