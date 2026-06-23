import type { WorkflowNodeType } from "@gooes/domain";
import { getWorkflowNodePreset } from "@/components/workflows/workflow-node-presets";
import {
  getWorkflowProcedureStageLabel,
  isWorkflowProcedureStageKey,
} from "@/components/workflows/workflow-procedure-stages";
import { getWorkflowEdgeConditionSignature } from "@/components/workflows/workflow-edge-conditions";
import {
  findWorkflowBusinessTrackIssues,
} from "@/components/workflows/workflow-business-track";
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
      requirement_mode: "any_confirmed",
      required_percentage: null,
      block_message: null,
      finance_reviewer_employee_id: null,
    };
  }
  if (nodeType === "procedure") {
    return {
      stage_key: "",
      require_log: false,
      min_image_count: 0,
      require_procedure_assignment: true,
      default_duration_days: 1,
      allow_duration_override: true,
      candidate_department_codes: [],
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
    config: omitObsoleteWorkflowNodeConfig(node.config),
    sort_order: node.sort_order,
  };
}

function omitObsoleteWorkflowNodeConfig(config: WorkflowNodeConfig): WorkflowNodeConfig {
  const nextConfig: Record<string, unknown> = { ...config };
  delete nextConfig.branch_node_position;
  return nextConfig as WorkflowNodeConfig;
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
  const incomingNodeIds = new Set<string>();
  const outgoingTargetIdsBySourceId = new Map<string, string[]>();
  const outgoingEdgesBySourceId = new Map<string, WorkflowEdge[]>();

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
      const requirementMode = "requirement_mode" in node.config
        ? node.config.requirement_mode
        : "any_confirmed";
      if (
        requirementMode !== "any_confirmed" &&
        requirementMode !== "signed_amount_percentage"
      ) {
        issues.push({
          code: "payment_collection_requirement_mode_invalid",
          message: "收款节点必须选择有效的收款放行规则",
          nodeKey: node.node_key,
        });
      }
      const requiredPercentage = "required_percentage" in node.config
        ? node.config.required_percentage
        : null;
      if (
        requirementMode === "signed_amount_percentage" &&
        (
          typeof requiredPercentage !== "number" ||
          requiredPercentage <= 0 ||
          requiredPercentage > 100
        )
      ) {
        issues.push({
          code: "payment_collection_required_percentage_invalid",
          message: "按签约金额比例校验时，比例必须大于 0 且不超过 100",
          nodeKey: node.node_key,
        });
      }
      const minAmount = "min_amount" in node.config
        ? node.config.min_amount
        : null;
      if (typeof minAmount === "number" && minAmount < 0) {
        issues.push({
          code: "payment_collection_min_amount_invalid",
          message: "历史固定收款金额不能为负数",
          nodeKey: node.node_key,
        });
      }
      const financeReviewerId = "finance_reviewer_employee_id" in node.config
        ? node.config.finance_reviewer_employee_id
        : null;
      const requiredPermissions = Array.isArray(node.config.required_permissions)
        ? node.config.required_permissions
        : [];
      const hasFinancePermission = requiredPermissions.some((permission) =>
        typeof permission === "string" && permission.startsWith("finance.")
      );
      if (!financeReviewerId && !hasFinancePermission) {
        issues.push({
          code: "payment_collection_finance_reviewer_required",
          message: "收款节点必须选择财务审核人或配置财务确认权限",
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
    outgoingEdgesBySourceId.set(edge.source_node_id, [
      ...(outgoingEdgesBySourceId.get(edge.source_node_id) || []),
      edge,
    ]);
    const sourceExists = nodeIds.has(edge.source_node_id);
    const targetExists = nodeIds.has(edge.target_node_id);
    if (!sourceExists) {
      issues.push({ code: "edge_source_missing", message: "连线来源节点不存在" });
    }
    if (!targetExists) {
      issues.push({ code: "edge_target_missing", message: "连线目标节点不存在" });
    }
    if (edge.source_node_id === edge.target_node_id) {
      issues.push({ code: "edge_self_loop", message: "连线不能指向自身" });
    }
    if (
      sourceExists &&
      targetExists &&
      edge.source_node_id !== edge.target_node_id
    ) {
      incomingNodeIds.add(edge.target_node_id);
      outgoingTargetIdsBySourceId.set(edge.source_node_id, [
        ...(outgoingTargetIdsBySourceId.get(edge.source_node_id) ?? []),
        edge.target_node_id,
      ]);
    }
  });
  outgoingEdgesBySourceId.forEach((sourceEdges, sourceNodeId) => {
    if (sourceEdges.length <= 1) return;
    const sourceNode = graph.nodes.find((node) => node.id === sourceNodeId);
    const alwaysEdges = sourceEdges.filter((edge) => edge.condition.operator === "always");
    if (alwaysEdges.length === sourceEdges.length) {
      issues.push({
        code: "edge_branch_condition_required",
        message: "多条出边必须配置分支条件",
        nodeKey: sourceNode?.node_key,
      });
    }
    if (alwaysEdges.length > 1) {
      issues.push({
        code: "edge_branch_default_duplicate",
        message: "同一节点最多只能有一条默认分支",
        nodeKey: sourceNode?.node_key,
      });
    }
    const signatures = new Set<string>();
    for (const edge of sourceEdges) {
      if (edge.condition.operator === "always") continue;
      const signature = getWorkflowEdgeConditionSignature(edge.condition);
      if (signatures.has(signature)) {
        issues.push({
          code: "edge_branch_condition_duplicate",
          message: "同一节点不能配置重复分支条件",
          nodeKey: sourceNode?.node_key,
        });
        break;
      }
      signatures.add(signature);
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
    if (node.node_type !== "start" && !incomingNodeIds.has(node.id)) {
      issues.push({
        code: "node_incoming_required",
        message: "非开始节点需要至少一条入边",
        nodeKey: node.node_key,
      });
    }
  });
  const startNode = graph.nodes.find((node) => node.node_type === "start") ?? null;
  if (startNode) {
    const reachableNodeIds = findReachableNodeIds(
      startNode.id,
      outgoingTargetIdsBySourceId,
    );
    graph.nodes.forEach((node) => {
      if (reachableNodeIds.has(node.id)) return;
      issues.push({
        code: "node_unreachable_from_start",
        message: "节点必须能从开始节点到达",
        nodeKey: node.node_key,
      });
    });
    const endReachable = graph.nodes.some((node) =>
      node.node_type === "end" && reachableNodeIds.has(node.id)
    );
    if (!endReachable) {
      issues.push({
        code: "end_unreachable_from_start",
        message: "开始节点必须能连到结束节点",
      });
    }
  }
  issues.push(...findWorkflowBusinessTrackIssues(graph));

  return { valid: issues.length === 0, issues };
}

function findReachableNodeIds(
  startNodeId: string,
  outgoingTargetIdsBySourceId: Map<string, string[]>,
) {
  const reachableNodeIds = new Set<string>();
  const pendingNodeIds = [startNodeId];

  while (pendingNodeIds.length > 0) {
    const nodeId = pendingNodeIds.pop();
    if (!nodeId || reachableNodeIds.has(nodeId)) continue;
    reachableNodeIds.add(nodeId);

    for (const targetNodeId of outgoingTargetIdsBySourceId.get(nodeId) ?? []) {
      if (!reachableNodeIds.has(targetNodeId)) {
        pendingNodeIds.push(targetNodeId);
      }
    }
  }

  return reachableNodeIds;
}
