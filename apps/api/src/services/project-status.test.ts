import { describe, expect, test } from "bun:test";
import { resolvePausedFromStatusFromWorkflowLogs } from "./project-status";

describe("resolvePausedFromStatusFromWorkflowLogs", () => {
  test("uses the latest workflow pause output as resume target", () => {
    expect(resolvePausedFromStatusFromWorkflowLogs([
      {
        action: "approve",
        target_node_key: "constructing",
        context: { paused_from_status: "constructing" },
      },
      {
        action: "pause_project",
        target_node_key: "on_hold",
        context: { paused_from_status: "constructing" },
      },
      {
        action: "pause_project",
        target_node_key: "on_hold",
        context: { paused_from_status: "started" },
      },
    ])).toBe("constructing");
  });

  test("ignores invalid workflow pause output", () => {
    expect(resolvePausedFromStatusFromWorkflowLogs([
      {
        action: "pause_project",
        target_node_key: "on_hold",
        context: { paused_from_status: "on_hold" },
      },
      {
        action: "pause_project",
        target_node_key: "on_hold",
        context: { paused_from_status: "unknown" },
      },
    ])).toBeNull();
  });
});
