import type { BackfillSubjectType } from "./plan";

export type CliOptions = {
  tenantId: string;
  apply: boolean;
  reportPath: string;
};

export type WorkflowDefinitionRow = {
  id: string;
  workflow_key: string;
  status: string;
  active_version_id: string | null;
};

export type WorkflowVersionRow = {
  id: string;
  definition_id: string;
  snapshot: unknown;
};

export type LegacySubjectRow = {
  id: string;
  tenant_id: string;
  subject_type: BackfillSubjectType;
  status: string | null;
  current_step: string | null;
  actor_employee_id: string | null;
  assignee_employee_id: string | null;
  context: Record<string, unknown>;
  created_at: string | null;
  updated_at: string | null;
};

export type ExistingInstanceRow = {
  id: string;
  subject_id: string;
  status: string;
};

export type BackfillResult = {
  subject_type: BackfillSubjectType;
  subject_id: string;
  legacy_status: string | null;
  legacy_step: string | null;
  workflow_key: string;
  node_key: string | null;
  action: "create" | "dry_run_create" | "skip" | "failed";
  reason: string;
  instance_id: string;
  task_created: boolean;
};

export type WorkflowBinding = {
  workflowKey: string;
  definition: WorkflowDefinitionRow;
  version: WorkflowVersionRow;
};

export const SUBJECT_WORKFLOW_KEY: Record<BackfillSubjectType, string> = {
  customer: "customer_main",
  project: "construction_main",
  expense_request: "expense_approval",
};

export const PAGE_SIZE = 100;
