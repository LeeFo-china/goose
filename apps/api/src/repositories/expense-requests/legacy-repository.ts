import {
  findById,
  employeeExists,
  projectExists,
  listProjectCandidates,
} from "./legacy/base";
import { create, update, replaceItems } from "./legacy/mutations";
import {
  appendApproval,
  findApprovalByBusinessKey,
  findEmployeeForApproval,
  listEmployeesForApprovalCandidates,
  listEmployeePermissionContexts,
} from "./legacy/approvals";
import {
  createSettlement,
  findSettlementByExpenseRequest,
  hasSettlement,
} from "./legacy/settlements";
import { list, listStatsRows } from "./legacy/lists";

export type {
  ExpenseApprovalCandidateEmployee,
  ExpenseProjectCandidateRow,
  ExpenseRequestMutationPayload,
  ExpenseRequestRecord,
} from "./legacy/shared";

class ExpenseRequestRepository {
  private summarySelect = `
    *,
    employee:employees!expense_requests_employee_id_fkey(id, name, phone, status),
    project:projects(id, name, status, signed_amount, customer_id),
    cost_category:finance_cost_categories!expense_requests_cost_category_id_fkey(id, code, name, status),
    assignee:employees!expense_requests_assignee_id_fkey(id, name, phone, status),
    settlement:expense_request_settlements(
      id,
      method,
      paid_amount,
      paid_at,
      paid_by
    )
  `;

  private detailSelect = `
    *,
    employee:employees!expense_requests_employee_id_fkey(id, name, phone, status),
    project:projects(id, name, status, signed_amount, customer_id),
    cost_category:finance_cost_categories!expense_requests_cost_category_id_fkey(id, code, name, status),
    assignee:employees!expense_requests_assignee_id_fkey(id, name, phone, status),
    items:expense_request_items(
      id,
      occurred_at,
      category_code,
      category,
      category_remark,
      amount,
      remark,
      invoice_no,
      vendor_name,
      evidence_images,
      created_at,
      updated_at
    ),
    approvals:expense_request_approvals(
      id,
      step,
      action,
      approval_round,
      approver_id,
      comment,
      created_at,
      approver:employees!expense_request_approvals_approver_id_fkey(
        id,
        name,
        phone,
        status
      )
    ),
    settlement:expense_request_settlements(
      id,
      payee_name,
      payee_bank,
      payee_account,
      method,
      paid_amount,
      paid_at,
      paid_by,
      evidence_images,
      remark,
      created_at,
      updated_at,
      paid_operator:employees!expense_request_settlements_paid_by_fkey(
        id,
        name,
        phone,
        status
      )
    )
  `;
  findById = findById;
  employeeExists = employeeExists;
  projectExists = projectExists;
  listProjectCandidates = listProjectCandidates;
  create = create;
  update = update;
  replaceItems = replaceItems;
  appendApproval = appendApproval;
  findApprovalByBusinessKey = findApprovalByBusinessKey;
  findEmployeeForApproval = findEmployeeForApproval;
  listEmployeesForApprovalCandidates = listEmployeesForApprovalCandidates;
  listEmployeePermissionContexts = listEmployeePermissionContexts;
  createSettlement = createSettlement;
  findSettlementByExpenseRequest = findSettlementByExpenseRequest;
  hasSettlement = hasSettlement;
  list = list;
  listStatsRows = listStatsRows;
}

export const expenseRequestRepository = new ExpenseRequestRepository();
