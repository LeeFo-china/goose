import { describe, expect, test } from "bun:test";
import {
  buildProjectsHref,
  workflowNodeOptionsForGroup,
  type ProjectWorkflowFiltersData,
} from "./project-list-filter-utils";

const filters: ProjectWorkflowFiltersData = {
  groups: [
    { key: "signing", label: "签约阶段", order: 10, count: 1 },
    { key: "construction", label: "施工阶段", order: 20, count: 3 },
  ],
  nodes: [
    {
      key: "designing",
      label: "设计中",
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
  ],
  instance_statuses: [
    { key: "running", label: "进行中", order: 10, count: 3 },
  ],
};

describe("project list workflow filters", () => {
  test("builds projects href with workflow v2 query params", () => {
    expect(buildProjectsHref({
      page: 2,
      ownership: "all",
      keyword: "张三",
      workflowGroupKey: "construction",
      workflowNodeKey: "procedure_plumbing_electrical",
      workflowInstanceStatus: "running",
    })).toBe(
      "/projects?page=2&ownership=all&keyword=%E5%BC%A0%E4%B8%89&workflow_group_key=construction&workflow_node_key=procedure_plumbing_electrical&workflow_instance_status=running",
    );
  });

  test("filters workflow node options by selected group", () => {
    expect(workflowNodeOptionsForGroup(filters, "construction")).toEqual([
      {
        value: "procedure_plumbing_electrical",
        label: "水电 (2)",
      },
    ]);
    expect(workflowNodeOptionsForGroup(filters, "")).toEqual([
      {
        value: "designing",
        label: "签约阶段 / 设计中 (1)",
      },
      {
        value: "procedure_plumbing_electrical",
        label: "施工阶段 / 水电 (2)",
      },
    ]);
  });
});
