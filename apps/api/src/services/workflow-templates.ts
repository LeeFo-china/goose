import { Errors } from "@/errors/error-factory";
import type {
  WorkflowGraphSaveInput,
  WorkflowTemplateCreateInput,
} from "@/schema/workflows";
import type { AuthContext } from "@/services/authorization";
import { workflowService } from "@/services/workflows";
import type { ProjectConstructionStageCode } from "@gooes/domain";

type WorkflowTemplateDefinition = {
  workflow_key: string;
  name: string;
  description: string;
  category: "sales" | "signing" | "construction" | "procedure" | "approval" | "main" | "acceptance";
  graph: WorkflowGraphSaveInput;
};

type WorkflowPaymentCollectionType = "deposit" | "stage_1" | "stage_2" | "stage_3" | "add_on";

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

  getTemplateForTest(input: WorkflowTemplateCreateInput): WorkflowTemplateDefinition {
    return this.getTemplate(input);
  }

  private getTemplate(input: WorkflowTemplateCreateInput): WorkflowTemplateDefinition {
    switch (input.template_key) {
      case "customer_main":
        return this.buildCustomerMainTemplate(input.name);
      case "project_signing":
        return this.buildProjectSigningTemplate(input.name);
      case "construction_main":
        return this.buildConstructionMainTemplate(input.name);
      case "expense_approval":
        return this.buildExpenseApprovalTemplate(input.name);
      case "sales_main":
      case "procedure_standard":
        return this.buildUnavailableTemplate(input.template_key);
    }
  }

  private buildCustomerMainTemplate(name?: string): WorkflowTemplateDefinition {
    return {
      workflow_key: "customer_main",
      name: name?.trim() || "客户主流程",
      description: "客户从线索、跟进、到店到设计的标准主流程模板。",
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
            node_key: "potential",
            node_type: "business",
            business_kind: "customer_lead",
            title: "潜在客户",
            description: "对应客户状态：潜在客户。",
            position: { x: 300, y: 180 },
            config: { required_permissions: ["customer.update"] },
            sort_order: 20,
          },
          {
            node_key: "following",
            node_type: "business",
            business_kind: "phone_follow_up",
            title: "电话跟进",
            description: "对应客户状态：跟进中。",
            position: { x: 520, y: 180 },
            config: { required_permissions: ["customer.update"] },
            sort_order: 30,
          },
          {
            node_key: "arrived",
            node_type: "business",
            business_kind: "store_visit",
            title: "到店接待",
            description: "对应客户状态：已到店。",
            position: { x: 740, y: 180 },
            config: { required_permissions: ["customer.update"] },
            sort_order: 40,
          },
          {
            node_key: "designing",
            node_type: "business",
            business_kind: "design",
            title: "方案设计",
            description: "对应客户状态：设计中。",
            position: { x: 960, y: 180 },
            config: { required_permissions: ["customer.update"] },
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
          this.edge("start", "potential", "登记客户", 10),
          this.edge("potential", "following", "开始跟进", 20),
          this.edge("following", "arrived", "标记到店", 30),
          this.edge("arrived", "designing", "开始设计", 40),
          this.edge("designing", "end", "设计完成", 50),
        ],
      },
    };
  }

  private buildProjectSigningTemplate(name?: string): WorkflowTemplateDefinition {
    const nodes: WorkflowGraphSaveInput["nodes"] = [
      this.node("start", "start", null, "开始", "项目进入签约主流程。", 80, 220, 10),
      this.node("designing", "business", "design", "设计中", "对应项目状态：设计中。", 280, 220, 20),
      this.node("proposal_confirmed", "business", "design", "方案已确认", "对应项目状态：方案已确认。", 500, 220, 30),
      this.node("signed", "business", "contract", "项目签约", "对应项目状态：已签约。", 720, 220, 40),
      this.node("design_finalized", "business", "design", "设计定稿", "对应项目状态：设计定稿。", 940, 220, 50),
      this.node("pending_start", "business", "construction_start", "排期开工", "对应项目状态：待开工。", 1160, 220, 60),
      this.node("end", "end", null, "结束", "项目签约主流程结束。", 1380, 220, 70),
    ];

    return {
      workflow_key: "project_signing",
      name: name?.trim() || "项目签约主流程",
      description: "项目从设计、方案确认、签约、设计定稿到排期开工的标准主流程模板。",
      category: "signing",
      graph: {
        nodes,
        edges: [
          this.edge("start", "designing", "进入设计", 10),
          this.edge("designing", "proposal_confirmed", "方案确认", 20),
          this.edge("proposal_confirmed", "signed", "项目签约", 30),
          this.edge("signed", "design_finalized", "设计定稿", 40),
          this.edge("design_finalized", "pending_start", "排期开工", 50),
          this.edge("pending_start", "end", "流程完成", 60),
        ],
      },
    };
  }

  private buildConstructionMainTemplate(name?: string): WorkflowTemplateDefinition {
    const nodes: WorkflowGraphSaveInput["nodes"] = [
      this.node("start", "start", null, "开始", "项目进入施工主流程。", 80, 220, 10),
      this.node("started", "construction_stage", "construction_start", "确认开工", "对应项目状态：已开工。", 280, 220, 20),
      this.procedureNode("procedure_demolition", "demolition", "拆改", "拆改工序完成后放行。", 500, 220, 30),
      this.procedureNode("procedure_plumbing_electrical", "plumbing_electrical", "水电", "水电工序完成后放行。", 720, 220, 40),
      this.paymentCollectionNode("payment_stage_2", "stage_2", "中期收款", "水电完成后确认中期款。", 940, 220, 50),
      this.procedureNode("procedure_tiling", "tiling", "瓦工", "瓦工工序完成后放行。", 1160, 220, 60),
      this.procedureNode("procedure_woodwork", "woodwork", "木工", "木工工序完成后放行。", 1380, 220, 70),
      this.paymentCollectionNode("payment_stage_3", "stage_3", "工程尾款", "木工完成后确认工程尾款。", 1600, 220, 80),
      this.procedureNode("procedure_painting", "painting", "油工", "油工工序完成后放行。", 1820, 220, 90),
      this.procedureNode("procedure_installation", "installation", "安装", "安装工序完成后放行。", 2040, 220, 100),
      this.node(
        "final_acceptance",
        "construction_stage",
        "final_acceptance",
        "竣工验收",
        "对应项目状态：竣工验收。",
        2260,
        220,
        110,
        ["project.update"],
        {
          stage_type: "final_acceptance",
          final_acceptance_report_enabled: true,
        },
      ),
      this.node("handover", "confirmation", null, "交房", "竣工验收后完成交房确认。", 2480, 220, 120),
      this.node("end", "end", null, "结束", "项目施工主流程结束。", 2700, 220, 130),
    ];

    return {
      workflow_key: "construction_main",
      name: name?.trim() || "项目施工主流程",
      description: "项目从确认开工、工序施工、中期收款、竣工验收到交房的标准主流程模板。",
      category: "construction",
      graph: {
        nodes,
        edges: [
          this.edge("start", "started", "确认开工", 10),
          this.edge("started", "procedure_demolition", "拆改", 20),
          this.edge("procedure_demolition", "procedure_plumbing_electrical", "水电", 30),
          this.edge("procedure_plumbing_electrical", "payment_stage_2", "中期收款", 40),
          this.edge("payment_stage_2", "procedure_tiling", "瓦工", 50),
          this.edge("procedure_tiling", "procedure_woodwork", "木工", 60),
          this.edge("procedure_woodwork", "payment_stage_3", "工程尾款", 70),
          this.edge("payment_stage_3", "procedure_painting", "油工", 80),
          this.edge("procedure_painting", "procedure_installation", "安装", 90),
          this.edge("procedure_installation", "final_acceptance", "竣工验收", 100),
          this.edge("final_acceptance", "handover", "交房", 110),
          this.edge("handover", "end", "流程完成", 120),
        ],
      },
    };
  }

  private buildExpenseApprovalTemplate(name?: string): WorkflowTemplateDefinition {
    return {
      workflow_key: "expense_approval",
      name: name?.trim() || "费用审批流程",
      description: "费用申请从主管审批、财务审批到登记打款的标准流程模板。",
      category: "approval",
      graph: {
        nodes: [
          this.node("start", "start", null, "开始", "费用申请提交审批。", 80, 180, 10, []),
          this.node("manager_review", "approval", "expense_approval", "经理审批", "对应费用当前步骤：经理审批。", 300, 180, 20, ["expense_request.approve_manager"], {
            approval_type: "expense_approval",
            assignee_rule: "applicant_department_manager",
            approve_mode: "any",
          }),
          this.node("finance_review", "approval", "expense_approval", "财务审批", "对应费用当前步骤：财务审批。", 520, 180, 30, ["expense_request.approve_finance"], {
            approval_type: "expense_approval",
            assignee_rule: "role",
            assignee_id: "finance_base",
            assignee_permission_code: "expense_request.approve_finance",
            approve_mode: "any",
          }),
          this.node("payment", "approval", "expense_approval", "出纳打款", "对应费用当前步骤：待打款。", 740, 180, 40, ["expense_request.pay"], {
            approval_type: "expense_approval",
            assignee_rule: "role",
            assignee_id: "finance_base",
            assignee_permission_code: "expense_request.pay",
            approve_mode: "any",
          }),
          this.node("rejected", "end", null, "已驳回", "费用审批驳回后流程结束，申请人可修改后重新提交。", 520, 380, 50, []),
          this.node("done", "end", null, "已完成", "费用完成打款后流程结束。", 960, 180, 60, []),
        ],
        edges: [
          this.edge("start", "manager_review", "提交申请", 10),
          this.edge("manager_review", "rejected", "主管驳回", 10, {
            operator: "eq",
            field: "decision",
            value: "rejected",
          }),
          this.edge("manager_review", "finance_review", "主管通过", 20, {
            operator: "eq",
            field: "decision",
            value: "approved",
          }),
          this.edge("finance_review", "rejected", "财务驳回", 10, {
            operator: "eq",
            field: "decision",
            value: "rejected",
          }),
          this.edge("finance_review", "payment", "财务通过", 20, {
            operator: "eq",
            field: "decision",
            value: "approved",
          }),
          this.edge("payment", "done", "完成打款", 10),
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
    requiredPermissions: string[] = ["project.update"],
    config: Record<string, unknown> = {},
  ): WorkflowGraphSaveInput["nodes"][number] {
    return {
      node_key: nodeKey,
      node_type: nodeType,
      business_kind: businessKind,
      title,
      description,
      position: { x, y },
      config: {
        required_permissions: nodeType === "start" || nodeType === "end"
          ? []
          : requiredPermissions,
        ...config,
      },
      sort_order: sortOrder,
    };
  }

  private procedureNode(
    nodeKey: string,
    stageKey: ProjectConstructionStageCode,
    title: string,
    description: string,
    x: number,
    y: number,
    sortOrder: number,
  ): WorkflowGraphSaveInput["nodes"][number] {
    return {
      node_key: nodeKey,
      node_type: "procedure",
      business_kind: "procedure_template",
      title,
      description,
      position: { x, y },
      config: {
        required_permissions: ["project.update"],
        stage_key: stageKey,
        require_log: true,
        min_image_count: 1,
        trigger_acceptance: false,
        customer_visible: true,
      },
      sort_order: sortOrder,
    };
  }

  private paymentCollectionNode(
    nodeKey: string,
    paymentType: WorkflowPaymentCollectionType,
    title: string,
    description: string,
    x: number,
    y: number,
    sortOrder: number,
  ): WorkflowGraphSaveInput["nodes"][number] {
    return {
      node_key: nodeKey,
      node_type: "confirmation",
      business_kind: "payment_collection",
      title,
      description,
      position: { x, y },
      config: {
        required_permissions: ["finance.payment.confirm"],
        finance_type: "payment_collection",
        payment_type: paymentType,
        requirement_mode: "any_confirmed",
        required_percentage: null,
        block_message: "请先确认项目收款后再推进流程",
        finance_reviewer_employee_id: null,
      },
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
