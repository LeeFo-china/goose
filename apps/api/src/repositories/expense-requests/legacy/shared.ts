import { Errors } from "@/errors/error-factory";
import type {
  ExpenseRequestListQueryType,
  ExpenseRequestProjectCandidateQueryType,
} from "@/schema/expense-requests";
import { SupabaseDB } from "@/utils/supabase/index";

export type ExpenseRequestItemMutationInput = {
  id?: string;
  occurred_at?: string | null;
  category_code?: string | null;
  category: string;
  category_remark?: string | null;
  amount: number;
  remark?: string | null;
  invoice_no?: string | null;
  vendor_name?: string | null;
  evidence_images?: string[];
};

export type ExpenseRequestRecord = {
  id: string;
  tenant_id: string | null;
  request_no: string | null;
  employee_id: string;
  project_id: string | null;
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
  employee?: unknown;
  project?: unknown;
  assignee?: unknown;
  items?: unknown;
  approvals?: unknown;
  settlement?: unknown;
};

export type ExpenseRequestMutationPayload = {
  tenant_id?: string | null;
  employee_id?: string;
  project_id?: string | null;
  mode?: string;
  title?: string | null;
  request_no?: string;
  total_amount?: number;
  status?: string;
  submitted_at?: string | null;
  approved_at?: string | null;
  rejected_at?: string | null;
  cancelled_at?: string | null;
  completed_at?: string | null;
  assignee_id?: string | null;
  rejected_reason?: string | null;
  amount?: number;
  category?: string | null;
  reason?: string | null;
  evidence_images?: string[];
};

export type ExpenseRequestApprovalPayload = {
  tenant_id?: string | null;
  expense_request_id: string;
  approval_round?: number;
  step: string;
  action: string;
  approver_id?: string | null;
  comment?: string | null;
};

export type ExpenseRequestSettlementPayload = {
  tenant_id?: string | null;
  expense_request_id: string;
  payee_name: string;
  payee_bank?: string | null;
  payee_account?: string | null;
  method: string;
  paid_amount: number;
  paid_at: string;
  paid_by: string;
  evidence_images: string[];
  remark?: string | null;
};

export type ExpenseApprovalCandidateEmployee = {
  id: string;
  name: string | null;
  phone: string | null;
  avatar: string | null;
  status: string | null;
  tenant_department_id: string | null;
  post_id: string | null;
  tenant_department?: unknown;
  post?: unknown;
};

export type ExpenseProjectCandidateRow = {
  id: string;
  name: string | null;
  status: string | null;
  signed_amount: number | null;
  address: string | null;
  customer?: {
    name?: string | null;
  } | Array<{
    name?: string | null;
  }> | null;
  property?: {
    community?: string | null;
    building_info?: string | null;
  } | Array<{
    community?: string | null;
    building_info?: string | null;
  }> | null;
};

export type ExpenseRequestVisibilityFilter =
  | { type: "all"; employeeIds: string[] }
  | { type: "none"; employeeIds: string[] }
  | { type: "self"; employeeIds: string[] }
  | { type: "assigned"; employeeIds: string[] }
  | { type: "department"; employeeIds: string[] };

export { Errors, SupabaseDB };
export type {
  ExpenseRequestListQueryType,
  ExpenseRequestProjectCandidateQueryType,
};
