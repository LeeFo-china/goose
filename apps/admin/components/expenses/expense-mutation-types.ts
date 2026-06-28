export type Person = {
  id?: string | null;
  name?: string | null;
  phone?: string | null;
  status?: string | null;
};

export type Project = {
  id?: string | null;
  name?: string | null;
  status?: string | null;
  signed_amount?: number | string | null;
  customer_id?: string | null;
  customer?: {
    name?: string | null;
    phone?: string | null;
  } | Array<{
    name?: string | null;
    phone?: string | null;
  }> | null;
  property?: {
    community?: string | null;
    building_info?: string | null;
  } | Array<{
    community?: string | null;
    building_info?: string | null;
  }> | null;
};

export type CostCategory = {
  id?: string | null;
  code?: string | null;
  name?: string | null;
  status?: string | null;
};

export type ExpenseItem = {
  id: string;
  occurred_at: string | null;
  category_code: string | null;
  category: string | null;
  category_name?: string | null;
  category_remark?: string | null;
  amount: number;
  remark: string | null;
  invoice_no: string | null;
  vendor_name: string | null;
  evidence_images?: string[];
};

export type ApprovalRecord = {
  id: string;
  step: string;
  action: string;
  approver_id: string | null;
  comment: string | null;
  created_at: string | null;
  approver?: Person | Person[] | null;
};

export type SettlementRecord = {
  id: string;
  payee_name?: string | null;
  payee_bank?: string | null;
  payee_account?: string | null;
  method: string;
  paid_amount: number;
  paid_at: string | null;
  remark?: string | null;
  evidence_images?: string[];
  paid_operator?: Person | Person[] | null;
};

export type ExpenseWorkflowAction = {
  key: string;
  label: string;
  business_domain: string | null;
  business_action: string | null;
  requires_reason: boolean;
  task_id?: string;
  node_key?: string;
  node_type?: string;
  disabled?: boolean;
  output_fields?: Array<{
    name: string;
    label: string;
    type: string;
    required: boolean;
  }>;
};

export type ExpenseWorkflowState = {
  subject_type?: string;
  subject_id?: string;
  instance_id?: string | null;
  instance_status?: string | null;
  current_node_key?: string | null;
  current_node_title?: string | null;
  current_business_kind?: string | null;
  pending_task_count?: number;
  updated_at?: string | null;
  actions?: ExpenseWorkflowAction[];
};

export type ExpenseRecord = {
  id: string;
  request_no: string | null;
  employee_id: string;
  project_id: string | null;
  cost_category_id: string | null;
  mode: string;
  title: string | null;
  total_amount: number;
  status: string;
  submitted_at: string | null;
  approved_at: string | null;
  rejected_at: string | null;
  cancelled_at: string | null;
  completed_at: string | null;
  assignee_id: string | null;
  rejected_reason: string | null;
  created_at: string | null;
  updated_at: string | null;
  employee?: Person | Person[] | null;
  project?: Project | Project[] | null;
  cost_category?: CostCategory | CostCategory[] | null;
  assignee?: Person | Person[] | null;
  items?: ExpenseItem[];
  approvals?: ApprovalRecord[];
  settlement?: SettlementRecord | SettlementRecord[] | null;
  workflow_state?: ExpenseWorkflowState | null;
};

export type DirectUploadInitResult = {
  provider: "tencent_cos";
  bucket: string;
  region: string | null;
  object_key: string;
  storage_path: string;
  upload_url: string;
  method?: "PUT";
  headers?: Record<string, string>;
  expires_in: number;
  expires_at: string;
};

export type DirectUploadCompleteResult = {
  url?: string;
  path?: string;
  provider?: string;
  object_key?: string;
  storage_path?: string;
};
