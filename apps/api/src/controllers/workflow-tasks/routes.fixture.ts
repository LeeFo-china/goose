import assert from "node:assert/strict";
import { mock } from "bun:test";

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

async function main(): Promise<void> {
  const { default: controller } = await import(".");
  Object.defineProperty(controller, "getRequiredTenantContext", {
    configurable: true,
    value: mock(async () => auth),
  });

  const routes: Array<{ method: string; path: string }> = [];
  controller.registerExtraRoutes({
    get: (path: string) => routes.push({ method: "GET", path }),
    post: (path: string) => routes.push({ method: "POST", path }),
  } as never);
  assert.deepEqual(routes, [
    { method: "GET", path: "/workflow-tasks" },
    { method: "POST", path: "/workflow-tasks/:id/complete" },
  ]);

  const response = await controller.completeTask({
    params: { id: TASK_ID },
    headers: { "idempotency-key": " supplier-review-1 " },
    body: { action: "reject", reason: "数量有误", output: {} },
  } as never, {} as never);
  assert.deepEqual(completeTask.mock.calls.at(-1), [
    auth,
    TASK_ID,
    { action: "reject", reason: "数量有误", output: {} },
    " supplier-review-1 ",
  ]);
  assert.deepEqual(response, {
    data: { status: "ordered" },
    message: "success",
  });

  const cases = [
    { headers: {}, expected: null },
    { headers: { "idempotency-key": "" }, expected: "" },
    {
      headers: { "idempotency-key": "x".repeat(121) },
      expected: "x".repeat(121),
    },
  ];
  for (const item of cases) {
    await controller.completeTask({
      params: { id: TASK_ID },
      headers: item.headers,
      body: { action: "complete", output: {} },
    } as never, {} as never);
    assert.deepEqual(completeTask.mock.calls.at(-1), [
      auth,
      TASK_ID,
      { action: "complete", output: {} },
      item.expected,
    ]);
  }

  console.log("WORKFLOW_TASK_CONTROLLER_ROUTES_OK");
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
