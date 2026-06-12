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

export function getProjectStatusName(this: any, status: string | null | undefined) {
    return isProjectStatus(status) ? ProjectStatusConfig[status].label : null;
  }

export function buildProjectCandidateAddress(this: any, row: ExpenseProjectCandidateRow) {
    if (row.address) {
      return row.address;
    }

    const property = normalizeRelationValue<{
      community?: string | null;
      building_info?: string | null;
    }>(row.property);
    return [property?.community, property?.building_info]
      .filter((item): item is string => Boolean(item))
      .join(" ") || null;
  }

export function serializeProjectCandidate(this: any, row: ExpenseProjectCandidateRow) {
    const customer = normalizeRelationValue<{ name?: string | null }>(row.customer);
    return {
      id: row.id,
      name: row.name,
      status: row.status,
      status_name: this.getProjectStatusName(row.status),
      customer_name: customer?.name ?? null,
      address: this.buildProjectCandidateAddress(row),
      signed_amount: row.signed_amount,
    };
  }

export function filterProjectCandidatesByKeyword(this: any, 
    rows: ExpenseProjectCandidateRow[],
    keyword?: string,
  ) {
    const normalizedKeyword = keyword?.trim().toLowerCase();
    if (!normalizedKeyword) {
      return rows;
    }

    return rows.filter((row) => {
      const item = this.serializeProjectCandidate(row);
      return [
        item.name,
        item.customer_name,
        item.address,
      ].some((value) => value?.toLowerCase().includes(normalizedKeyword));
    });
  }

export function getApprovalTemplate(this: any, _params: ExpenseApprovalTemplateQueryType) {
    return {
      list: approvalChainStepConfigs.map((item) => ({
        step: item.step,
        step_name: item.step_name,
        required: true,
        sort_order: item.sort_order,
        required_permission: item.required_permission,
        description: item.description,
      })),
    };
  }

export async function listApprovalCandidates(this: any, 
    authContext: AuthContext,
    params: ExpenseApprovalCandidateQueryType,
  ) {
    const permissionCode = approvalStepPermissionMap[params.step];
    if (!permissionCode) {
      throw Errors.badRequest("无效的审批节点");
    }

    const applicantId = params.applicant_employee_id ?? authContext.employeeId;
    if (!applicantId) {
      throw Errors.badRequest("缺少申请人");
    }

    const tenantId = this.requireTenantId(authContext);
    const applicant = await this.getApplicantEmployee(applicantId, tenantId);
    const candidates = await expenseRequestRepository.listEmployeesForApprovalCandidates({
      keyword: params.keyword,
      tenantId,
    });
    const permissionRows = await expenseRequestRepository.listEmployeePermissionContexts(
      candidates.map((item) => item.id),
      permissionCode,
    );
    const scopeMap = this.buildCandidateScopeMap(permissionRows);
    const filtered = candidates
      .filter((candidate) => candidate.id !== applicant.id)
      .filter((candidate) => {
        if (
          params.department_id &&
          candidate.tenant_department_id !== params.department_id
        ) {
          return false;
        }

        const scope = scopeMap.get(candidate.id) ?? null;
        return Boolean(scope) &&
          this.scopeCoversApplicant({
            scope,
            candidate,
            applicant,
          });
      });
    const total = filtered.length;
    const from = (params.page - 1) * params.pageSize;
    const paged = filtered.slice(from, from + params.pageSize);

    return {
      list: paged.map((item) => ({
        id: item.id,
        name: item.name,
        phone: item.phone,
        avatar: resolveStoredFileUrl(item.avatar),
        department_id: null,
        tenant_department_id: item.tenant_department_id,
        department_name: normalizeTenantDepartmentName(item.tenant_department),
        post_name: normalizeRelationName(item.post),
        matched_permission: permissionCode,
        matched_scope: scopeMap.get(item.id) ?? null,
      })),
      pagination: {
        page: params.page,
        pageSize: params.pageSize,
        total,
        totalPages: total ? Math.ceil(total / params.pageSize) : 0,
      },
    };
  }

export async function listProjectCandidates(this: any, 
    authContext: AuthContext,
    params: ExpenseRequestProjectCandidateQueryType,
  ) {
    const tenantId = this.requireTenantId(authContext);
    if (
      params.employee_id &&
      authContext.employeeId &&
      params.employee_id !== authContext.employeeId
    ) {
      accessPolicyService.assertPermission(authContext, "expense_request.read");
    }

    const visibleProjectIds = await accessPolicyService.getVisibleProjectIds(
      authContext,
      "project.read",
    );
    const rows = await expenseRequestRepository.listProjectCandidates({
      params,
      visibleProjectIds,
      tenantId,
    });
    const filtered = this.filterProjectCandidatesByKeyword(rows, params.keyword);
    const from = (params.page - 1) * params.pageSize;
    const list = filtered
      .slice(from, from + params.pageSize)
      .map((item: ExpenseProjectCandidateRow) => this.serializeProjectCandidate(item));

    return {
      list,
      pagination: {
        page: params.page,
        pageSize: params.pageSize,
        total: filtered.length,
        totalPages: filtered.length ? Math.ceil(filtered.length / params.pageSize) : 0,
      },
    };
  }
