import {
  CustomerServiceTicketActionConfig,
  CustomerServiceTicketCategoryConfig,
  CustomerServiceTicketPriorityConfig,
  CustomerServiceTicketStatusConfig,
  asString,
  isCustomerServiceTicketStatus,
  listCustomerServiceTicketActions,
  maskPhone,
  normalizeRelation,
  resolveStoredFileUrlList,
  type CustomerServiceTicketAction,
  type CustomerServiceTicketActionRecord,
  type CustomerServiceTicketRecord,
  type CustomerServiceTicketStatus,
} from "./shared";

export function serializeAction(row: CustomerServiceTicketActionRecord) {
  const actionConfig = row.action === "create"
    ? { label: "提交问题" }
    : CustomerServiceTicketActionConfig[row.action as CustomerServiceTicketAction];
  const metadata = row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
    ? row.metadata as Record<string, unknown>
    : {};
  const images = resolveStoredFileUrlList(metadata.images);
  const operatorEmployee = normalizeRelation(row.operator_employee);

  return {
    id: row.id,
    action: row.action,
    action_label: actionConfig?.label ?? row.action,
    from_status: row.from_status,
    from_status_label: row.from_status
      ? CustomerServiceTicketStatusConfig[row.from_status].label
      : null,
    to_status: row.to_status,
    to_status_label: row.to_status
      ? CustomerServiceTicketStatusConfig[row.to_status].label
      : null,
    operator_employee_id: row.operator_employee_id,
    operator_auth_user_id: row.operator_auth_user_id,
    operator_employee: operatorEmployee
      ? {
        id: asString(operatorEmployee.id) ?? row.operator_employee_id,
        name: asString(operatorEmployee.name),
        phone_masked: maskPhone(asString(operatorEmployee.phone)),
        status: asString(operatorEmployee.status),
      }
      : null,
    content: row.content,
    metadata,
    images,
    image_items: images.map((url) => ({ url, thumb_url: url })),
    image_count: images.length,
    created_at: row.created_at,
  };
}

export function serializeTicket(
  row: CustomerServiceTicketRecord,
  options?: { actions?: CustomerServiceTicketActionRecord[] },
) {
  const customer = normalizeRelation(row.customer);
  const project = normalizeRelation(row.project);
  const assignedEmployee = normalizeRelation(row.assigned_employee);
  const status: CustomerServiceTicketStatus = isCustomerServiceTicketStatus(row.status)
    ? row.status
    : "open";
  const images = resolveStoredFileUrlList(row.images);
  const category = row.category as keyof typeof CustomerServiceTicketCategoryConfig;
  const priority = row.priority as keyof typeof CustomerServiceTicketPriorityConfig;

  return {
    id: row.id,
    tenant_id: row.tenant_id,
    ticket_no: row.ticket_no,
    customer_id: row.customer_id,
    project_id: row.project_id,
    category: row.category,
    category_label: CustomerServiceTicketCategoryConfig[category]?.label ?? row.category,
    title: row.title,
    content: row.content,
    images,
    image_items: images.map((url) => ({ url, thumb_url: url })),
    image_count: images.length,
    status,
    status_label: CustomerServiceTicketStatusConfig[status].label,
    priority: row.priority,
    priority_label: CustomerServiceTicketPriorityConfig[priority]?.label ?? row.priority,
    assigned_employee_id: row.assigned_employee_id,
    resolved_at: row.resolved_at,
    closed_at: row.closed_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    customer: customer
      ? {
        id: asString(customer.id) ?? row.customer_id,
        name: asString(customer.name),
        phone_masked: maskPhone(asString(customer.phone)),
        owner_id: asString(customer.owner_id),
      }
      : null,
    project: project
      ? {
        id: asString(project.id) ?? row.project_id,
        name: asString(project.name),
        status: asString(project.status),
        customer_id: asString(project.customer_id),
      }
      : null,
    assigned_employee: assignedEmployee
      ? {
        id: asString(assignedEmployee.id) ?? row.assigned_employee_id,
        name: asString(assignedEmployee.name),
        phone_masked: maskPhone(asString(assignedEmployee.phone)),
        status: asString(assignedEmployee.status),
      }
      : null,
    available_actions: listCustomerServiceTicketActions({ status }).map((item) => ({
      action: item.action,
      label: item.label,
      to: item.to ?? null,
      requires_content: Boolean(item.requiresContent),
    })),
    ...(options?.actions ? { actions: options.actions.map((item) => serializeAction(item)) } : {}),
  };
}
