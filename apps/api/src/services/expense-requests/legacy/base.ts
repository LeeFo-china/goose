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
  type ExpenseRequestTodoQueryType,
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

export function requireTenantId(this: any, authContext: AuthContext) {
    return accessPolicyService.assertTenantContext(authContext);
  }

export function serializeExpenseRequest<T extends ExpenseRequestRecord | null>(this: any, record: T): T {
    if (!record) {
      return record;
    }

    const row = record as ExpenseRequestRecord & Record<string, unknown>;
    const serialized: Record<string, unknown> = { ...record };

    if ("evidence_images" in row) {
      serialized.evidence_images = resolveStoredFileUrlList(row.evidence_images);
    }
    if ("items" in row) {
      serialized.items = resolveEvidenceImagesRelation(row.items);
    }
    if ("settlement" in row) {
      serialized.settlement = resolveEvidenceImagesRelation(row.settlement);
    }
    if ("approvals" in row) {
      serialized.approvals = dedupeApprovalRecords(row.approvals);
    }
    if ("employee" in row) {
      serialized.employee = resolveAvatarRelation(row.employee);
    }
    if ("assignee" in row) {
      serialized.assignee = resolveAvatarRelation(row.assignee);
    }
    if ("approval_chain" in row) {
      serialized.approval_chain = resolveApprovalChainRelations(row.approval_chain);
    }

    return serialized as T;
  }

export async function resolveItems(this: any, 
    items: ExpenseRequestItemInput[],
    tenantId?: string | null,
  ): Promise<ResolvedExpenseRequestItemInput[]> {
    return Promise.all(
      items.map(async (item) => {
        const categoryCode = item.category_code?.trim() || null;
        if (categoryCode) {
          const category =
            await expenseRequestCategoryService.resolveActiveCategoryByCode(
              categoryCode,
              tenantId,
            );

          return {
            ...item,
            category: category.name,
            category_code: category.code,
            category_remark: item.category_remark?.trim() || null,
          };
        }

        const categoryName = item.category?.trim();
        if (!categoryName) {
          throw Errors.badRequest("费用分类不能为空");
        }

        return {
          ...item,
          category: categoryName,
          category_code: null,
          category_remark: item.category_remark?.trim() || null,
        };
      }),
    );
  }

export function ensureCurrentEmployee(this: any, 
    authContext: AuthContext,
    employeeId: string,
    permissionCode:
      | "expense_request.create"
      | "expense_request.submit"
      | "expense_request.approve_manager"
      | "expense_request.approve_finance"
      | "expense_request.pay",
  ) {
    const scope = accessPolicyService.assertPermission(authContext, permissionCode);
    if (scope === "all") {
      return;
    }

    if (!authContext.employeeId || authContext.employeeId !== employeeId) {
      throw Errors.forbidden();
    }
  }

export async function getLatestExpenseRequest(this: any, id: string, tenantId?: string | null) {
    return this.serializeExpenseRequest(
      await expenseRequestRepository.findById(id, tenantId),
    );
  }

export async function assertEmployeeExists(this: any, 
    id: string,
    tenantId?: string | null,
    message = "员工不存在",
  ) {
    if (!(await expenseRequestRepository.employeeExists(id, tenantId))) {
      throw Errors.badRequest(message);
    }
  }

export async function assertProjectExists(this: any, 
    id: string | null | undefined,
    tenantId?: string | null,
  ) {
    if (!id) {
      return;
    }

    if (!(await expenseRequestRepository.projectExists(id, tenantId))) {
      throw Errors.business(404, "关联项目不存在", "PROJECT_NOT_FOUND");
    }
  }

export async function assertCanLinkProject(this: any, 
    authContext: AuthContext,
    id: string | null | undefined,
  ) {
    if (!id) {
      return;
    }

    const tenantId = this.requireTenantId(authContext);
    await this.assertProjectExists(id, tenantId);
    const hasAccess = await accessPolicyService.canAccessProject(
      authContext,
      id,
      "project.read",
    );
    if (!hasAccess) {
      throw Errors.business(403, "无权关联该项目", "PROJECT_ACCESS_DENIED");
    }
  }
