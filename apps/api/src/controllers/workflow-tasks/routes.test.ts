import { beforeEach, describe, expect, mock, test } from "bun:test";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const TASK_ID = "c1000000-0000-4000-8000-000000000001";
const auth = {
  authUserId: "c1000000-0000-4000-8000-000000000002",
  employeeId: "c1000000-0000-4000-8000-000000000003",
  tenantId: "c1000000-0000-4000-8000-000000000004",
};
const listTasks = mock(async () => ({
  list: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
}));
const completeTask = mock(async () => ({ status: "ordered" }));

mock.module("@/services/workflow-tasks", () => ({
  workflowTaskService: { listTasks, completeTask },
}));

async function controller() {
  const { default: value } = await import(".");
  Object.defineProperty(value, "getRequiredTenantContext", {
    configurable: true,
    value: mock(async () => auth),
  });
  return value;
}

describe("WorkflowTasksController", () => {
  beforeEach(() => {
    listTasks.mockClear();
    completeTask.mockClear();
  });

  test("registers list and complete routes", async () => {
    const value = await controller();
    const routes: Array<{ method: string; path: string }> = [];
    value.registerExtraRoutes({
      get: (path: string) => routes.push({ method: "GET", path }),
      post: (path: string) => routes.push({ method: "POST", path }),
    } as never);
    expect(routes).toEqual([
      { method: "GET", path: "/workflow-tasks" },
      { method: "POST", path: "/workflow-tasks/:id/complete" },
    ]);
  });

  test("passes the optional idempotency header through to task completion", async () => {
    const value = await controller();
    const response = await value.completeTask({
      params: { id: TASK_ID },
      headers: { "idempotency-key": " supplier-review-1 " },
      body: { action: "reject", reason: "数量有误", output: {} },
    } as never, {} as never);
    expect(completeTask).toHaveBeenCalledWith(
      auth,
      TASK_ID,
      { action: "reject", reason: "数量有误", output: {} },
      " supplier-review-1 ",
    );
    expect(response).toEqual({ data: { status: "ordered" }, message: "success" });
  });

  test("leaves missing empty and overlong headers to the task service", async () => {
    const value = await controller();
    const cases = [
      { headers: {}, expected: null },
      { headers: { "idempotency-key": "" }, expected: "" },
      {
        headers: { "idempotency-key": "x".repeat(121) },
        expected: "x".repeat(121),
      },
    ];
    for (const item of cases) {
      await value.completeTask({
        params: { id: TASK_ID }, headers: item.headers,
        body: { action: "complete", output: {} },
      } as never, {} as never);
      expect(completeTask).toHaveBeenLastCalledWith(
        auth,
        TASK_ID,
        { action: "complete", output: {} },
        item.expected,
      );
    }
  });
});
