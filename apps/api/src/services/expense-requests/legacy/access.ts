import {
  Errors,
  expenseRequestRepository,
  accessPolicyService,
  expenseRequestCategoryService,
  resolveStoredFileUrl,
  resolveStoredFileUrlList,
  ProjectStatusConfig,
  isProjectStatus,
  approvalChainStepConfigs,
  approvalStepPermissionMap,
  scopeWeight,
  calculateTotalAmount,
  buildLegacyFields,
  generateExpenseRequestNo,
  normalizeRelationName,
  normalizeRelationValue,
  normalizeTenantDepartmentName,
  sameDepartmentScope,
  normalizeScope,
  resolveAvatarRelation,
  resolveEvidenceImagesRelation,
  resolveApprovalChainRelations,
  dedupeApprovalRecords,
  type AuthContext,
  type ApproveExpenseRequestInput,
  type CancelExpenseRequestInput,
  type CreateExpenseRequestInput,
  type ExpenseApprovalCandidateQueryType,
  type ExpenseApprovalChainItemInput,
  type ExpenseApprovalTemplateQueryType,
  type ExpenseRequestListQueryType,
  type ExpenseRequestProjectCandidateQueryType,
  type ExpenseRequestItemInput,
  type PayExpenseRequestInput,
  type RejectExpenseRequestInput,
  type SubmitExpenseRequestInput,
  type UpdateExpenseRequestInput,
  type ExpenseApprovalCandidateEmployee,
  type ExpenseApprovalChainPayload,
  type ExpenseApprovalChainRecord,
  type ExpenseProjectCandidateRow,
  type ExpenseRequestRecord,
  type ExpenseRequestVisibilityFilter,
  type ExpenseRequestOperationPermission,
  type ExpenseRequestAccessScope,
  type ApprovalChainStep,
  type ResolvedExpenseRequestItemInput,
  type ExpenseApprovalRecordLike,
} from './shared';

export async function assertCanReadExpenseRequest(this: any, 
    authContext: AuthContext,
    record: { employee_id: string; assignee_id: string | null },
  ) {
    const visibility = await accessPolicyService.getVisibleExpenseFilters(
      authContext,
      "expense_request.read",
    );

    if (visibility.type === "all") {
      return;
    }

    if (visibility.type === "none") {
      throw Errors.forbidden();
    }

    const employeeIds = visibility.employeeIds;
    if (visibility.type === "self") {
      if (!employeeIds.includes(record.employee_id)) {
        throw Errors.forbidden();
      }
      return;
    }

    if (
      employeeIds.includes(record.employee_id) ||
      (record.assignee_id ? employeeIds.includes(record.assignee_id) : false)
    ) {
      return;
    }

    throw Errors.forbidden();
  }

export function canAccessByVisibility(this: any, 
    visibility: ExpenseRequestVisibilityFilter,
    record: { employee_id: string; assignee_id: string | null },
  ) {
    if (visibility.type === "all") {
      return true;
    }

    if (visibility.type === "none") {
      return false;
    }

    if (visibility.type === "self") {
      return visibility.employeeIds.includes(record.employee_id);
    }

    return (
      visibility.employeeIds.includes(record.employee_id) ||
      (record.assignee_id ? visibility.employeeIds.includes(record.assignee_id) : false)
    );
  }

export async function getVisibilityForPermission(this: any, 
    authContext: AuthContext,
    permissionCode: ExpenseRequestOperationPermission | "expense_request.read",
  ): Promise<ExpenseRequestVisibilityFilter> {
    if (!accessPolicyService.hasPermission(authContext, permissionCode)) {
      return {
        type: "none",
        employeeIds: [],
      };
    }

    return accessPolicyService.getVisibleExpenseFilters(authContext, permissionCode);
  }

export async function assertCanOperateExpenseRequest(this: any, 
    authContext: AuthContext,
    record: { employee_id: string; assignee_id: string | null },
    permissionCode: ExpenseRequestOperationPermission,
    message: string,
  ) {
    const visibility = await this.getVisibilityForPermission(
      authContext,
      permissionCode,
    );

    if (!this.canAccessByVisibility(visibility, record)) {
      throw Errors.business(403, message, "FORBIDDEN");
    }
  }

export function getProcessPermissionForQuery(this: any, _params: ExpenseRequestListQueryType) {
    return null;
  }

export function mergeScope(this: any, existing: string | null, incoming: string | null) {
    const normalizedExisting = existing ? normalizeScope(existing) : null;
    const normalizedIncoming = normalizeScope(incoming);
    if (!normalizedExisting) {
      return normalizedIncoming;
    }

    return scopeWeight[normalizedIncoming] > scopeWeight[normalizedExisting]
      ? normalizedIncoming
      : normalizedExisting;
  }

export function buildCandidateScopeMap(this: any, 
    rows: Array<{
      employee_id: string;
      role_scope: string | null;
      override_effect: string | null;
      override_scope: string | null;
    }>,
  ) {
    const map = new Map<string, string>();

    for (const row of rows) {
      if (row.override_effect === "deny") {
        map.delete(row.employee_id);
        continue;
      }

      if (row.override_effect === "allow") {
        map.set(
          row.employee_id,
          this.mergeScope(map.get(row.employee_id) ?? null, row.override_scope),
        );
        continue;
      }

      if (row.role_scope) {
        map.set(
          row.employee_id,
          this.mergeScope(map.get(row.employee_id) ?? null, row.role_scope),
        );
      }
    }

    return map;
  }

export function scopeCoversApplicant(this: any, input: {
    scope: string | null;
    candidate: ExpenseApprovalCandidateEmployee;
    applicant: {
      id: string;
      tenant_department_id?: string | null;
    };
  }) {
    const scope = normalizeScope(input.scope);
    if (scope === "all") {
      return true;
    }

    if (scope === "department") {
      return sameDepartmentScope(input.applicant, input.candidate);
    }

    return input.candidate.id === input.applicant.id;
  }
