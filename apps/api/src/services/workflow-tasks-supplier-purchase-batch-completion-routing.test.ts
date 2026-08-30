import { expect, test } from "bun:test";
import { fileURLToPath } from "node:url";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

test("WorkflowTaskService routes supplier completion without module mock pollution", async () => {
  const fixture = fileURLToPath(new URL(
    "./workflow-tasks-supplier-purchase-batch-completion-routing.fixture.ts",
    import.meta.url,
  ));
  const child = Bun.spawn(["bun", fixture], {
    cwd: fileURLToPath(new URL("../../", import.meta.url)),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);

  expect(exitCode).toBe(0);
  expect(stderr).toBe("");
  expect(stdout.trim()).toBe("WORKFLOW_TASK_SUPPLIER_ROUTING_OK");
});
