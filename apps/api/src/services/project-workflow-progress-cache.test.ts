import { describe, expect, mock, test } from "bun:test";
import {
  ProjectWorkflowProgressService,
  type GetProjectProgressInput,
  type GetProjectProgressOptions,
  type ProjectWorkflowProgress,
} from "./project-workflow-progress";
import { createProjectWorkflowProgressTimingSteps } from "./project-workflow-progress-timing";

const progress = (
  source: ProjectWorkflowProgress["source"] = "workflow_runtime",
): ProjectWorkflowProgress => ({
  source,
  instance_id: source === "workflow_runtime" ? "instance-1" : null,
  instance_status: source === "workflow_runtime" ? "running" : null,
  current_node_key: null,
  current_node_title: null,
  current_group_key: null,
  current_group_label: null,
  current_group_order: null,
  current_node_type: null,
  current_business_kind: null,
  current_stage_code: null,
  current_gate: null,
  timeline_nodes: [],
  pending_task_count: 0,
  actions: [],
  warnings: [],
});

class TestProjectWorkflowProgressService extends ProjectWorkflowProgressService {
  readonly loader = mock(
    async (_input: GetProjectProgressInput, _options: GetProjectProgressOptions) =>
      progress(),
  );

  protected override loadProjectProgress(
    input: GetProjectProgressInput,
    options: GetProjectProgressOptions,
  ): Promise<ProjectWorkflowProgress> {
    return this.loader(input, options);
  }
}

describe("ProjectWorkflowProgressService cache", () => {
  test("deduplicates concurrent reads for one tenant project", async () => {
    let release: ((value: ProjectWorkflowProgress) => void) | undefined;
    const service = new TestProjectWorkflowProgressService();
    service.loader.mockImplementation(() =>
      new Promise<ProjectWorkflowProgress>((resolve) => {
        release = resolve;
      })
    );

    const firstPromise = service.getProjectProgress({
      tenantId: "tenant-1",
      projectId: "project-1",
    });
    const secondPromise = service.getProjectProgress({
      tenantId: "tenant-1",
      projectId: "project-1",
    });
    await Promise.resolve();
    release?.(progress());
    const [first, second] = await Promise.all([firstPromise, secondPromise]);

    expect(service.loader).toHaveBeenCalledTimes(1);
    expect(first).toBe(second);
  });

  test("copies shared timings to an in-flight joiner and marks cache hits", async () => {
    let release: ((value: ProjectWorkflowProgress) => void) | undefined;
    const service = new TestProjectWorkflowProgressService();
    service.loader.mockImplementation((_input, options) => {
      if (options.timing) options.timing.graph_ms = 17;
      return new Promise<ProjectWorkflowProgress>((resolve) => { release = resolve; });
    });
    const input = { tenantId: "tenant-1", projectId: "project-1" };
    const firstTiming = createProjectWorkflowProgressTimingSteps();
    const joinerTiming = createProjectWorkflowProgressTimingSteps();

    const firstPromise = service.getProjectProgress(input, { timing: firstTiming });
    await Promise.resolve();
    const joinerPromise = service.getProjectProgress(input, { timing: joinerTiming });
    await Promise.resolve();
    release?.(progress());
    await Promise.all([firstPromise, joinerPromise]);

    expect(firstTiming).toMatchObject({ cache_status: "loaded", graph_ms: 17 });
    expect(joinerTiming).toMatchObject({ cache_status: "in_flight", graph_ms: 17 });

    const hitTiming = createProjectWorkflowProgressTimingSteps();
    await service.getProjectProgress(input, { timing: hitTiming });
    expect(hitTiming).toMatchObject({ cache_status: "hit", graph_ms: 0 });
  });

  test("reuses a successful value within the configured ttl", async () => {
    const service = new TestProjectWorkflowProgressService({ cacheTtlMs: 5 });

    const first = await service.getProjectProgress({
      tenantId: "tenant-1",
      projectId: "project-1",
    });
    const cached = await service.getProjectProgress({
      tenantId: "tenant-1",
      projectId: "project-1",
    });
    await Bun.sleep(10);
    const refreshed = await service.getProjectProgress({
      tenantId: "tenant-1",
      projectId: "project-1",
    });

    expect(cached).toBe(first);
    expect(refreshed).not.toBe(first);
    expect(service.loader).toHaveBeenCalledTimes(2);
  });

  test("isolates tenant and project cache keys", async () => {
    const service = new TestProjectWorkflowProgressService();

    await service.getProjectProgress({ tenantId: "tenant-1", projectId: "project-1" });
    await service.getProjectProgress({ tenantId: "tenant-2", projectId: "project-1" });
    await service.getProjectProgress({ tenantId: "tenant-1", projectId: "project-2" });

    expect(service.loader).toHaveBeenCalledTimes(3);
  });

  test("retries after a rejected load", async () => {
    const service = new TestProjectWorkflowProgressService();
    service.loader.mockImplementationOnce(async () => {
      throw new Error("temporary failure");
    });

    await expect(service.getProjectProgress({
      tenantId: "tenant-1",
      projectId: "project-1",
    })).rejects.toThrow("temporary failure");
    const retried = await service.getProjectProgress({
      tenantId: "tenant-1",
      projectId: "project-1",
    });

    expect(retried.source).toBe("workflow_runtime");
    expect(service.loader).toHaveBeenCalledTimes(2);
  });

  test("does not cache unavailable progress", async () => {
    const service = new TestProjectWorkflowProgressService();
    service.loader.mockImplementation(async () => progress("unavailable"));

    await service.getProjectProgress({ tenantId: "tenant-1", projectId: "project-1" });
    await service.getProjectProgress({ tenantId: "tenant-1", projectId: "project-1" });

    expect(service.loader).toHaveBeenCalledTimes(2);
  });

  test("reloads progress after explicit invalidation", async () => {
    const service = new TestProjectWorkflowProgressService();
    const input = { tenantId: "tenant-1", projectId: "project-1" };

    const first = await service.getProjectProgress(input);
    service.invalidateProject(input);
    const refreshed = await service.getProjectProgress(input);

    expect(refreshed).not.toBe(first);
    expect(service.loader).toHaveBeenCalledTimes(2);
  });
});
