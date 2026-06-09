import type {
  WorkflowDefinition,
  WorkflowEdge,
  WorkflowNode,
} from "@/components/workflows/workflow-types";

export type WorkflowDesignerGraph = {
  definition: WorkflowDefinition;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
};

export type WorkflowValidationIssue = {
  code: string;
  message: string;
  nodeKey?: string;
};

export type WorkflowValidationResult = {
  valid: boolean;
  issues: WorkflowValidationIssue[];
};
