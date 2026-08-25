import { describe, expect, test } from "bun:test";

import { projectPublicationPhaseDisplay } from "./project-publication-logic";

describe("project publication concrete stage display", () => {
  test("uses the workflow current node as the concrete publication stage", () => {
    expect(projectPublicationPhaseDisplay({
      status: "constructing",
      status_label: "施工中",
      display_status: null,
      display_status_label: null,
      workflow_progress: { current_node_title: "水电", instance_status: "running" },
    })).toEqual({ label: "水电进行中", variant: "warning" });
  });
});
