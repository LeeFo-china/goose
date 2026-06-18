import {
  getWorkflowDefinitionBusinessTrack,
  type WorkflowDefinitionBusinessTrack,
} from "@gooes/domain";
import {
  WORKFLOW_BUSINESS_FLOW_OPTIONS,
} from "@/components/workflows/workflow-business-flow-options";
import {
  WORKFLOW_FINANCE_KIND_OPTIONS,
} from "@/components/workflows/workflow-finance-node-options";
import {
  WORKFLOW_NODE_CAPABILITY_OPTIONS,
  type WorkflowNodeCapability,
} from "@/components/workflows/workflow-node-capabilities";
import {
  WorkflowNodePresets,
} from "@/components/workflows/workflow-node-presets";
import type { WorkflowDefinition } from "@/components/workflows/workflow-types";

export {
  findWorkflowBusinessTrackIssues,
} from "@/components/workflows/workflow-business-track-validation";

export type WorkflowBusinessTrack = WorkflowDefinitionBusinessTrack;

export type WorkflowRuntimeIntegrationHint = {
  badge: string;
  headerSummary: string;
  headline: string;
  detail: string;
  tooltip: string;
};

const STRICT_TRACK_PRESET_KEYS = new Set([
  "start",
  "workflow_step",
  "notification",
  "end",
]);

const TRACK_CAPABILITIES: Record<
  WorkflowBusinessTrack,
  readonly WorkflowNodeCapability[]
> = {
  customer_design: ["business", "approval", "notification"],
  project_signing: ["business", "finance", "approval", "notification"],
  construction: ["construction", "procedure", "finance", "approval", "notification"],
  generic: WORKFLOW_NODE_CAPABILITY_OPTIONS.map((option) => option.value),
};

const CUSTOMER_BUSINESS_KINDS = new Set([
  "customer_lead",
  "phone_follow_up",
  "store_visit",
  "design",
]);

const PROJECT_SIGNING_BUSINESS_KINDS = new Set([
  "design",
  "quote",
  "contract",
]);

const TRACK_RUNTIME_INTEGRATION_HINTS: Record<
  Exclude<WorkflowBusinessTrack, "generic">,
  WorkflowRuntimeIntegrationHint
> = {
  customer_design: {
    badge: "客户状态已接入",
    headerSummary: "关键节点同步客户状态",
    headline: "状态自动推进",
    detail: "跟进、到店、设计节点会同步到客户详情。",
    tooltip: "自动接入客户开始跟进、到店、设计状态动作",
  },
  project_signing: {
    badge: "项目状态已接入",
    headerSummary: "关键节点同步项目签约状态",
    headline: "签约状态自动推进",
    detail: "设计、方案确认、签约、定稿、排期开工节点会同步到项目详情。",
    tooltip: "自动接入项目设计、方案确认、签约、设计定稿、排期开工状态动作",
  },
  construction: {
    badge: "施工状态已接入",
    headerSummary: "关键节点同步施工状态",
    headline: "施工状态自动推进",
    detail: "开工、工序、收款、验收、交房节点会同步项目详情和施工阶段。",
    tooltip: "自动接入施工开工、工序日志、收款、竣工验收和交房动作",
  },
};

const EXPENSE_RUNTIME_INTEGRATION_HINT: WorkflowRuntimeIntegrationHint = {
  badge: "费用审批已接入",
  headerSummary: "关键节点同步费用审批状态",
  headline: "审批状态自动推进",
  detail: "主管审批、财务审批、登记打款节点会同步费用申请。",
  tooltip: "自动接入费用主管审批、财务审批、登记打款状态动作",
};

function isWorkflowKeyDerivedFrom(workflowKey: string, templateKey: string) {
  const normalized = workflowKey.trim().toLowerCase();
  return normalized === templateKey || normalized.startsWith(`${templateKey}_`);
}

export function getWorkflowTrack(
  definition: Pick<WorkflowDefinition, "workflow_key">,
): WorkflowBusinessTrack {
  return getWorkflowDefinitionBusinessTrack(definition.workflow_key);
}

export function getWorkflowRuntimeIntegrationHint(
  definition: Pick<WorkflowDefinition, "workflow_key">,
): WorkflowRuntimeIntegrationHint | null {
  if (isWorkflowKeyDerivedFrom(definition.workflow_key, "expense_approval")) {
    return EXPENSE_RUNTIME_INTEGRATION_HINT;
  }

  const track = getWorkflowTrack(definition);
  if (track === "generic") return null;
  return TRACK_RUNTIME_INTEGRATION_HINTS[track];
}

export function getWorkflowCapabilityOptionsForTrack(
  track: WorkflowBusinessTrack,
) {
  const allowed = new Set(TRACK_CAPABILITIES[track]);
  return WORKFLOW_NODE_CAPABILITY_OPTIONS.filter((option) =>
    allowed.has(option.value)
  );
}

export function getWorkflowBusinessFlowOptionsForTrack(
  track: WorkflowBusinessTrack,
) {
  if (track === "customer_design") {
    return WORKFLOW_BUSINESS_FLOW_OPTIONS.filter((option) =>
      CUSTOMER_BUSINESS_KINDS.has(option.value)
    );
  }

  if (track === "project_signing") {
    return WORKFLOW_BUSINESS_FLOW_OPTIONS.filter((option) =>
      PROJECT_SIGNING_BUSINESS_KINDS.has(option.value)
    );
  }

  if (track === "construction") {
    return [];
  }

  return WORKFLOW_BUSINESS_FLOW_OPTIONS;
}

export function getWorkflowFinanceKindOptionsForTrack(
  track: WorkflowBusinessTrack,
) {
  if (track === "project_signing" || track === "construction") {
    return WORKFLOW_FINANCE_KIND_OPTIONS.filter((option) =>
      option.value === "payment_collection"
    );
  }

  if (track === "customer_design") {
    return [];
  }

  return WORKFLOW_FINANCE_KIND_OPTIONS;
}

export function getWorkflowNodePresetsForTrack(track: WorkflowBusinessTrack) {
  if (track === "generic") return WorkflowNodePresets;
  return WorkflowNodePresets.filter((preset) =>
    STRICT_TRACK_PRESET_KEYS.has(preset.key)
  );
}
