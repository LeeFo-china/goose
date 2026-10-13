import { beforeAll, describe, expect, mock, test } from "bun:test";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";
let listCameraProjectGroups: typeof import("./legacy/bind-options").listCameraProjectGroups;
beforeAll(async () => {
  ({ listCameraProjectGroups } = await import("./legacy/bind-options"));
});
const tenantId = "00000000-0000-4000-8000-000000000001";
const projectId = "00000000-0000-4000-8000-000000000002";
const counts = { camera_count: 42, online_count: 20, offline_count: 12,
  unknown_count: 10, hidden_count: 3, tencent_count: 30 };
const summary = { project_count: 101, total_camera_count: 42, online_count: 20,
  offline_count: 12, unknown_count: 10, hidden_count: 3, tencent_count: 30 };
const input = { tenantId, visibleProjectIds: [projectId], page: 2, pageSize: 20,
  binding: "all" as const, project_status: "constructing" as const, keyword: "13812345678" };

describe("camera workspace project repository", () => {
  test("delegates filtering and project paging to one RPC and masks only output", async () => {
    const rpc = mock(async () => ({ data: { list: [{ project: {
      id: projectId, tenant_id: tenantId, name: "项目", status: "constructing",
      address: null, customer_id: null, property_id: null,
      customer: { name: "客户", phone: "13812345678" }, property: null,
    }, summary: counts }], total: 101, summary }, error: null }));
    const result = await listCameraProjectGroups.call({ adminClient: { rpc } }, input);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("list_camera_workspace_projects", {
      p_tenant_id: tenantId, p_visible_project_ids: [projectId], p_page: 2,
      p_page_size: 20, p_binding: "all", p_project_status: "constructing",
      p_keyword: "13812345678",
    });
    expect(result.list[0]?.project.phone_masked).toBe("138****5678");
    expect(result.list[0]?.cameras).toEqual([]);
    expect(result.list[0]?.summary).toEqual(counts);
    expect(result.summary).toEqual(summary);
    expect(result.pagination).toEqual({ page: 2, pageSize: 20, total: 101, totalPages: 6 });
  });
  test("empty visibility never queries and returns zero offline/unknown counts", async () => {
    const rpc = mock();
    const result = await listCameraProjectGroups.call({ adminClient: { rpc } }, {
      ...input, visibleProjectIds: [],
    });
    expect(rpc).not.toHaveBeenCalled();
    expect(result.list).toEqual([]);
    expect(result.summary.offline_count).toBe(0);
    expect(result.summary.unknown_count).toBe(0);
  });
  test("database failure is wrapped instead of a misleading empty success", async () => {
    const rpc = mock(async () => ({ data: null, error: { message: "offline" } }));
    await expect(listCameraProjectGroups.call({ adminClient: { rpc } }, input))
      .rejects.toThrow("查询项目摄像头分组失败");
  });
});

describe("camera workspace detail repository", () => {
  test("uses tenant/project/deleted filters, stable order and exact bounded range", async () => {
    const { listCameraWorkspaceDevices } = await import("./workspace");
    const rows = [{ id: "camera", name: "摄像头" }];
    const query = {
      select: mock((_fields: string, _options: unknown) => query), eq: mock(() => query), is: mock(() => query),
      order: mock((_field: string, _options: unknown) => query), range: mock(async () => ({ data: rows, count: 41, error: null })),
    };
    const from = mock(() => query);
    const result = await listCameraWorkspaceDevices(
      { from } as unknown as Parameters<typeof listCameraWorkspaceDevices>[0],
      { tenantId, projectId, page: 2, pageSize: 20 },
    );
    expect(from).toHaveBeenCalledWith("project_cameras");
    expect(query.select.mock.calls[0]?.[0]).not.toContain("*");
    expect(query.eq).toHaveBeenCalledWith("tenant_id", tenantId);
    expect(query.eq).toHaveBeenCalledWith("project_id", projectId);
    expect(query.is).toHaveBeenCalledWith("deleted_at", null);
    expect(query.order.mock.calls.map((args) => args[0])).toEqual(["sort_order", "created_at", "id"]);
    expect(query.range).toHaveBeenCalledWith(20, 39);
    expect(result.list.map((row) => row.id)).toEqual(["camera"]);
    expect(result.pagination).toEqual({ page: 2, pageSize: 20, total: 41, totalPages: 3 });
  });
  test("missing tenant is rejected before any query", async () => {
    const { listCameraWorkspaceDevices } = await import("./workspace");
    const from = mock();
    await expect(listCameraWorkspaceDevices(
      { from } as unknown as Parameters<typeof listCameraWorkspaceDevices>[0],
      { tenantId: "", projectId, page: 1, pageSize: 20 },
    )).rejects.toThrow("无权限");
    expect(from).not.toHaveBeenCalled();
  });
});
