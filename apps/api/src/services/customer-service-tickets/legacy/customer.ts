import { assertCustomerProject, getCustomerTicket } from "./access";
import { serializeTicket } from "./serialize";
import { assertCustomerServiceEnabled } from "./settings";
import {
  Errors,
  buildTicketNo,
  customerServiceTicketRepository,
  getTicketCustomerName,
  notificationService,
  type CreateCustomerServiceTicketInput,
  type CustomerServiceTicketListQuery,
  type CustomerTicketContext,
} from "./shared";

export async function createCustomerTicket(input: {
  authUserId: string;
  customer: CustomerTicketContext;
  payload: CreateCustomerServiceTicketInput;
}) {
  if (!input.customer.tenant_id) throw Errors.forbidden();

  await assertCustomerServiceEnabled(input.customer.tenant_id);
  await assertCustomerProject({
    tenantId: input.customer.tenant_id,
    customerId: input.customer.id,
    projectId: input.payload.project_id,
  });

  const title = input.payload.title ||
    input.payload.content.replace(/\s+/g, " ").slice(0, 40);
  const ticket = await customerServiceTicketRepository.create({
    tenantId: input.customer.tenant_id,
    ticketNo: buildTicketNo(),
    customerId: input.customer.id,
    projectId: input.payload.project_id ?? null,
    category: input.payload.category,
    title,
    content: input.payload.content,
    images: input.payload.images,
  });

  await customerServiceTicketRepository.createAction({
    tenantId: ticket.tenant_id,
    ticketId: ticket.id,
    action: "create",
    fromStatus: null,
    toStatus: "open",
    operatorAuthUserId: input.authUserId,
    content: input.payload.content,
    metadata: {
      image_count: input.payload.images.length,
      source: "customer",
    },
  });
  await notificationService.tryNotifyCustomerServiceTicketCreated({
    tenantId: ticket.tenant_id,
    ticketId: ticket.id,
    ticketNo: ticket.ticket_no,
    customerName: getTicketCustomerName(ticket),
    title: ticket.title,
  });

  const actions = await customerServiceTicketRepository.listActions({
    tenantId: ticket.tenant_id,
    ticketId: ticket.id,
  });
  return serializeTicket(ticket, { actions });
}

export async function listCustomerTickets(input: {
  customer: CustomerTicketContext;
  query: CustomerServiceTicketListQuery;
}) {
  if (!input.customer.tenant_id) throw Errors.forbidden();

  const result = await customerServiceTicketRepository.listByCustomer({
    tenantId: input.customer.tenant_id,
    customerId: input.customer.id,
    query: input.query,
  });

  return {
    list: result.list.map((item) => serializeTicket(item)),
    pagination: result.pagination,
  };
}

export async function getCustomerTicketDetail(input: {
  customer: CustomerTicketContext;
  ticketId: string;
}) {
  const ticket = await getCustomerTicket(input);
  const actions = await customerServiceTicketRepository.listActions({
    tenantId: ticket.tenant_id,
    ticketId: ticket.id,
  });
  return serializeTicket(ticket, { actions });
}
