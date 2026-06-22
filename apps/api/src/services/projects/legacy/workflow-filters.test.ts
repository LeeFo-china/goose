import { describe, expect, test } from "bun:test";
import { buildProjectWorkflowFilterOptions } from "./workflow-filters";

describe("buildProjectWorkflowFilterOptions", () => {
  test("groups current workflow nodes by backend workflow v2 metadata", () => {
    const result = buildProjectWorkflowFilterOptions([
      {
        subject_id: "project-1",
        current_node_key: "procedure_plumbing_electrical",
        current_node_title: "水电",
        instance_status: "running",
        definition: { category: "construction" },
      },
      {
        subject_id: "project-2",
        current_node_key: "procedure_plumbing_electrical",
        current_node_title: "水电",
        instance_status: "running",
        definition: { category: "construction" },
      },
      {
        subject_id: "project-3",
        current_node_key: "proposal_confirmed",
        current_node_title: "方案确认",
        instance_status: "running",
        definition: { category: "signing" },
      },
      {
        subject_id: "project-4",
        current_node_key: "end",
        current_node_title: "结束",
        instance_status: "completed",
        definition: { category: "construction" },
      },
    ]);

    expect(result.groups).toEqual([
      {
        key: "signing",
        label: "签约阶段",
        order: 10,
        count: 1,
      },
      {
        key: "construction",
        label: "施工阶段",
        order: 20,
        count: 3,
      },
    ]);
    expect(result.nodes).toEqual([
      {
        key: "proposal_confirmed",
        label: "方案确认",
        group_key: "signing",
        group_label: "签约阶段",
        group_order: 10,
        order: 0,
        count: 1,
      },
      {
        key: "procedure_plumbing_electrical",
        label: "水电",
        group_key: "construction",
        group_label: "施工阶段",
        group_order: 20,
        order: 0,
        count: 2,
      },
      {
        key: "end",
        label: "结束",
        group_key: "construction",
        group_label: "施工阶段",
        group_order: 20,
        order: 1,
        count: 1,
      },
    ]);
    expect(result.instance_statuses).toEqual([
      { key: "running", label: "进行中", order: 10, count: 3 },
      { key: "completed", label: "已完成", order: 20, count: 1 },
    ]);
  });
});
