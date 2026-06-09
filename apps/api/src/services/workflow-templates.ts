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
      case "sales_main":
      case "construction_main":
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

  private buildUnavailableTemplate(templateKey: WorkflowTemplateCreateInput["template_key"]): never {
    throw Errors.badRequest(`流程模板尚未开放: ${templateKey}`);
  }

  private edge(
    sourceNodeKey: string,
    targetNodeKey: string,
    label: string,
    priority: number,
  ) {
    return {
      source_node_key: sourceNodeKey,
      target_node_key: targetNodeKey,
      label,
      condition: { operator: "always" as const },
      priority,
    };
  }
}

export const workflowTemplateService = new WorkflowTemplateService();
