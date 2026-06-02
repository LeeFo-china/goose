import {
  accessPolicyService,
  encodeQueryValue,
  getPriorityLabel,
  taskCenterRepository,
  type AuthContext,
} from "./shared";

export async function buildCustomerServiceTicketTodos(authContext: AuthContext) {
  if (
    !authContext.employeeId ||
    !accessPolicyService.hasPermission(authContext, "customer.update")
  ) {
    return [];
  }

  const scope = accessPolicyService.getScope(authContext, "customer.update");
  const canSeeAll = scope === "all";
  const tenantId = accessPolicyService.assertTenantId(authContext);
  const rows = await taskCenterRepository.listCustomerServiceTicketTodos(tenantId);

  return rows
    .filter((item) => (
      canSeeAll ||
      item.assigned_employee_id === authContext.employeeId ||
      (!item.assigned_employee_id && item.status === "open")
    ))
    .map((item) => {
      const customerName = item.customer?.name?.trim() || item.customer?.phone || "未命名客户";
      const projectName = item.project?.name?.trim();
      const subtitle = projectName
        ? `${customerName} · ${projectName}`
        : customerName;
      const priority = item.priority === "urgent" || item.priority === "high"
        ? "high" as const
        : "medium" as const;

      return {
        id: `customer_service_ticket:${item.id}`,
        type: "customer_service_ticket" as const,
        title: item.status === "open" ? "客服问题待处理" : "客服问题处理中",
        subtitle: item.title || item.content || subtitle,
        status: "pending" as const,
        status_label: "待处理" as const,
        priority,
        priority_label: getPriorityLabel(priority),
        due_at: item.updated_at || item.created_at,
        created_at: item.created_at,
        action_label: "去处理",
        target_url: `/customer-service?ticketId=${encodeQueryValue(item.id)}`,
        target_type: "customer_service_ticket" as const,
        target_id: item.id,
        metadata: {
          ticket_no: item.ticket_no,
          customer_name: customerName,
          project_name: projectName || null,
          ticket_status: item.status,
        },
      };
    });
}
