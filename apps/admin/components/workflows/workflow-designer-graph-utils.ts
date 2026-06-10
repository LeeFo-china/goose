import type { WorkflowNodeType } from "@gooes/domain";
import { getWorkflowNodePreset } from "@/components/workflows/workflow-node-presets";
import {
  getWorkflowProcedureStageLabel,
  isWorkflowProcedureStageKey,
} from "@/components/workflows/workflow-procedure-stages";
import type {
  WorkflowDefinitionDetail,
  WorkflowEdge,
  WorkflowEdgeInput,
  WorkflowNode,
  WorkflowNodeConfig,
  WorkflowNodeInput,
} from "@/components/workflows/workflow-types";
import type {
  WorkflowDesignerGraph,
  WorkflowValidationResult,
} from "@/components/workflows/workflow-designer-types";

export function detailToGraph(detail: WorkflowDefinitionDetail): WorkflowDesignerGraph {
  return {
    definition: detail.definition,
    nodes: detail.draftGraph?.nodes || [],
    edges: detail.draftGraph?.edges || [],
  };
}

function defaultConfig(
  nodeType: WorkflowNodeType,
  businessKind?: WorkflowNode["business_kind"],
): WorkflowNodeConfig {
  if (businessKind === "payment_collection") {
    return {
      payment_type: "deposit",
      min_amount: null,
      block_message: null,
      finance_reviewer_employee_id: null,
    };
  }
  if (nodeType === "procedure") {
    return {
      stage_key: "",
      require_log: false,
      min_image_count: 0,
      trigger_acceptance: false,
      customer_visible: false,
    };
  }
  if (nodeType === "notification") {
    return {
      channels: ["todo"],
      recipient_rule: "owner",
      template: "请处理流程节点",
    };
  }
  return {};
}

export function createNodeFromPreset(input: {
  presetKey: string;
  index: number;
  definitionId: string;
  tenantId: string;
  position?: WorkflowNode["position"];
}): WorkflowNode {
  const preset = getWorkflowNodePreset(input.presetKey);
  const nodeType = preset?.nodeType || "business";
  const now = new Date().toISOString();
  const nodeKey = preset?.key === "workflow_step"
    ? `workflow_step_${input.index}`
    : preset?.key || `business_${input.index}`;
  const defaultPosition = {
    x: 120 + ((input.index - 1) % 4) * 260,
    y: 160 + Math.floor((input.index - 1) / 4) * 140,
  };

  return {
    id: `local-${Date.now()}-${input.index}`,
    tenant_id: input.tenantId,
    definition_id: input.definitionId,
    node_key: nodeKey,
    node_type: nodeType,
    business_kind: preset?.businessKind || null,
    title: preset?.label || "流程节点",
    description: preset?.description || null,
    position: input.position || defaultPosition,
    config: preset?.config ||
      defaultConfig(nodeType, preset?.businessKind || null),
    sort_order: input.index * 10,
    created_at: now,
    updated_at: now,
  };
}

export function toNodeInput(node: WorkflowNode): WorkflowNodeInput {
  return {
    id: node.id.startsWith("local-") ? undefined : node.id,
    node_key: node.node_key,
    node_type: node.node_type,
    business_kind: node.business_kind,
    title: node.title,
    description: node.description,
    position: node.position,
    config: node.config,
    sort_order: node.sort_order,
  };
}

export function toEdgeInput(
  edge: WorkflowEdge,
  nodeById: Map<string, WorkflowNode>,
): WorkflowEdgeInput | null {
  const source = nodeById.get(edge.source_node_id);
  const target = nodeById.get(edge.target_node_id);
  if (!source || !target) return null;

  const input: WorkflowEdgeInput = {
    source_node_key: source.node_key,
    target_node_key: target.node_key,
    label: edge.label,
    condition: edge.condition,
    priority: edge.priority,
  };

  return edge.id.startsWith("local-") ? input : { ...input, id: edge.id };
}

export function validateGraph(graph: WorkflowDesignerGraph): WorkflowValidationResult {
  const issues: WorkflowValidationResult["issues"] = [];
  const nodeKeys = new Set<string>();
  const procedureStageKeys = new Map<string, string>();
  const allNodeKeys = new Set(graph.nodes.map((node) => node.node_key));
  const nodeIds = new Set(graph.nodes.map((node) => node.id));
  const outgoingNodeIds = new Set(graph.edges.map((edge) => edge.source_node_id));

  graph.nodes.forEach((node) => {
    if (!node.node_key.trim()) {
      issues.push({ code: "node_key_required", message: "节点编码不能为空" });
    }
    if (nodeKeys.has(node.node_key)) {
      issues.push({
        code: "node_key_duplicate",
        message: "节点编码重复",
        nodeKey: node.node_key,
      });
    }
    nodeKeys.add(node.node_key);
    if (!node.title.trim()) {
      issues.push({
        code: "node_title_required",
        message: "节点标题不能为空",
        nodeKey: node.node_key,
      });
    }
    if (node.node_type === "procedure") {
      const stageKey = "stage_key" in node.config ? node.config.stage_key : "";
      if (!isWorkflowProcedureStageKey(stageKey)) {
        issues.push({
          code: "procedure_stage_required",
          message: "工序节点必须选择拆改、水电、瓦工、木工、油工或安装",
          nodeKey: node.node_key,
        });
      } else if (procedureStageKeys.has(stageKey)) {
        issues.push({
          code: "procedure_stage_duplicate",
          message: `${getWorkflowProcedureStageLabel(stageKey) || stageKey}工序重复`,
          nodeKey: node.node_key,
        });
      } else {
        procedureStageKeys.set(stageKey, node.node_key);
      }
    }
    if (node.business_kind === "payment_collection") {
      const paymentType = "payment_type" in node.config
        ? node.config.payment_type
        : "";
      if (
        paymentType !== "deposit" &&
        paymentType !== "stage_1" &&
        paymentType !== "stage_2" &&
        paymentType !== "stage_3" &&
        paymentType !== "add_on"
      ) {
        issues.push({
          code: "payment_collection_type_required",
          message: "收款节点必须选择有效的收款类型",
          nodeKey: node.node_key,
        });
      }
      const minAmount = "min_amount" in node.config
        ? node.config.min_amount
        : null;
      if (typeof minAmount === "number" && minAmount < 0) {
        issues.push({
          code: "payment_collection_min_amount_invalid",
          message: "收款节点最低金额不能为负数",
          nodeKey: node.node_key,
        });
      }
      const financeReviewerId = "finance_reviewer_employee_id" in node.config
        ? node.config.finance_reviewer_employee_id
        : null;
      if (!financeReviewerId) {
        issues.push({
          code: "payment_collection_finance_reviewer_required",
          message: "收款节点必须选择财务审核人",
          nodeKey: node.node_key,
        });
      }
    }
    const configReferences = [
      ["rollback_target_key", node.config.rollback_target_key],
      [
        "reject_target_key",
        "reject_target_key" in node.config ? node.config.reject_target_key : null,
      ],
    ] as const;
    for (const [field, value] of configReferences) {
      if (typeof value === "string" && value.trim() && !allNodeKeys.has(value)) {
        issues.push({
          code: "config_reference_missing",
          message: `${field} 指向的节点不存在：${value}`,
          nodeKey: node.node_key,
        });
      }
    }
  });

  const startCount = graph.nodes.filter((node) => node.node_type === "start").length;
  if (startCount !== 1) {
    issues.push({
      code: "start_exactly_one",
      message: "发布前需要且只能有一个开始节点",
    });
  }
  if (!graph.nodes.some((node) => node.node_type === "end")) {
    issues.push({ code: "end_required", message: "发布前需要一个结束节点" });
  }
  graph.edges.forEach((edge) => {
    if (!nodeIds.has(edge.source_node_id)) {
      issues.push({ code: "edge_source_missing", message: "连线来源节点不存在" });
    }
    if (!nodeIds.has(edge.target_node_id)) {
      issues.push({ code: "edge_target_missing", message: "连线目标节点不存在" });
    }
    if (edge.source_node_id === edge.target_node_id) {
      issues.push({ code: "edge_self_loop", message: "连线不能指向自身" });
    }
  });
  graph.nodes.forEach((node) => {
    if (node.node_type !== "end" && !outgoingNodeIds.has(node.id)) {
      issues.push({
        code: "node_outgoing_required",
        message: "非结束节点需要至少一条出边",
        nodeKey: node.node_key,
      });
    }
  });

  return { valid: issues.length === 0, issues };
}
