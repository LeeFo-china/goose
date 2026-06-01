import { Errors } from "@/errors/error-factory";
import {
  customerServiceTicketRepository,
  type CustomerServiceTicketActionRecord,
  type CustomerServiceTicketRecord,
} from "@/repositories/customer-service-tickets";
import type {
  AssignCustomerServiceTicketInput,
  CreateCustomerServiceTicketInput,
  CustomerServiceTicketActionInput,
  CustomerServiceTicketListQuery,
} from "@/schema/customer-service";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";
import { resolveStoredFileUrlList } from "@/services/files/file-url-resolver";
import { notificationService } from "@/services/notifications";
import { systemSettingsService } from "@/services/system-settings";
import {
  CustomerServiceTicketActionConfig,
  CustomerServiceTicketCategoryConfig,
  CustomerServiceTicketPriorityConfig,
  CustomerServiceTicketStatusConfig,
  isCustomerServiceTicketStatus,
  listCustomerServiceTicketActions,
  type CustomerServiceTicketAction,
  type CustomerServiceTicketStatus,
} from "@gooes/domain";

type CustomerTicketContext = {
  id: string;
  tenant_id: string | null;
  owner_id?: string | null;
  name?: string | null;
  phone?: string | null;
};

type RelationObject = Record<string, unknown>;

function normalizeRelation(value: unknown): RelationObject | null {
  if (Array.isArray(value)) {
    return normalizeRelation(value[0]);
  }

  if (!value || typeof value !== "object") {
    return null;
  }

  return value as RelationObject;
}

function asString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function getTicketCustomerName(row: CustomerServiceTicketRecord) {
  const customer = normalizeRelation(row.customer);
  return asString(customer?.name) || asString(customer?.phone);
}

function maskPhone(value: string | null | undefined) {
  const phone = value?.trim();
  if (!phone) return null;
  if (phone.length < 7) return phone;
  return `${phone.slice(0, 3)}****${phone.slice(-4)}`;
}

function buildTicketNo() {
  const now = new Date();
  const pad = (value: number, size = 2) => String(value).padStart(size, "0");
  const timestamp = [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join("");
  const random = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `CS${timestamp}${random}`;
}

class CustomerServiceTicketService {
  async getCustomerServiceConfig(tenantId: string | null | undefined) {
    const options = { tenantId: tenantId ?? null };
    const [enabled, phone, workingHours, notice] = await Promise.all([
      systemSettingsService.getBoolean("CUSTOMER_SERVICE_ENABLED", false, options),
      systemSettingsService.getString("CUSTOMER_SERVICE_PHONE", "", options),
      systemSettingsService.getString("CUSTOMER_SERVICE_WORKING_HOURS", "", options),
      systemSettingsService.getString("CUSTOMER_SERVICE_NOTICE", "", options),
    ]);

    return {
      enabled,
      phone: phone || null,
      working_hours: workingHours || null,
      notice: notice || null,
    };
  }

  private async assertCustomerServiceEnabled(tenantId: string) {
    const config = await this.getCustomerServiceConfig(tenantId);
    if (!config.enabled) {
      throw Errors.business(403, "客服入口未启用", "CUSTOMER_SERVICE_DISABLED");
    }
    return config;
  }

  private async getVisibleCustomerIds(authContext: AuthContext) {
    const ownerIds = await accessPolicyService.getVisibleCustomerOwnerIds(
      authContext,
      "customer.read",
    );
    if (ownerIds === null) {
      return null;
    }
    if (ownerIds.length === 0) {
      return [] as string[];
    }

    const tenantId = accessPolicyService.assertTenantContext(authContext);
    return customerServiceTicketRepository.listCustomerIdsByOwnerIds({
      tenantId,
      ownerIds,
    });
  }

  private async assertCustomerAccess(
    authContext: AuthContext,
    customerId: string,
    permissionCode: "customer.read" | "customer.update",
  ) {
    const tenantId = accessPolicyService.assertTenantContext(authContext);
    const customer = await customerServiceTicketRepository.findCustomer({
      customerId,
      tenantId,
    });
    if (!customer) {
      throw Errors.notFound("客户不存在");
    }

    const canAccess = await accessPolicyService.canAccessCustomer(
      authContext,
      customer,
      permissionCode,
    );
    if (!canAccess) {
      throw Errors.forbidden();
    }

    return customer;
  }

  private async assertCustomerProject(input: {
    tenantId: string;
    customerId: string;
    projectId?: string | null;
  }) {
    if (!input.projectId) {
      return null;
    }

    const project = await customerServiceTicketRepository.findProject({
      projectId: input.projectId,
      tenantId: input.tenantId,
    });
    if (!project || project.customer_id !== input.customerId) {
      throw Errors.badRequest("项目不属于当前客户");
    }

    return project;
  }

  private async getAdminTicket(
    authContext: AuthContext,
    ticketId: string,
    permissionCode: "customer.read" | "customer.update",
  ) {
    const tenantId = accessPolicyService.assertTenantContext(authContext);
    const ticket = await customerServiceTicketRepository.findById({
      ticketId,
      tenantId,
    });
    if (!ticket) {
      throw Errors.notFound("客服问题不存在");
    }

    await this.assertCustomerAccess(authContext, ticket.customer_id, permissionCode);
    return ticket;
  }

  private async getCustomerTicket(input: {
    customer: CustomerTicketContext;
    ticketId: string;
  }) {
    if (!input.customer.tenant_id) {
      throw Errors.forbidden();
    }

    const ticket = await customerServiceTicketRepository.findById({
      ticketId: input.ticketId,
      tenantId: input.customer.tenant_id,
    });
    if (!ticket || ticket.customer_id !== input.customer.id) {
      throw Errors.notFound("客服问题不存在");
    }

    return ticket;
  }

  private serializeAction(row: CustomerServiceTicketActionRecord) {
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
      image_items: images.map((url) => ({
        url,
        thumb_url: url,
      })),
      image_count: images.length,
      created_at: row.created_at,
    };
  }

  private serializeTicket(
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
      image_items: images.map((url) => ({
        url,
        thumb_url: url,
      })),
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
      ...(options?.actions
        ? { actions: options.actions.map((item) => this.serializeAction(item)) }
        : {}),
    };
  }

  async createCustomerTicket(input: {
    authUserId: string;
    customer: CustomerTicketContext;
    payload: CreateCustomerServiceTicketInput;
  }) {
    if (!input.customer.tenant_id) {
      throw Errors.forbidden();
    }

    await this.assertCustomerServiceEnabled(input.customer.tenant_id);
    await this.assertCustomerProject({
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
    return this.serializeTicket(ticket, { actions });
  }

  async listCustomerTickets(input: {
    customer: CustomerTicketContext;
    query: CustomerServiceTicketListQuery;
  }) {
    if (!input.customer.tenant_id) {
      throw Errors.forbidden();
    }

    const result = await customerServiceTicketRepository.listByCustomer({
      tenantId: input.customer.tenant_id,
      customerId: input.customer.id,
      query: input.query,
    });

    return {
      list: result.list.map((item) => this.serializeTicket(item)),
      pagination: result.pagination,
    };
  }

  async getCustomerTicketDetail(input: {
    customer: CustomerTicketContext;
    ticketId: string;
  }) {
    const ticket = await this.getCustomerTicket(input);
    const actions = await customerServiceTicketRepository.listActions({
      tenantId: ticket.tenant_id,
      ticketId: ticket.id,
    });
    return this.serializeTicket(ticket, { actions });
  }

  async listTickets(authContext: AuthContext, query: CustomerServiceTicketListQuery) {
    const tenantId = accessPolicyService.assertTenantContext(authContext);
    const visibleCustomerIds = await this.getVisibleCustomerIds(authContext);
    if (visibleCustomerIds && visibleCustomerIds.length === 0) {
      return {
        list: [],
        pagination: {
          page: query.page,
          pageSize: query.pageSize,
          total: 0,
          totalPages: 0,
        },
      };
    }
    if (
      query.customer_id &&
      visibleCustomerIds &&
      !visibleCustomerIds.includes(query.customer_id)
    ) {
      return {
        list: [],
        pagination: {
          page: query.page,
          pageSize: query.pageSize,
          total: 0,
          totalPages: 0,
        },
      };
    }

    const result = await customerServiceTicketRepository.list({
      tenantId,
      query,
      visibleCustomerIds,
    });

    return {
      list: result.list.map((item) => this.serializeTicket(item)),
      pagination: result.pagination,
    };
  }

  async getTicket(authContext: AuthContext, ticketId: string) {
    const ticket = await this.getAdminTicket(authContext, ticketId, "customer.read");
    const actions = await customerServiceTicketRepository.listActions({
      tenantId: ticket.tenant_id,
      ticketId: ticket.id,
    });
    return this.serializeTicket(ticket, { actions });
  }

  async assignTicket(
    authContext: AuthContext,
    ticketId: string,
    payload: AssignCustomerServiceTicketInput,
  ) {
    const ticket = await this.getAdminTicket(authContext, ticketId, "customer.update");
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
      patch: {
        assigned_employee_id: payload.assigned_employee_id,
      },
    });
    await customerServiceTicketRepository.createAction({
      tenantId: ticket.tenant_id,
      ticketId: ticket.id,
      action: "assign",
      fromStatus: ticket.status,
      toStatus: updated.status,
      operatorEmployeeId: authContext.employeeId,
      operatorAuthUserId: authContext.authUserId,
      metadata: {
        assigned_employee_id: payload.assigned_employee_id,
      },
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
    return this.serializeTicket(updated, { actions });
  }

  async executeAction(
    authContext: AuthContext,
    ticketId: string,
    payload: CustomerServiceTicketActionInput,
  ) {
    if (payload.action === "assign") {
      throw Errors.badRequest("分配客服请使用分配接口");
    }

    const ticket = await this.getAdminTicket(authContext, ticketId, "customer.update");
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
    } = {
      status: toStatus,
    };
    if (payload.action === "resolve") {
      patch.resolved_at = now;
    }
    if (payload.action === "close" || payload.action === "cancel") {
      patch.closed_at = now;
    }
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
          ? {
            images: payload.images,
            image_count: payload.images.length,
          }
          : {}),
      },
    });

    const actions = await customerServiceTicketRepository.listActions({
      tenantId: ticket.tenant_id,
      ticketId: ticket.id,
    });
    return this.serializeTicket(updated, { actions });
  }
}

export const customerServiceTicketService = new CustomerServiceTicketService();
