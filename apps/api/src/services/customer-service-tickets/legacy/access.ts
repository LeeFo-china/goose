import {
  Errors,
  accessPolicyService,
  customerServiceTicketRepository,
  type AuthContext,
  type CustomerTicketContext,
} from "./shared";

export async function getVisibleCustomerIds(authContext: AuthContext) {
  const ownerIds = await accessPolicyService.getVisibleCustomerOwnerIds(
    authContext,
    "customer.read",
  );
  if (ownerIds === null) return null;
  if (ownerIds.length === 0) return [] as string[];

  const tenantId = accessPolicyService.assertTenantContext(authContext);
  return customerServiceTicketRepository.listCustomerIdsByOwnerIds({
    tenantId,
    ownerIds,
  });
}

export async function assertCustomerAccess(
  authContext: AuthContext,
  customerId: string,
  permissionCode: "customer.read" | "customer.update",
) {
  const tenantId = accessPolicyService.assertTenantContext(authContext);
  const customer = await customerServiceTicketRepository.findCustomer({
    customerId,
    tenantId,
  });
  if (!customer) throw Errors.notFound("客户不存在");

  const canAccess = await accessPolicyService.canAccessCustomer(
    authContext,
    customer,
    permissionCode,
  );
  if (!canAccess) throw Errors.forbidden();

  return customer;
}

export async function assertCustomerProject(input: {
  tenantId: string;
  customerId: string;
  projectId?: string | null;
}) {
  if (!input.projectId) return null;

  const project = await customerServiceTicketRepository.findProject({
    projectId: input.projectId,
    tenantId: input.tenantId,
  });
  if (!project || project.customer_id !== input.customerId) {
    throw Errors.badRequest("项目不属于当前客户");
  }

  return project;
}

export async function getAdminTicket(
  authContext: AuthContext,
  ticketId: string,
  permissionCode: "customer.read" | "customer.update",
) {
  const tenantId = accessPolicyService.assertTenantContext(authContext);
  const ticket = await customerServiceTicketRepository.findById({
    ticketId,
    tenantId,
  });
  if (!ticket) throw Errors.notFound("客服问题不存在");

  await assertCustomerAccess(authContext, ticket.customer_id, permissionCode);
  return ticket;
}

export async function getCustomerTicket(input: {
  customer: CustomerTicketContext;
  ticketId: string;
}) {
  if (!input.customer.tenant_id) throw Errors.forbidden();

  const ticket = await customerServiceTicketRepository.findById({
    ticketId: input.ticketId,
    tenantId: input.customer.tenant_id,
  });
  if (!ticket || ticket.customer_id !== input.customer.id) {
    throw Errors.notFound("客服问题不存在");
  }

  return ticket;
}
