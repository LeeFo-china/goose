import {
  PROJECT_ACCEPTANCE_STAGE_LABELS,
  accessPolicyService,
  getPriorityLabel,
  taskCenterRepository,
  type AuthContext,
  type TaskCenterTodoItem,
} from "./shared";

export async function buildProjectAcceptanceTodos(authContext: AuthContext) {
  if (
    !authContext.employeeId ||
    !accessPolicyService.hasPermission(authContext, "project_acceptance.read")
  ) {
    return [] as TaskCenterTodoItem[];
  }

  const tenantId = accessPolicyService.assertTenantId(authContext);
  const rows = await taskCenterRepository.listProjectAcceptanceTodos(tenantId);
  const canManage = accessPolicyService.hasPermission(
    authContext,
    "project_acceptance.manage",
  );
  const canSubmit = accessPolicyService.hasPermission(
    authContext,
    "project_acceptance.submit",
  );
  const canReview = accessPolicyService.hasPermission(
    authContext,
    "project_acceptance.review",
  ) || accessPolicyService.hasPermission(authContext, "project_acceptance.reject");

  return rows.flatMap((item) => {
    const projectName = item.project?.name?.trim() || "项目";
    const stageLabel = PROJECT_ACCEPTANCE_STAGE_LABELS[
      item.stage_code as keyof typeof PROJECT_ACCEPTANCE_STAGE_LABELS
    ] || item.title || "工序验收";
    const subtitle = `${projectName} · ${stageLabel}`;

    if (
      item.status === "submitted" &&
      (
        canManage ||
        (canReview && (!item.reviewer_id || item.reviewer_id === authContext.employeeId))
      )
    ) {
      return [{
        id: `project_acceptance:${item.id}:review`,
        type: "project_acceptance" as const,
        title: "工序验收待复核",
        subtitle,
        status: "pending" as const,
        status_label: "待处理" as const,
        priority: "high" as const,
        priority_label: getPriorityLabel("high"),
        due_at: item.submitted_at || item.updated_at || item.created_at,
        created_at: item.created_at,
        action_label: "去复核",
        target_url: `/packageProjects/pages/acceptanceDetail/index?id=${item.id}&projectId=${item.project_id}&mode=view`,
        target_type: "project_acceptance" as const,
        target_id: item.id,
      }];
    }

    if (
      ["draft", "rejected"].includes(item.status) &&
      item.initiator_id === authContext.employeeId &&
      (canManage || canSubmit)
    ) {
      const isRejected = item.status === "rejected";
      const title = isRejected
        ? item.reject_source === "customer"
          ? "业主有疑问待整改"
          : "工序验收待整改"
        : "工序验收草稿待提交";

      return [{
        id: `project_acceptance:${item.id}:${isRejected ? "rectify" : "submit"}`,
        type: "project_acceptance" as const,
        title,
        subtitle,
        status: "pending" as const,
        status_label: "待处理" as const,
        priority: isRejected ? "high" as const : "medium" as const,
        priority_label: getPriorityLabel(isRejected ? "high" : "medium"),
        due_at: item.rejected_at || item.updated_at || item.created_at,
        created_at: item.created_at,
        action_label: isRejected ? "去整改" : "去提交",
        target_url: `/packageProjects/pages/acceptanceDetail/index?id=${item.id}&projectId=${item.project_id}&mode=edit`,
        target_type: "project_acceptance" as const,
        target_id: item.id,
      }];
    }

    return [] as TaskCenterTodoItem[];
  });
}
