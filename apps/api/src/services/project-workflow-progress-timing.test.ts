import { describe, expect, test } from "bun:test";
import {
  createProjectWorkflowProgressTimingSteps,
  measureProjectWorkflowProgressStep,
  projectWorkflowProgressTimingStepKeys,
} from "./project-workflow-progress-timing";

describe("project workflow progress timing", () => {
  test("creates every timing step with a zero value", () => {
    const steps = createProjectWorkflowProgressTimingSteps();

    expect(Object.keys(steps)).toEqual(projectWorkflowProgressTimingStepKeys);
    expect(Object.values(steps).every((value) => value === 0)).toBe(true);
  });

  test("records a fulfilled step and returns its value", async () => {
    const steps = createProjectWorkflowProgressTimingSteps();

    const result = await measureProjectWorkflowProgressStep(
      steps,
      "graph_ms",
      async () => {
        await Bun.sleep(2);
        return "graph";
      },
    );

    expect(result).toBe("graph");
    expect(steps.graph_ms).toBeGreaterThanOrEqual(1);
  });

  test("records a rejected step before forwarding its error", async () => {
    const steps = createProjectWorkflowProgressTimingSteps();

    await expect(measureProjectWorkflowProgressStep(
      steps,
      "pending_tasks_ms",
      async () => {
        await Bun.sleep(2);
        throw new Error("query failed");
      },
    )).rejects.toThrow("query failed");

    expect(steps.pending_tasks_ms).toBeGreaterThanOrEqual(1);
  });

  test("runs without a collector", async () => {
    const result = await measureProjectWorkflowProgressStep(
      undefined,
      "projection_ms",
      () => "projection",
    );

    expect(result).toBe("projection");
  });
});
