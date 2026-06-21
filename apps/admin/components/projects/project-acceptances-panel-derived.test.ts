import { describe, expect, test } from "bun:test";
import { getProjectAcceptancesPanelDerived } from "@/components/projects/project-acceptances-panel-derived";

describe("project acceptances panel workflow boundary", () => {
  test("uses workflow node acceptance action as stage acceptance source", () => {
    const derived = getProjectAcceptancesPanelDerived({
      acceptances: [],
      constructionStages: [
        {
          stage_code: "demolition",
          stage_label: "拆改",
          status: "pending",
          acceptance_id: null,
          acceptance_status: null,
          blocked_reason: null,
        },
      ],
      selectedId: "",
      stageCode: "demolition",
      projectStatus: "constructing",
      workflowTimelineNodes: [
        {
          node_key: "procedure_demolition",
          node_title: "拆改",
          node_type: "procedure",
          status: "done",
          display: { label: "拆改", status_label: "已完成" },
          attributes: {
            stage_code: "demolition",
            acceptance_enabled: false,
          },
          actions: [],
        },
        {
          node_key: "procedure_plumbing_electrical",
          node_title: "水电",
          node_type: "procedure",
          status: "blocked",
          display: { label: "水电", status_label: "待验收" },
          attributes: {
            stage_code: "plumbing_electrical",
            acceptance_enabled: true,
            acceptance_required: true,
          },
          actions: [
            {
              key: "create_acceptance",
              label: "发起验收",
              node_key: "procedure_plumbing_electrical",
              node_type: "procedure",
              business_domain: "project_acceptance",
              business_action: "create",
              requires_reason: false,
              disabled: false,
              output_fields: [],
              stage_code: "plumbing_electrical",
              acceptance_id: null,
              acceptance_status: null,
            },
          ],
        },
      ],
    });

    expect(derived.selectableStageOptions.map((item) => item.value)).toEqual([
      "plumbing_electrical",
    ]);
    expect(derived.firstAvailableStage?.value).toBe("plumbing_electrical");
    expect(derived.firstAvailableStage?.label).toBe("水电验收");
    expect(derived.canCreateAcceptance).toBe(true);
  });

  test("does not synthesize stage acceptance entry without workflow action", () => {
    const derived = getProjectAcceptancesPanelDerived({
      acceptances: [],
      constructionStages: [
        {
          stage_code: "demolition",
          stage_label: "拆改",
          status: "pending",
          acceptance_id: null,
          acceptance_status: null,
          blocked_reason: null,
        },
      ],
      selectedId: "",
      stageCode: "demolition",
      projectStatus: "constructing",
      workflowTimelineNodes: [
        {
          node_key: "procedure_demolition",
          node_title: "拆改",
          node_type: "procedure",
          status: "current",
          display: { label: "拆改", status_label: "当前" },
          attributes: {
            stage_code: "demolition",
            acceptance_enabled: false,
          },
          actions: [],
        },
      ],
    });

    expect(derived.selectableStageOptions).toEqual([]);
    expect(derived.firstAvailableStage).toBeUndefined();
    expect(derived.canCreateAcceptance).toBe(false);
  });
});
