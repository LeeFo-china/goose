import { expect, test } from "bun:test";
import { fileURLToPath } from "node:url";

test("WorkflowTasksController routes run without module mock pollution", async () => {
  const fixture = fileURLToPath(new URL("./routes.fixture.ts", import.meta.url));
  const child = Bun.spawn(["bun", fixture], {
    cwd: fileURLToPath(new URL("../../../", import.meta.url)),
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
  expect(stdout.trim()).toBe("WORKFLOW_TASK_CONTROLLER_ROUTES_OK");
});
