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

export type ApprovalChainRecord = {
  id: string;
  step: string;
  step_name: string;
  sort_order: number;
  assignee_id: string;
  assignee_name_snapshot: string | null;
  required_permission: string;
  status: string;
  acted_by: string | null;
  acted_at: string | null;
  comment: string | null;
  assignee?: Person | Person[] | null;
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

export type ExpenseRecord = {
  id: string;
  request_no: string | null;
  employee_id: string;
  project_id: string | null;
  mode: string;
  title: string | null;
  total_amount: number;
  status: string;
  current_step: string;
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
  assignee?: Person | Person[] | null;
  items?: ExpenseItem[];
  approvals?: ApprovalRecord[];
  settlement?: SettlementRecord | SettlementRecord[] | null;
  approval_chain?: ApprovalChainRecord[];
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
