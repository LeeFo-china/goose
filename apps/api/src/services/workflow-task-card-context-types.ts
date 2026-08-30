import type { WorkflowTaskActionPayload } from "@/services/workflow-task-actions";
import type { WorkflowTaskAssigneeMetadata } from "@/services/workflow-task-assignee";

export type WorkflowTaskTodoType =
  | "customer_followup"
  | "project_log"
  | "project_workflow"
  | "project_payment"
  | "expense_request"
  | "supplier_purchase_batch"
  | "project_acceptance"
  | "customer_service_ticket";

export type WorkflowTaskCardContext = {
  todo_type: WorkflowTaskTodoType;
  title: string;
  subtitle?: string | null;
  primary_meta?: string | null;
  secondary_meta?: string | null;
  amount_text?: string | null;
  people_text?: string | null;
  time_text?: string | null;
  target_url?: string | null;
  project?: {
    id: string;
    name: string;
    property_label?: string | null;
    address?: string | null;
    status_label?: string | null;
  } | null;
  customer?: {
    id: string;
    name?: string | null;
    phone?: string | null;
    status_label?: string | null;
  } | null;
  applicant?: {
    id: string;
    name: string;
  } | null;
  assignee?: {
    id?: string | null;
    name?: string | null;
    label?: string | null;
  } | null;
  business?: Record<string, unknown>;
};

export type WorkflowTaskCardContextTask = {
  id: string;
  instance_id: string;
  instance_node_id?: string | null;
  node_key: string;
  node_type?: string | null;
  title?: string | null;
  due_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  assignee_employee_id?: string | null;
  assignee_role_code?: string | null;
  assignee_permission_code?: string | null;
  instance?: {
    subject_type?: string | null;
    subject_id?: string | null;
    current_node_snapshot?: unknown;
  } | null;
};

export type WorkflowTaskCardContextItem = {
  task: WorkflowTaskCardContextTask;
  actions: Array<Partial<WorkflowTaskActionPayload>>;
  assignee: Partial<WorkflowTaskAssigneeMetadata>;
};

export type ReceivableContext = {
  receivable_plan_id: string;
  receivable_title: string;
  receivable_amount: number;
  receivable_paid_amount: number;
  receivable_remaining_amount: number;
  receivable_due_date: string;
  receivable_status: string;
  receivable_overdue_days?: number;
};
