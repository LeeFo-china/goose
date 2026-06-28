import { describe, expect, test } from "bun:test";
import {
  mergeProjectListEnrichmentRows,
  mergeProjectListWorkflowRows,
} from "./list-enrichment-rows";

describe("mergeProjectListEnrichmentRows", () => {
  test("keeps independent list enrichment fields while letting display status win", () => {
    const [row] = mergeProjectListEnrichmentRows({
      baseRows: [{
        id: "project-1",
        name: "测试项目",
        status: "acceptance",
      }],
      assigneeRows: [{
        id: "project-1",
        designer: { id: "designer-1", name: "阿紫" },
        supervisor: { id: "supervisor-1", name: "萧峰" },
      }],
      stageRows: [{
        id: "project-1",
        current_stage: "completion",
        current_stage_label: "竣工",
        display_status: "acceptance",
        display_status_label: "验收中",
      }],
      displayStatusRows: [{
        id: "project-1",
        display_status: "final_acceptance_completed",
        display_status_label: "已完成",
      }],
    });

    expect(row).toMatchObject({
      id: "project-1",
      name: "测试项目",
      designer: { id: "designer-1", name: "阿紫" },
      supervisor: { id: "supervisor-1", name: "萧峰" },
      current_stage: "completion",
      current_stage_label: "竣工",
      display_status: "final_acceptance_completed",
      display_status_label: "已完成",
    });
  });
});

describe("mergeProjectListWorkflowRows", () => {
  test("adds only workflow summary fields to already enriched rows", () => {
    const [row] = mergeProjectListWorkflowRows({
      baseRows: [{
        id: "project-1",
        name: "测试项目",
        display_status: "final_acceptance_completed",
        display_status_label: "已完成",
        designer: { id: "designer-1", name: "阿紫" },
      }],
      workflowRows: [{
        id: "project-1",
        display_status: "constructing",
        workflow_progress: {
          workflow_title: "标准施工流程",
          current_node_title: "水电",
        },
        workflow_state: {
          workflow_title: "标准施工流程",
        },
      }],
    });

    expect(row).toMatchObject({
      id: "project-1",
      name: "测试项目",
      display_status: "final_acceptance_completed",
      display_status_label: "已完成",
      designer: { id: "designer-1", name: "阿紫" },
      workflow_progress: {
        workflow_title: "标准施工流程",
        current_node_title: "水电",
      },
      workflow_state: {
        workflow_title: "标准施工流程",
      },
    });
  });
});
