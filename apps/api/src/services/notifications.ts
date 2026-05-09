import { notificationRepository } from "@/repositories/notifications";
import type { NotificationListQuery, NotificationMarkReadBody } from "@/schema/notifications";
import { Errors } from "@/errors/error-factory";
import type { AuthContext } from "@/services/authorization";

type NotifyTenantAdminsInput = {
  tenantId: string;
  scene: string;
  title: string;
  content: string;
  targetType?: string | null;
  targetId?: string | null;
  targetUrl?: string | null;
  payload?: Record<string, unknown>;
  extraRecipientEmployeeIds?: string[];
};

class NotificationService {
  async listMine(authContext: AuthContext, query: NotificationListQuery) {
    const employeeId = this.assertEmployee(authContext);
    return notificationRepository.listForEmployee({
      employeeId,
      query,
    });
  }

  async getMySummary(authContext: AuthContext) {
    const employeeId = this.assertEmployee(authContext);
    return notificationRepository.getSummary(employeeId);
  }

  async markMineRead(authContext: AuthContext, body: NotificationMarkReadBody) {
    const employeeId = this.assertEmployee(authContext);
    return notificationRepository.markRead({
      employeeId,
      ids: body.ids,
    });
  }

  async createTenantAdminNotifications(input: NotifyTenantAdminsInput) {
    const admins = await notificationRepository.listTenantAdminEmployees(input.tenantId);
    const recipientIds = new Set([
      ...admins.map((item) => item.id),
      ...(input.extraRecipientEmployeeIds || []),
    ]);

    return notificationRepository.createMany(
      Array.from(recipientIds).map((employeeId) => ({
        tenantId: input.tenantId,
        recipientEmployeeId: employeeId,
        scene: input.scene,
        title: input.title,
        content: input.content,
        targetType: input.targetType,
        targetId: input.targetId,
        targetUrl: input.targetUrl,
        payload: input.payload,
      })),
    );
  }

  async notifyPlatformLeadAssigned(input: {
    tenantId: string;
    platformLeadId: string;
    customerId: string | null;
    dedupeResult: string | null;
    leadName?: string | null;
    leadPhone?: string | null;
    city?: string | null;
  }) {
    const customerLabel = input.leadName || maskPhone(input.leadPhone) || "新客户";
    const areaLabel = input.city || "未知地区";
    const tag = input.dedupeResult === "existing_customer"
      ? "老客户新线索"
      : "平台新线索";

    return this.createTenantAdminNotifications({
      tenantId: input.tenantId,
      scene: "platform_lead_assigned",
      title: "平台分配新线索",
      content: `平台为你分配了一条来自${areaLabel}的${tag}：${customerLabel}，请及时跟进。`,
      targetType: input.customerId ? "customer" : "platform_lead",
      targetId: input.customerId || input.platformLeadId,
      targetUrl: input.customerId ? `/customers/${input.customerId}` : null,
      payload: {
        platform_lead_id: input.platformLeadId,
        customer_id: input.customerId,
        dedupe_result: input.dedupeResult,
      },
    });
  }

  async notifyEmployeeShareCustomerBound(input: {
    tenantId: string;
    customerId: string;
    shareEmployeeId: string;
    dedupeResult: string | null;
    source: string | null;
  }) {
    const customer = await notificationRepository.findCustomerById(input.customerId);
    const customerLabel = customer?.name || maskPhone(customer?.phone) || "新客户";
    const tag = input.dedupeResult === "existing_customer"
      ? "老客户新线索"
      : "新客户";

    return this.createTenantAdminNotifications({
      tenantId: input.tenantId,
      scene: "employee_share_customer_bound",
      title: "员工分享获客成功",
      content: `${customerLabel} 已通过员工分享绑定为${tag}，请及时跟进。`,
      targetType: "customer",
      targetId: input.customerId,
      targetUrl: `/customers/${input.customerId}`,
      payload: {
        customer_id: input.customerId,
        share_employee_id: input.shareEmployeeId,
        dedupe_result: input.dedupeResult,
        source: input.source,
      },
      extraRecipientEmployeeIds: [input.shareEmployeeId],
    });
  }

  async tryNotifyPlatformLeadAssigned(input: Parameters<NotificationService["notifyPlatformLeadAssigned"]>[0]) {
    try {
      return await this.notifyPlatformLeadAssigned(input);
    } catch {
      return [];
    }
  }

  async tryNotifyEmployeeShareCustomerBound(input: Parameters<NotificationService["notifyEmployeeShareCustomerBound"]>[0]) {
    try {
      return await this.notifyEmployeeShareCustomerBound(input);
    } catch {
      return [];
    }
  }

  private assertEmployee(authContext: AuthContext) {
    if (!authContext.employeeId) {
      throw Errors.forbidden();
    }

    return authContext.employeeId;
  }
}

function maskPhone(phone: string | null | undefined) {
  if (!phone) return null;
  if (phone.length === 11) return `${phone.slice(0, 3)}****${phone.slice(-4)}`;
  return phone;
}

export const notificationService = new NotificationService();
