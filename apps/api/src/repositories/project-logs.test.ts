import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

const originalSupabaseDbUrl = process.env.SUPABASE_DB_URL;
const originalSupabaseDbDirectUrl = process.env.SUPABASE_DB_DIRECT_URL;
const originalBunSql = globalThis.Bun.SQL;

type SupabaseRangeResult = {
  data: Array<Record<string, unknown>> | null;
  error: { code?: string; message?: string } | null;
  count: number | null;
};

const range = mock(async (): Promise<SupabaseRangeResult> => ({
  data: [{
    id: "log-6",
    project_id: "550e8400-e29b-41d4-a716-446655440001",
    tenant_id: "tenant-1",
    content: "第六条施工日志",
    images: [],
    employee: {
      id: "employee-1",
      name: "欧阳克",
      avatar: null,
    },
  }],
  error: null,
  count: 6,
}));
const order = mock(() => ({ range }));
const eqTenant = mock(() => ({ order }));
const eqProject = mock(() => ({ eq: eqTenant }));
const select = mock(() => ({ eq: eqProject }));
const from = mock(() => ({ select }));
const rpc = mock(async () => ({
  data: [{ date: "2026-06-27", count: 1, stage_code: "woodwork", node_name: "木工" }],
  error: null,
}));

mock.module("@/utils/supabase", () => ({
  SupabaseDB: {
    getAdminClient: () => ({
      from,
      rpc,
    }),
  },
}));

describe("projectLogRepository", () => {
  beforeEach(() => {
    process.env.SUPABASE_DB_URL = "postgres://session-pool";
    process.env.SUPABASE_DB_DIRECT_URL = "";
    range.mockClear();
    order.mockClear();
    eqTenant.mockClear();
    eqProject.mockClear();
    select.mockClear();
    from.mockClear();
    rpc.mockClear();
  });

  afterEach(() => {
    process.env.SUPABASE_DB_URL = originalSupabaseDbUrl;
    process.env.SUPABASE_DB_DIRECT_URL = originalSupabaseDbDirectUrl;
    globalThis.Bun.SQL = originalBunSql;
  });

  test("lists project logs through Supabase client instead of opening Bun.SQL session connections", async () => {
    const sqlConstructor = mock(() => {
      throw new Error("Bun.SQL should not be used for project log list reads");
    });
    globalThis.Bun.SQL = sqlConstructor as unknown as typeof globalThis.Bun.SQL;

    const { projectLogRepository } = await import("./project-logs");
    const result = await projectLogRepository.listByProject({
      projectId: "550e8400-e29b-41d4-a716-446655440001",
      tenantId: "tenant-1",
      from: 5,
      to: 9,
    });

    expect(sqlConstructor).not.toHaveBeenCalled();
    expect(from).toHaveBeenCalledWith("project_logs");
    expect(range).toHaveBeenCalledWith(5, 9);
    expect(result).toEqual({
      rows: [expect.objectContaining({ id: "log-6" })],
      total: 6,
    });
  });

  test("loads project log calendar through Supabase rpc instead of opening Bun.SQL session connections", async () => {
    const sqlConstructor = mock(() => {
      throw new Error("Bun.SQL should not be used for project log calendar reads");
    });
    globalThis.Bun.SQL = sqlConstructor as unknown as typeof globalThis.Bun.SQL;

    const { projectLogRepository } = await import("./project-logs");
    const result = await projectLogRepository.listCalendarRows({
      projectId: "550e8400-e29b-41d4-a716-446655440001",
      tenantId: "tenant-1",
    });

    expect(sqlConstructor).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith("get_project_log_calendar", {
      project_uuid: "550e8400-e29b-41d4-a716-446655440001",
    });
    expect(result).toEqual([
      { date: "2026-06-27", count: 1, stage_code: "woodwork", node_name: "木工" },
    ]);
  });

  test("returns an empty page instead of failing when project log page offset exceeds total", async () => {
    range
      .mockImplementationOnce(async () => ({
        data: null,
        error: {
          code: "PGRST103",
          message: "Requested range not satisfiable",
        },
        count: null,
      }))
      .mockImplementationOnce(async () => ({
        data: [{ id: "log-1" }],
        error: null,
        count: 28,
      }));

    const { projectLogRepository } = await import("./project-logs");
    const result = await projectLogRepository.listByProject({
      projectId: "550e8400-e29b-41d4-a716-446655440001",
      tenantId: "tenant-1",
      from: 30,
      to: 34,
    });

    expect(range).toHaveBeenNthCalledWith(1, 30, 34);
    expect(range).toHaveBeenNthCalledWith(2, 0, 0);
    expect(result).toEqual({
      rows: [],
      total: 28,
    });
  });
});
