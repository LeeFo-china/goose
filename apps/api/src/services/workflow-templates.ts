import { Errors } from "@/errors/error-factory";
import type {
  WorkflowGraphSaveInput,
  WorkflowTemplateCreateInput,
} from "@/schema/workflows";
import type { AuthContext } from "@/services/authorization";
import { workflowService } from "@/services/workflows";

type WorkflowTemplateDefinition = {
  workflow_key: string;
  name: string;
  description: string;
  category: "sales" | "construction" | "procedure" | "approval" | "main" | "acceptance";
  graph: WorkflowGraphSaveInput;
};

class WorkflowTemplateService {
  async createFromTemplate(
    authContext: AuthContext,
    input: WorkflowTemplateCreateInput,
  ) {
    const template = this.getTemplate(input);
    const definition = await workflowService.createDefinition(authContext, {
      workflow_key: template.workflow_key,
      name: template.name,
      description: template.description,
      category: template.category,
    });

    await workflowService.saveDraftGraph(authContext, definition.id, template.graph);
    return workflowService.publishDefinition(authContext, definition.id);
  }

  private getTemplate(input: WorkflowTemplateCreateInput): WorkflowTemplateDefinition {
    switch (input.template_key) {
      case "customer_main":
        return this.buildCustomerMainTemplate(input.name);
      case "construction_main":
        return this.buildConstructionMainTemplate(input.name);
      case "sales_main":
      case "procedure_standard":
      case "expense_approval":
        return this.buildUnavailableTemplate(input.template_key);
    }
  }

  private buildCustomerMainTemplate(name?: string): WorkflowTemplateDefinition {
    return {
      workflow_key: "customer_main",
      name: name?.trim() || "客户主流程",
      description: "客户从线索跟进、到店、设计到签约的标准主流程模板。",
      category: "sales",
      graph: {
        nodes: [
          {
            node_key: "start",
            node_type: "start",
            business_kind: null,
            title: "开始",
            description: "客户进入主流程。",
            position: { x: 80, y: 180 },
            config: { required_permissions: [] },
            sort_order: 10,
          },
          {
            node_key: "following",
            node_type: "business",
            business_kind: "phone_follow_up",
            title: "电话跟进",
            description: "对应客户状态：跟进中。",
            position: { x: 300, y: 180 },
            config: { required_permissions: [] },
            sort_order: 20,
          },
          {
            node_key: "arrived",
            node_type: "business",
            business_kind: "store_visit",
            title: "到店接待",
            description: "对应客户状态：已到店。",
            position: { x: 520, y: 180 },
            config: { required_permissions: [] },
            sort_order: 30,
          },
          {
            node_key: "designing",
            node_type: "business",
            business_kind: "design",
            title: "方案设计",
            description: "对应客户状态：设计中。",
            position: { x: 740, y: 180 },
            config: { required_permissions: [] },
            sort_order: 40,
          },
          {
            node_key: "signed",
            node_type: "business",
            business_kind: "contract",
            title: "签约",
            description: "对应客户状态：已签约。",
            position: { x: 960, y: 180 },
            config: { required_permissions: [] },
            sort_order: 50,
          },
          {
            node_key: "end",
            node_type: "end",
            business_kind: null,
            title: "结束",
            description: "客户主流程完成。",
            position: { x: 1180, y: 180 },
            config: { required_permissions: [] },
            sort_order: 60,
          },
        ],
        edges: [
          this.edge("start", "following", "开始跟进", 10),
          this.edge("following", "arrived", "标记到店", 20),
          this.edge("arrived", "designing", "开始设计", 30),
          this.edge("designing", "signed", "客户签约", 40),
          this.edge("signed", "end", "流程完成", 50),
        ],
      },
    };
  }

  private buildConstructionMainTemplate(name?: string): WorkflowTemplateDefinition {
    const nodes: WorkflowGraphSaveInput["nodes"] = [
      this.node("start", "start", null, "开始", "项目进入施工主流程。", 80, 220, 10),
      this.node("designing", "business", "design", "设计中", "对应项目状态：设计中。", 280, 220, 20),
      this.node("proposal_confirmed", "business", "design", "方案已确认", "对应项目状态：方案已确认。", 500, 220, 30),
      this.node("signed", "business", "contract", "项目签约", "对应项目状态：已签约。", 720, 220, 40),
      this.node("design_finalized", "business", "design", "设计定稿", "对应项目状态：设计定稿。", 940, 220, 50),
      this.node("pending_start", "business", "construction_start", "排期开工", "对应项目状态：待开工。", 1160, 220, 60),
      this.node("started", "business", "construction_start", "确认开工", "对应项目状态：已开工。", 1380, 220, 70),
      this.node("constructing", "construction_stage", "procedure_template", "施工中", "对应项目状态：施工中。", 1600, 220, 80),
      this.node("acceptance", "business", "final_acceptance", "竣工验收", "对应项目状态：竣工验收。", 1820, 220, 90),
      this.node("on_hold", "business", null, "项目暂停", "对应项目状态：已暂停。", 940, 460, 100),
      this.node("invalid", "end", null, "作废", "项目作废后流程结束。", 1380, 460, 110),
      this.node("end", "end", null, "结束", "项目施工主流程结束。", 2040, 220, 120),
    ];
    const pauseableNodeKeys = [
      "designing",
      "proposal_confirmed",
      "signed",
      "design_finalized",
      "pending_start",
      "started",
      "constructing",
      "acceptance",
    ];

    return {
      workflow_key: "construction_main",
      name: name?.trim() || "项目施工主流程",
      description: "项目从设计、签约、排期开工、施工到竣工验收的标准主流程模板。",
      category: "construction",
      graph: {
        nodes,
        edges: [
          this.edge("start", "designing", "进入设计", 10),
          this.edge("designing", "proposal_confirmed", "方案确认", 100),
          this.edge("proposal_confirmed", "signed", "签约", 100),
          this.edge("signed", "design_finalized", "设计定稿", 100),
          this.edge("design_finalized", "pending_start", "排期开工", 100),
          this.edge("pending_start", "started", "确认开工", 100),
          this.edge("started", "constructing", "正式进场", 100),
          this.edge("constructing", "acceptance", "竣工验收", 100),
          this.edge("acceptance", "end", "完成", 100),
          ...pauseableNodeKeys.flatMap((nodeKey) => [
            this.edge(nodeKey, "on_hold", "暂停项目", 10, {
              operator: "eq",
              field: "project_status_action",
              value: "pause_project",
            }),
            this.edge(nodeKey, "invalid", "作废项目", 20, {
              operator: "eq",
              field: "project_status_action",
              value: "mark_invalid",
            }),
          ]),
          ...pauseableNodeKeys.map((nodeKey) =>
            this.edge("on_hold", nodeKey, "恢复项目", 10, {
              operator: "eq",
              field: "paused_from_status",
              value: nodeKey,
            })
          ),
          this.edge("on_hold", "invalid", "作废项目", 20, {
            operator: "eq",
            field: "project_status_action",
            value: "mark_invalid",
          }),
        ],
      },
    };
  }

  private node(
    nodeKey: string,
    nodeType: WorkflowGraphSaveInput["nodes"][number]["node_type"],
    businessKind: WorkflowGraphSaveInput["nodes"][number]["business_kind"],
    title: string,
    description: string,
    x: number,
    y: number,
    sortOrder: number,
  ): WorkflowGraphSaveInput["nodes"][number] {
    return {
      node_key: nodeKey,
      node_type: nodeType,
      business_kind: businessKind,
      title,
      description,
      position: { x, y },
      config: { required_permissions: [] },
      sort_order: sortOrder,
    };
  }

  private buildUnavailableTemplate(templateKey: WorkflowTemplateCreateInput["template_key"]): never {
    throw Errors.badRequest(`流程模板尚未开放: ${templateKey}`);
  }

  private edge(
    sourceNodeKey: string,
    targetNodeKey: string,
    label: string,
    priority: number,
    condition: WorkflowGraphSaveInput["edges"][number]["condition"] = {
      operator: "always",
    },
  ) {
    return {
      source_node_key: sourceNodeKey,
      target_node_key: targetNodeKey,
      label,
      condition,
      priority,
    };
  }
}

export const workflowTemplateService = new WorkflowTemplateService();
