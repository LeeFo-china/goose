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

export function getWorkflowTrack(
  definition: Pick<WorkflowDefinition, "workflow_key">,
): WorkflowBusinessTrack {
  return getWorkflowDefinitionBusinessTrack(definition.workflow_key);
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
