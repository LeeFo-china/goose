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

export async function getExpenseRequestById(this: any, authContext: AuthContext, id: string) {
    const tenantId = this.requireTenantId(authContext);
    const data = await expenseRequestRepository.findById(id, tenantId);
    if (!data) {
      throw Errors.badRequest("费用申请不存在");
    }

    await this.assertCanReadExpenseRequest(authContext, data);

    return this.serializeExpenseRequest(data);
  }

export async function listExpenseRequests(this: any, 
    authContext: AuthContext,
    params: ExpenseRequestListQueryType,
  ) {
    const tenantId = this.requireTenantId(authContext);
    const processPermission = this.getProcessPermissionForQuery(params);
    const visibility = processPermission
      ? await this.getVisibilityForPermission(authContext, processPermission)
      : await accessPolicyService.getVisibleExpenseFilters(
        authContext,
        "expense_request.read",
      );
    const result = await expenseRequestRepository.list(
      processPermission
        ? {
          ...params,
          page: 1,
          pageSize: 10000,
        }
        : params,
      visibility,
      tenantId,
    );

    if (!processPermission) {
      return {
        ...result,
        list: result.list.map((item) => this.serializeExpenseRequest(item)),
      };
    }

    const rows = result.list.filter((item) => {
      const currentNode = this.getCurrentApprovalNode(item);
      if (!currentNode) {
        return true;
      }

      return currentNode.assignee_id === authContext.employeeId;
    });
    const from = (params.page - 1) * params.pageSize;
    const list = rows.slice(from, from + params.pageSize);

    return {
      list: list.map((item) => this.serializeExpenseRequest(item)),
      pagination: {
        page: params.page,
        pageSize: params.pageSize,
        total: rows.length,
        totalPages: rows.length ? Math.ceil(rows.length / params.pageSize) : 0,
      },
    };
  }

export async function getStatsSummary(this: any, 
    authContext: AuthContext,
    params: ExpenseRequestListQueryType,
  ) {
    const tenantId = this.requireTenantId(authContext);
    const visibility = await accessPolicyService.getVisibleExpenseFilters(
      authContext,
      "expense_request.read",
    );
    const rows = await expenseRequestRepository.listStatsRows(params, tenantId);
    const visibleRows = rows.filter((item) => this.canAccessByVisibility(
      visibility,
      item,
    ));
    const initialStatuses = [
      "draft",
      "pending",
      "approved",
      "rejected",
      "paid",
      "cancelled",
    ];
    const statusCounts = Object.fromEntries(
      initialStatuses.map((status) => [status, 0]),
    ) as Record<string, number>;
    const statusAmounts = Object.fromEntries(
      initialStatuses.map((status) => [status, 0]),
    ) as Record<string, number>;
    const modeCounts: Record<string, number> = {};
    let totalAmount = 0;

    for (const item of visibleRows) {
      const amount = Number(item.total_amount || 0);
      const normalizedAmount = Number.isFinite(amount) ? amount : 0;
      totalAmount += normalizedAmount;
      statusCounts[item.status] = (statusCounts[item.status] || 0) + 1;
      statusAmounts[item.status] = Number(
        ((statusAmounts[item.status] || 0) + normalizedAmount).toFixed(2),
      );
      modeCounts[item.mode] = (modeCounts[item.mode] || 0) + 1;
    }

    return {
      total_count: visibleRows.length,
      total_amount: Number(totalAmount.toFixed(2)),
      status_counts: statusCounts,
      status_amounts: statusAmounts,
      mode_counts: modeCounts,
      pending_count: statusCounts.pending || 0,
      approved_count: statusCounts.approved || 0,
      paid_count: statusCounts.paid || 0,
      rejected_count: statusCounts.rejected || 0,
      draft_count: statusCounts.draft || 0,
      cancelled_count: statusCounts.cancelled || 0,
    };
  }

export async function listTodoExpenseRequests(this: any, 
    authContext: AuthContext,
    params: ExpenseRequestTodoQueryType,
  ) {
    const tenantId = this.requireTenantId(authContext);
    const todoDefinitions = [
      {
        status: "pending",
        current_step: "manager_review",
        permissionCode: "expense_request.approve_manager" as const,
      },
      {
        status: "pending",
        current_step: "finance_review",
        permissionCode: "expense_request.approve_finance" as const,
      },
      {
        status: "approved",
        current_step: "payment",
        permissionCode: "expense_request.pay" as const,
      },
    ];
    const rowsById = new Map<string, Awaited<ReturnType<typeof expenseRequestRepository.list>>["list"][number]>();

    for (const definition of todoDefinitions) {
      if (params.status && params.status !== definition.status) {
        continue;
      }

      const visibility = await this.getVisibilityForPermission(
        authContext,
        definition.permissionCode,
      );
      if (visibility.type === "none") {
        continue;
      }

      const result = await expenseRequestRepository.list(
        {
          page: 1,
          pageSize: 10000,
          keyword: params.keyword,
          status: definition.status as ExpenseRequestListQueryType["status"],
          current_step:
            definition.current_step as ExpenseRequestListQueryType["current_step"],
        },
        visibility,
        tenantId,
      );

      for (const item of result.list) {
        const currentNode = this.getCurrentApprovalNode(item);
        if (
          currentNode &&
          definition.status === "pending" &&
          currentNode.assignee_id !== authContext.employeeId
        ) {
          continue;
        }

        rowsById.set(item.id, item);
      }
    }

    const rows = Array.from(rowsById.values()).sort((a, b) => {
      const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
      return timeB - timeA;
    });
    const from = (params.page - 1) * params.pageSize;
    const list = rows.slice(from, from + params.pageSize);

    return {
      list,
      pagination: {
        page: params.page,
        pageSize: params.pageSize,
        total: rows.length,
        totalPages: rows.length ? Math.ceil(rows.length / params.pageSize) : 0,
      },
    };
  }
