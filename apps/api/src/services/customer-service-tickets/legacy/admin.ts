import { getAdminTicket, getVisibleCustomerIds } from "./access";
import { serializeTicket } from "./serialize";
import {
  CustomerServiceTicketActionConfig,
  Errors,
  accessPolicyService,
  customerServiceTicketRepository,
  getTicketCustomerName,
  notificationService,
  type AssignCustomerServiceTicketInput,
  type AuthContext,
  type CustomerServiceTicketActionInput,
  type CustomerServiceTicketListQuery,
  type CustomerServiceTicketStatus,
} from "./shared";

export async function listTickets(authContext: AuthContext, query: CustomerServiceTicketListQuery) {
  const tenantId = accessPolicyService.assertTenantContext(authContext);
  const visibleCustomerIds = await getVisibleCustomerIds(authContext);
  if (visibleCustomerIds && visibleCustomerIds.length === 0) {
    return {
      list: [],
      pagination: { page: query.page, pageSize: query.pageSize, total: 0, totalPages: 0 },
    };
  }
  if (query.customer_id && visibleCustomerIds && !visibleCustomerIds.includes(query.customer_id)) {
    return {
      list: [],
      pagination: { page: query.page, pageSize: query.pageSize, total: 0, totalPages: 0 },
    };
  }

  const result = await customerServiceTicketRepository.list({
    tenantId,
    query,
    visibleCustomerIds,
  });

  return {
    list: result.list.map((item) => serializeTicket(item)),
    pagination: result.pagination,
  };
}

export async function getTicket(authContext: AuthContext, ticketId: string) {
  const ticket = await getAdminTicket(authContext, ticketId, "customer.read");
  const actions = await customerServiceTicketRepository.listActions({
    tenantId: ticket.tenant_id,
    ticketId: ticket.id,
  });
  return serializeTicket(ticket, { actions });
}

export async function assignTicket(
  authContext: AuthContext,
  ticketId: string,
  payload: AssignCustomerServiceTicketInput,
) {
  const ticket = await getAdminTicket(authContext, ticketId, "customer.update");
  if (!["open", "in_progress"].includes(ticket.status)) {
    throw Errors.business(400, "当前状态不能分配客服", "CUSTOMER_SERVICE_ACTION_INVALID");
  }

  if (payload.assigned_employee_id) {
    const employee = await customerServiceTicketRepository.findEmployee({
      employeeId: payload.assigned_employee_id,
      tenantId: ticket.tenant_id,
    });
    if (!employee || employee.status !== "active") {
      throw Errors.badRequest("负责人不存在或不可用");
    }
  }

  const updated = await customerServiceTicketRepository.updateTicket({
    ticketId: ticket.id,
    tenantId: ticket.tenant_id,
    patch: { assigned_employee_id: payload.assigned_employee_id },
  });
  await customerServiceTicketRepository.createAction({
    tenantId: ticket.tenant_id,
    ticketId: ticket.id,
    action: "assign",
    fromStatus: ticket.status,
    toStatus: updated.status,
    operatorEmployeeId: authContext.employeeId,
    operatorAuthUserId: authContext.authUserId,
    metadata: { assigned_employee_id: payload.assigned_employee_id },
  });
  if (updated.assigned_employee_id) {
    await notificationService.tryNotifyCustomerServiceTicketAssigned({
      tenantId: ticket.tenant_id,
      ticketId: ticket.id,
      ticketNo: ticket.ticket_no,
      recipientEmployeeId: updated.assigned_employee_id,
      customerName: getTicketCustomerName(updated),
      title: updated.title,
    });
  }

  const actions = await customerServiceTicketRepository.listActions({
    tenantId: ticket.tenant_id,
    ticketId: ticket.id,
  });
  return serializeTicket(updated, { actions });
}

export async function executeAction(
  authContext: AuthContext,
  ticketId: string,
  payload: CustomerServiceTicketActionInput,
) {
  if (payload.action === "assign") {
    throw Errors.badRequest("分配客服请使用分配接口");
  }

  const ticket = await getAdminTicket(authContext, ticketId, "customer.update");
  const actionConfig = CustomerServiceTicketActionConfig[payload.action];
  if (!actionConfig.from.includes(ticket.status)) {
    throw Errors.business(400, "当前状态不能执行该动作", "CUSTOMER_SERVICE_ACTION_INVALID", {
      status: ticket.status,
      action: payload.action,
    });
  }
  if (actionConfig.requiresContent && !payload.content) {
    throw Errors.badRequest("处理结果不能为空");
  }
  if (payload.action !== "resolve" && payload.images.length > 0) {
    throw Errors.badRequest("只有标记解决时可以上传处理附件");
  }

  const toStatus = actionConfig.to ?? ticket.status;
  const now = new Date().toISOString();
  const patch: {
    status: CustomerServiceTicketStatus;
    resolved_at?: string | null;
    closed_at?: string | null;
  } = { status: toStatus };
  if (payload.action === "resolve") patch.resolved_at = now;
  if (payload.action === "close" || payload.action === "cancel") patch.closed_at = now;
  if (payload.action === "reopen") {
    patch.resolved_at = null;
    patch.closed_at = null;
  }

  const updated = await customerServiceTicketRepository.updateTicket({
    ticketId: ticket.id,
    tenantId: ticket.tenant_id,
    patch,
  });
  await customerServiceTicketRepository.createAction({
    tenantId: ticket.tenant_id,
    ticketId: ticket.id,
    action: payload.action,
    fromStatus: ticket.status,
    toStatus,
    operatorEmployeeId: authContext.employeeId,
    operatorAuthUserId: authContext.authUserId,
    content: payload.content,
    metadata: {
      ...payload.metadata,
      ...(payload.images.length > 0
        ? { images: payload.images, image_count: payload.images.length }
        : {}),
    },
  });

  const actions = await customerServiceTicketRepository.listActions({
    tenantId: ticket.tenant_id,
    ticketId: ticket.id,
  });
  return serializeTicket(updated, { actions });
}
