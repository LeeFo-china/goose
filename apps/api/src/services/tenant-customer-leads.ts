import { CUSTOMER_LEAD_ACTION_PERMISSIONS, CUSTOMER_LEAD_ACTION_VALUES,
  CustomerLeadCommandResultSchema, type CustomerLeadAction,
  type CustomerLeadActionAvailability, type CustomerLeadAssignInput,
  type CustomerLeadAssigneeCandidatesQueryInput, type CustomerLeadAssigneeFilterOptionsQueryInput,
  type CustomerLeadConvertInput, type CustomerLeadDetail, type CustomerLeadFollowUpInput,
  type CustomerLeadListQueryInput, type CustomerLeadMarkInvalidInput,
  type CustomerLeadPageQueryInput } from "@gooes/domain";
import { AppError } from "@/errors/app-error";
import { Errors } from "@/errors/error-factory";
import { tenantCustomerLeadsRepository } from "@/repositories/tenant-customer-leads";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";
import { customerPhonePrivacyService } from "@/services/customer-phone-privacy";
import { customerLeadBoundary } from "@/services/tenant-customer-leads-errors";
import { customerAppointmentFromPublic, customerLink, serializeCustomerLead,
  serializeCustomerLeadAppointment, serializeCustomerLeadFollowUp } from
  "@/services/tenant-customer-leads-serializer";
import { TenantDouyinLeadsService } from "@/services/tenant-douyin-leads";
import { serializePublicLeadSource } from "@/services/tenant-douyin-leads-public";
import { isVisibleAssignee, pagination } from "@/services/tenant-douyin-leads-service-helpers";
import { serializeH5LeadSource } from "./tenant-customer-lead-h5-source";

type Dependencies = ConstructorParameters<typeof TenantDouyinLeadsService>[0] & {
  repository: ConstructorParameters<typeof TenantDouyinLeadsService>[0]["repository"]
    & Pick<typeof tenantCustomerLeadsRepository, "findCustomerAccess" | "findH5Page">;
};

export class TenantCustomerLeadsService {
  private readonly workflow: TenantDouyinLeadsService;

  constructor(private readonly dependencies: Dependencies) {
    this.workflow = new TenantDouyinLeadsService(dependencies, "customer_lead");
  }

  list(auth: AuthContext, input: CustomerLeadListQueryInput) {
    return customerLeadBoundary(async () => {
      const page = await this.workflow.listBundles(auth, input);
      // Resolve the customer scope once per page, never once per row.
      const visibleCustomerOwnerIds = await this.customerOwners(auth);
      return { list: page.rows.map((bundle) => serializeCustomerLead({ bundle,
        tenantId: page.tenantId, visibleCustomerOwnerIds,
        phonePrivacy: this.dependencies.phonePrivacy })),
      pagination: pagination(page.page, page.pageSize, page.total) };
    });
  }

  getDetail(auth: AuthContext, leadId: string): Promise<CustomerLeadDetail> {
    return customerLeadBoundary(async () => {
      const { detail, tenantId, id } = await this.workflow.getDetailBundle(auth, leadId);
      const visibleCustomerOwnerIds = await this.customerOwners(auth);
      const summary = serializeCustomerLead({ bundle: detail, tenantId,
        visibleCustomerOwnerIds, phonePrivacy: this.dependencies.phonePrivacy });
      const appointments = detail.appointments.map(serializeCustomerLeadAppointment);
      const sourceContext = summary.source === "h5"
        ? serializeH5LeadSource(detail.lead, detail.lead.page_id
          ? await this.dependencies.repository.findH5Page(tenantId, detail.lead.page_id) : null)
        : serializePublicLeadSource(detail.appointments[0]?.source_snapshot ?? detail.lead.form_data);
      return { ...summary,
        source_context: sourceContext,
        latest_appointment: appointments[0] ?? null,
        appointments: { list: appointments, pagination: pagination(1, 20, detail.appointmentTotal) },
        follow_ups: { list: detail.followUps.map((row) => serializeCustomerLeadFollowUp(row, tenantId, id)),
          pagination: pagination(1, 20, detail.followUpTotal) },
        actions: await this.actions(auth, detail.lead),
      };
    });
  }

  listAppointments(auth: AuthContext, leadId: string, input: CustomerLeadPageQueryInput) {
    return customerLeadBoundary(async () => {
      const result = await this.workflow.listAppointments(auth, leadId, input);
      return { ...result, list: result.list.map(customerAppointmentFromPublic) };
    });
  }

  listFollowUps(auth: AuthContext, leadId: string, input: CustomerLeadPageQueryInput) {
    return customerLeadBoundary(async () => {
      const page = await this.workflow.listFollowUpBundles(auth, leadId, input);
      return { list: page.rows.map((row) => serializeCustomerLeadFollowUp(row, page.tenantId, page.id)),
        pagination: pagination(page.page, page.pageSize, page.total) };
    });
  }

  listAssigneeCandidates(auth: AuthContext, input: CustomerLeadAssigneeCandidatesQueryInput) {
    return customerLeadBoundary(async () => {
      this.requireEmployee(auth);
      this.dependencies.accessPolicy.assertPermission(auth, "customer_lead.read");
      return this.workflow.listAssigneeCandidates(auth, input);
    });
  }

  listAssigneeFilterOptions(auth: AuthContext, input: CustomerLeadAssigneeFilterOptionsQueryInput) {
    return customerLeadBoundary(async () => {
      this.requireEmployee(auth);
      return this.workflow.listAssigneeFilterOptions(auth, input);
    });
  }

  assign(auth: AuthContext, leadId: string, input: CustomerLeadAssignInput) {
    return customerLeadBoundary(async () => this.parseCommand(await this.workflow.assign(auth, leadId, input)));
  }

  appendFollowUp(auth: AuthContext, leadId: string, input: CustomerLeadFollowUpInput) {
    return customerLeadBoundary(async () => this.parseCommand(await this.workflow.appendFollowUp(auth, leadId, input)));
  }

  markInvalid(auth: AuthContext, leadId: string, input: CustomerLeadMarkInvalidInput) {
    return customerLeadBoundary(async () => this.parseCommand(await this.workflow.markInvalid(auth, leadId, input)));
  }

  convert(auth: AuthContext, leadId: string, input: CustomerLeadConvertInput) {
    return customerLeadBoundary(async () => {
      const data = await this.workflow.convert(auth, leadId, input);
      const tenantId = this.dependencies.accessPolicy.assertTenantContext(auth);
      const owners = await this.customerOwners(auth);
      const customer = owners !== null && owners.length === 0 ? null
        : await this.dependencies.repository.findCustomerAccess(tenantId, data.customer_id);
      if (customer && customer.id !== data.customer_id) {
        throw Errors.business(500, "客户线索响应数据无效", "CUSTOMER_LEAD_RESPONSE_INVALID");
      }
      return this.parseCommand({ ...data, ...customerLink(customer, tenantId, owners) });
    });
  }

  private parseCommand(value: unknown) {
    const result = CustomerLeadCommandResultSchema.safeParse(value);
    if (!result.success) throw Errors.business(500, "客户线索响应数据无效", "CUSTOMER_LEAD_RESPONSE_INVALID");
    return result.data;
  }

  private requireEmployee(auth: AuthContext): void {
    if (!auth.employeeId) throw Errors.business(403, "当前操作需要员工身份", "CUSTOMER_LEAD_EMPLOYEE_REQUIRED");
  }

  private customerOwners(auth: AuthContext): Promise<string[] | null> {
    if (!auth.permissions.some((permission) => permission.code === "customer.read")) return Promise.resolve([]);
    return this.dependencies.accessPolicy.getVisibleCustomerOwnerIds(auth, "customer.read");
  }

  private async actions(auth: AuthContext, lead: { id: string; tenant_id: string;
    assigned_employee_id: string | null; lead_status: string; phone: string | null }) {
    const entries = await Promise.all(CUSTOMER_LEAD_ACTION_VALUES.map(async (action) =>
      [action, await this.actionAvailability(auth, lead, action)] as const));
    return Object.fromEntries(entries) as Record<CustomerLeadAction, CustomerLeadActionAvailability>;
  }

  private async actionAvailability(auth: AuthContext, lead: { id: string; tenant_id: string;
    assigned_employee_id: string | null; lead_status: string; phone: string | null },
  action: CustomerLeadAction): Promise<CustomerLeadActionAvailability> {
    const disabled = (reason: string): CustomerLeadActionAvailability => ({ enabled: false, reason });
    const permission = CUSTOMER_LEAD_ACTION_PERMISSIONS[action];
    if (!auth.employeeId || !auth.permissions.some((item) => item.code === permission)) return disabled("无操作权限");
    const visible = await this.dependencies.accessPolicy.getVisibleCustomerOwnerIds(auth, permission);
    if (!isVisibleAssignee(lead.assigned_employee_id, visible)) return disabled("线索不在可操作范围内");
    if ((action === "assign" || action === "follow_up")
      && (lead.lead_status === "invalid" || lead.lead_status === "converted")) return disabled("当前线索状态不支持此操作");
    if (action === "assign" && auth.permissions.find((item) => item.code === permission)?.scope === "department"
      && !auth.tenantDepartmentId) return disabled("当前员工未配置部门");
    if (action === "mark_invalid" && lead.lead_status === "converted") return disabled("已转化线索不能标记为无效");
    if (action === "convert") {
      if (lead.lead_status === "invalid") return disabled("无效线索不能转为客户");
      if (!/^1[3-9]\d{9}$/.test(lead.phone ?? "")) return disabled("转客户前需要有效手机号");
      const preflight = await this.dependencies.repository.findConversionPreflight({ tenantId: lead.tenant_id, leadId: lead.id });
      if (!preflight || preflight.leadId !== lead.id
        || !isVisibleAssignee(preflight.assignedEmployeeId, visible)) return disabled("线索已变化，请刷新");
      if (preflight.customerId === null) {
        try {
          const scope = this.dependencies.accessPolicy.assertPermission(auth, "customer.create");
          if (!scope || (scope !== "all" && (preflight.assignedEmployeeId ?? auth.employeeId) !== auth.employeeId)) {
            return disabled("无创建该负责人客户的权限");
          }
        } catch (error) {
          if (error instanceof AppError && error.statusCode === 403) return disabled("无创建客户权限");
          throw error;
        }
      }
    }
    return { enabled: true, reason: null };
  }
}

export const tenantCustomerLeadsService = new TenantCustomerLeadsService({
  repository: tenantCustomerLeadsRepository, accessPolicy: accessPolicyService,
  phonePrivacy: customerPhonePrivacyService,
});
