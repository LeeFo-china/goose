import { Errors } from "@/errors/error-factory";
import { CustomerLeadListQuerySchema, CustomerLeadFollowUpSchema,
  type CustomerLeadListQueryInput, type CustomerLeadFollowUpInput } from "@gooes/domain";
import type {
  TenantDouyinAppointmentDetailRow,
  TenantDouyinLeadCommandResult,
} from "@/repositories/tenant-douyin-leads-contract";
import type {
  TenantDouyinFollowUpBundle,
  TenantDouyinLeadBundle,
} from "@/repositories/tenant-douyin-leads-hydration";
import { tenantDouyinLeadsRepository } from
  "@/repositories/tenant-douyin-leads";
import {
  TenantDouyinLeadAssignSchema,
  TenantDouyinLeadAppointmentListQuerySchema,
  TenantDouyinLeadConvertSchema,
  TenantDouyinLeadFollowUpListQuerySchema,
  TenantDouyinLeadFollowUpSchema,
  TenantDouyinLeadListQuerySchema,
  TenantDouyinLeadMarkInvalidSchema,
  type TenantDouyinLeadAssign,
  type TenantDouyinLeadAppointmentListQueryInput,
  type TenantDouyinLeadAssigneeCandidatesQuery,
  type TenantDouyinLeadAssigneeCandidatesQueryInput,
  type TenantDouyinLeadAssigneeFilterOptionsQuery,
  type TenantDouyinLeadAssigneeFilterOptionsQueryInput,
  type TenantDouyinLeadConvert,
  type TenantDouyinLeadFollowUp,
  type TenantDouyinLeadFollowUpListQueryInput,
  type TenantDouyinLeadListQuery,
  type TenantDouyinLeadListQueryInput,
  type TenantDouyinLeadMarkInvalid,
} from "@/schema/tenant-douyin-leads";
import { accessPolicyService } from "@/services/access-policy";
import type {
  AuthContext,
  EffectivePermission,
} from "@/services/authorization";
import { customerPhonePrivacyService } from "@/services/customer-phone-privacy";
import {
  serializeFollowUpBundle, serializeLeadBundle,
  type TenantDouyinLeadPhonePrivacyPort,
} from "@/services/tenant-douyin-leads-serializer";
import { listTenantDouyinLeadAssigneeCandidates,
  listTenantDouyinLeadAssigneeFilterOptions } from
  "@/services/tenant-douyin-lead-assignee-options";
import { serializePublicAppointment } from
  "@/services/tenant-douyin-leads-public";
import {
  assertTotal,
  isVisibleAssignee,
  pagination,
  parseLeadId,
  parseRequest,
  throwInvalidResponse,
  throwLeadNotFound,
  unwrapCommand,
} from "@/services/tenant-douyin-leads-service-helpers";

type LeadAction =
  | "list" | "detail" | "appointment_list" | "follow_up_list" | "assign"
  | "follow_up" | "convert" | "mark_invalid";
const ACTION_PERMISSIONS = {
  list: "douyin_lead.read",
  detail: "douyin_lead.read",
  appointment_list: "douyin_lead.read",
  follow_up_list: "douyin_lead.read",
  assign: "douyin_lead.assign",
  follow_up: "douyin_lead.follow_up",
  convert: "douyin_lead.convert",
  mark_invalid: "douyin_lead.convert",
} as const satisfies Readonly<Record<LeadAction, string>>;

export function permissionFor(action: LeadAction): string {
  return ACTION_PERMISSIONS[action];
}

type RepositoryPort = {
  listAssigneeFilterOptions(input: TenantDouyinLeadAssigneeFilterOptionsQuery & {
    tenantId: string; visibleEmployeeIds: readonly string[] | null;
  }): Promise<{ rows: readonly { id: string; name: string | null }[]; total: number }>;
  listAssigneeCandidates(input: TenantDouyinLeadAssigneeCandidatesQuery & {
    tenantId: string; scope: EffectivePermission["scope"];
    employeeId: string | null; tenantDepartmentId: string | null;
  }): Promise<{ rows: readonly { id: string; name: string | null }[]; total: number }>;
  listLeads(input: TenantDouyinLeadListQuery & {
    source?: "douyin_miniapp"; assignment?: "all" | "assigned" | "unassigned";
    tenantId: string;
    visibleAssigneeIds: readonly string[] | null;
  }): Promise<{
    rows: readonly TenantDouyinLeadBundle[]; total: number;
  }>;
  findLeadAccess(input: { tenantId: string; leadId: string }): Promise<{
    id: string; tenant_id: string; assigned_employee_id: string | null;
  } | null>;
  getLeadDetail(input: { tenantId: string; leadId: string }): Promise<
    (TenantDouyinLeadBundle & {
      appointments: readonly TenantDouyinAppointmentDetailRow[];
      appointmentTotal: number;
      followUps: readonly TenantDouyinFollowUpBundle[];
      followUpTotal: number;
    }) | null
  >;
  listFollowUps(input: { tenantId: string; leadId: string; page: number;
    pageSize: number }): Promise<{
      rows: readonly TenantDouyinFollowUpBundle[]; total: number;
    }>;
  listAppointments(input: { tenantId: string; leadId: string; page: number;
    pageSize: number }): Promise<{
      rows: readonly TenantDouyinAppointmentDetailRow[];
      total: number;
    }>;
  findConversionPreflight(input: { tenantId: string; leadId: string }): Promise<{
    leadId: string; phone: string; assignedEmployeeId: string | null;
    customerId: string | null;
  } | null>;
  findEmployeeAccess(input: { tenantId: string; employeeId: string }): Promise<{
    id: string; tenant_id: string; tenant_department_id: string | null;
    status: string | null;
  } | null>;
  assign(input: CommandBase & { assignedEmployeeId: string;
    expectedAssigneeDepartmentId: string | null }):
    Promise<TenantDouyinLeadCommandResult>;
  appendFollowUp(input: CommandBase & {
    appointmentId: string | null; followUpType: string; summary: string; result: string;
    nextFollowUpAt: string | null; appointmentStatus: string | null;
    confirmedVisitAt: string | null;
  }): Promise<TenantDouyinLeadCommandResult>;
  convert(input: CommandBase & { expectedCustomerId: string | null;
    allowCustomerCreate: boolean }): Promise<TenantDouyinLeadCommandResult>;
  markInvalid(input: CommandBase & { reason: string }):
    Promise<TenantDouyinLeadCommandResult>;
};
type AccessPolicyPort = {
  assertTenantContext(authContext: AuthContext): string;
  assertPermission(authContext: AuthContext, permission: string):
    EffectivePermission["scope"] | null;
  getVisibleCustomerOwnerIds(authContext: AuthContext, permission: string):
    Promise<string[] | null>;
  canAccessEmployee(authContext: AuthContext, target: {
    id: string; tenant_id: string | null; tenant_department_id?: string | null;
  }, permission: string): boolean;
};
type PhonePrivacyPort = TenantDouyinLeadPhonePrivacyPort;
type CommandBase = {
  tenantId: string; leadId: string; actorEmployeeId: string;
  expectedVersion: number; idempotencyKey: string;
};

// Shared workflow lives at its historical import path to preserve legacy
// consumers. Only server composition selects the permission/schema profile.
export class TenantDouyinLeadsService {
  constructor(private readonly dependencies: {
    readonly repository: RepositoryPort;
    readonly accessPolicy: AccessPolicyPort;
    readonly phonePrivacy: PhonePrivacyPort;
  }, private readonly permissionResource: "douyin_lead" | "customer_lead" = "douyin_lead") {}

  private permission(action: LeadAction): string {
    return permissionFor(action).replace("douyin_lead", this.permissionResource);
  }

  async list(authContext: AuthContext, input: TenantDouyinLeadListQueryInput) {
    const { rows, tenantId, page, pageSize, total } = await this.listBundles(authContext, input);
    return { list: rows.map((bundle) => serializeLeadBundle({ bundle, tenantId,
      phonePrivacy: this.dependencies.phonePrivacy, includeDetail: false })),
    pagination: pagination(page, pageSize, total) };
  }

  async listBundles(authContext: AuthContext, input: CustomerLeadListQueryInput) {
    const { tenantId, visibleAssigneeIds } = await this.requireRead(
      authContext,
      "list",
    );
    const query = this.permissionResource === "customer_lead"
      ? parseRequest(CustomerLeadListQuerySchema, input)
      : parseRequest(TenantDouyinLeadListQuerySchema, input);
    if (visibleAssigneeIds !== null && visibleAssigneeIds.length === 0) {
      return { rows: [], tenantId, ...query, total: 0 };
    }
    const result = await this.dependencies.repository.listLeads({
      tenantId, ...query, visibleAssigneeIds,
    });
    assertTotal(result.total);
    return { ...result, tenantId, ...query };
  }

  async listAssigneeCandidates(authContext: AuthContext,
    input: TenantDouyinLeadAssigneeCandidatesQueryInput) {
    return listTenantDouyinLeadAssigneeCandidates({ authContext, query: input,
      dependencies: this.dependencies, permissionResource: this.permissionResource });
  }

  async listAssigneeFilterOptions(authContext: AuthContext,
    input: TenantDouyinLeadAssigneeFilterOptionsQueryInput) {
    return listTenantDouyinLeadAssigneeFilterOptions({ authContext, query: input,
      dependencies: this.dependencies, permissionResource: this.permissionResource });
  }

  async getDetail(authContext: AuthContext, leadId: string) {
    const { detail, tenantId, id } = await this.getDetailBundle(authContext, leadId);
    const serialized = serializeLeadBundle({ bundle: detail, tenantId,
      phonePrivacy: this.dependencies.phonePrivacy, includeDetail: true });
    return { ...serialized,
      appointments: { list: detail.appointments.map((row) =>
        serializePublicAppointment(row, { includeSource: true })),
      pagination: pagination(1, 20, detail.appointmentTotal),
      truncated: detail.appointmentTotal > detail.appointments.length },
      follow_ups: { list: detail.followUps.map((row) =>
        serializeFollowUpBundle(row, tenantId, id)),
      pagination: pagination(1, 20, detail.followUpTotal) } };
  }

  async getDetailBundle(authContext: AuthContext, leadId: string) {
    const { tenantId, visibleAssigneeIds } = await this.requireRead(
      authContext,
      "detail",
    );
    const id = parseLeadId(leadId);
    const access = await this.dependencies.repository.findLeadAccess({
      tenantId,
      leadId: id,
    });
    if (!access || access.id !== id || access.tenant_id !== tenantId
      || !isVisibleAssignee(access.assigned_employee_id, visibleAssigneeIds)) {
      throwLeadNotFound();
    }
    const detail = await this.dependencies.repository.getLeadDetail({
      tenantId, leadId: id,
    });
    if (!detail || !isVisibleAssignee(
      detail.lead.assigned_employee_id,
      visibleAssigneeIds,
    )) throwLeadNotFound();
    assertTotal(detail.appointmentTotal);
    assertTotal(detail.followUpTotal);
    return { detail, tenantId, id };
  }

  async listAppointments(authContext: AuthContext, leadId: string,
    input: TenantDouyinLeadAppointmentListQueryInput) {
    const { tenantId, visibleAssigneeIds } = await this.requireRead(
      authContext,
      "appointment_list",
    );
    const id = parseLeadId(leadId);
    const query = parseRequest(TenantDouyinLeadAppointmentListQuerySchema, input);
    await this.assertReadableLead(tenantId, id, visibleAssigneeIds);
    const result = await this.dependencies.repository.listAppointments({
      tenantId, leadId: id, ...query,
    });
    assertTotal(result.total);
    return { list: result.rows.map((row) =>
      serializePublicAppointment(row, { includeSource: true })),
    pagination: pagination(query.page, query.pageSize, result.total) };
  }

  async listFollowUps(authContext: AuthContext, leadId: string,
    input: TenantDouyinLeadFollowUpListQueryInput) {
    const { rows, tenantId, id, page, pageSize, total } = await this.listFollowUpBundles(authContext, leadId, input);
    return { list: rows.map((row) => serializeFollowUpBundle(row, tenantId, id)),
      pagination: pagination(page, pageSize, total) };
  }

  async listFollowUpBundles(authContext: AuthContext, leadId: string,
    input: TenantDouyinLeadFollowUpListQueryInput) {
    const { tenantId, visibleAssigneeIds } = await this.requireRead(
      authContext,
      "follow_up_list",
    );
    const id = parseLeadId(leadId);
    const query = parseRequest(TenantDouyinLeadFollowUpListQuerySchema, input);
    await this.assertReadableLead(tenantId, id, visibleAssigneeIds);
    const result = await this.dependencies.repository.listFollowUps({
      tenantId, leadId: id, ...query,
    });
    assertTotal(result.total);
    return { ...result, tenantId, id, ...query };
  }

  async assign(authContext: AuthContext, leadId: string,
    input: TenantDouyinLeadAssign) {
    const context = await this.commandContext(authContext, "assign", leadId);
    const body = parseRequest(TenantDouyinLeadAssignSchema, input);
    const expectedAssigneeDepartmentId = context.scope === "department"
      ? authContext.tenantDepartmentId : null;
    if (context.scope === "department" && !expectedAssigneeDepartmentId) {
      throw Errors.forbidden();
    }
    if (context.scope !== "all") {
      const target = await this.dependencies.repository.findEmployeeAccess({
        tenantId: context.tenantId, employeeId: body.assigned_employee_id,
      });
      if (target && (target.id !== body.assigned_employee_id
        || target.tenant_id !== context.tenantId)) throwInvalidResponse();
      if (!target || !this.dependencies.accessPolicy.canAccessEmployee(
        authContext, target, this.permission("assign"),
      )) throw Errors.forbidden();
    }
    const result = await this.dependencies.repository.assign({
      ...commandBase(context), assignedEmployeeId: body.assigned_employee_id,
      expectedAssigneeDepartmentId,
      expectedVersion: body.expected_lead_version,
      idempotencyKey: body.idempotency_key,
    });
    const data = unwrapCommand(result);
    if (data.action !== "assign" || data.lead_id !== context.leadId
      || data.assigned_employee_id !== body.assigned_employee_id) {
      throwInvalidResponse();
    }
    return data;
  }

  async appendFollowUp(authContext: AuthContext, leadId: string,
    input: TenantDouyinLeadFollowUp | CustomerLeadFollowUpInput) {
    const context = await this.commandContext(authContext, "follow_up", leadId);
    const body = this.permissionResource === "customer_lead"
      ? parseRequest(CustomerLeadFollowUpSchema, input)
      : parseRequest(TenantDouyinLeadFollowUpSchema, input);
    const result = await this.dependencies.repository.appendFollowUp({
      ...commandBase(context), appointmentId: body.appointment_id,
      followUpType: body.follow_up_type, summary: body.summary,
      result: body.result, nextFollowUpAt: body.next_follow_up_at,
      appointmentStatus: body.appointment_status,
      confirmedVisitAt: body.confirmed_visit_at,
      expectedVersion: body.expected_lead_version,
      idempotencyKey: body.idempotency_key,
    });
    const data = unwrapCommand(result);
    if (data.action !== "follow_up" || data.lead_id !== context.leadId
      || data.appointment_id !== body.appointment_id) throwInvalidResponse();
    return data;
  }

  async convert(authContext: AuthContext, leadId: string,
    input: TenantDouyinLeadConvert) {
    const context = await this.commandContext(authContext, "convert", leadId);
    const body = parseRequest(TenantDouyinLeadConvertSchema, input);
    const preflight = await this.dependencies.repository.findConversionPreflight({
      tenantId: context.tenantId, leadId: context.leadId,
    });
    if (!preflight) throwLeadNotFound();
    if (preflight.leadId !== context.leadId
      || !isVisibleAssignee(preflight.assignedEmployeeId,
        context.visibleAssigneeIds)) throwLeadNotFound();
    let allowCustomerCreate = false;
    if (preflight.customerId === null) {
      const createScope = this.dependencies.accessPolicy.assertPermission(
        authContext,
        "customer.create",
      );
      const finalOwnerId = preflight.assignedEmployeeId
        ?? context.actorEmployeeId;
      if (!createScope
        || (createScope !== "all" && finalOwnerId !== context.actorEmployeeId)) {
        throw Errors.forbidden();
      }
      allowCustomerCreate = true;
    }
    const result = await this.dependencies.repository.convert({
      ...commandBase(context), expectedVersion: body.expected_lead_version,
      idempotencyKey: body.idempotency_key,
      expectedCustomerId: preflight.customerId,
      allowCustomerCreate,
    });
    const data = unwrapCommand(result);
    if (data.action !== "convert" || data.lead_id !== context.leadId
      || (data.created_customer && data.repeated_conversion)
      || (data.created_customer && !allowCustomerCreate && !data.idempotent)
      || (data.repeated_conversion && allowCustomerCreate)
      || (preflight.customerId !== null
        && (data.customer_id !== preflight.customerId || (data.created_customer && !data.idempotent)))) {
      throwInvalidResponse();
    }
    return data;
  }

  async markInvalid(authContext: AuthContext, leadId: string,
    input: TenantDouyinLeadMarkInvalid) {
    const context = await this.commandContext(authContext, "mark_invalid", leadId);
    const body = parseRequest(TenantDouyinLeadMarkInvalidSchema, input);
    const result = await this.dependencies.repository.markInvalid({
      ...commandBase(context), reason: body.reason,
      expectedVersion: body.expected_lead_version,
      idempotencyKey: body.idempotency_key,
    });
    const data = unwrapCommand(result);
    if (data.action !== "mark_invalid" || data.lead_id !== context.leadId) {
      throwInvalidResponse();
    }
    return data;
  }

  private requireAction(authContext: AuthContext, action: LeadAction) {
    const tenantId = this.dependencies.accessPolicy.assertTenantContext(authContext);
    if (this.permissionResource === "customer_lead" && !authContext.employeeId) {
      throw Errors.business(403, "当前操作需要员工身份", "DOUYIN_LEAD_EMPLOYEE_REQUIRED");
    }
    this.dependencies.accessPolicy.assertPermission(
      authContext,
      this.permission(action),
    );
    return tenantId;
  }

  private async requireRead(
    authContext: AuthContext,
    action: Extract<LeadAction, "list" | "detail" | "appointment_list" |
      "follow_up_list">,
  ) {
    const tenantId = this.requireAction(authContext, action);
    const visibleAssigneeIds = await this.dependencies.accessPolicy
      .getVisibleCustomerOwnerIds(authContext, this.permission(action));
    return { tenantId, visibleAssigneeIds };
  }

  private async assertReadableLead(tenantId: string, leadId: string,
    visibleAssigneeIds: readonly string[] | null): Promise<void> {
    const access = await this.dependencies.repository.findLeadAccess({
      tenantId, leadId,
    });
    if (!access || access.id !== leadId || access.tenant_id !== tenantId
      || !isVisibleAssignee(access.assigned_employee_id, visibleAssigneeIds)) {
      throwLeadNotFound();
    }
  }

  private async commandContext(authContext: AuthContext,
    action: Extract<LeadAction, "assign" | "follow_up" | "convert" |
      "mark_invalid">, leadId: string): Promise<CommandBase & {
        scope: EffectivePermission["scope"];
        visibleAssigneeIds: readonly string[] | null;
      }> {
    const tenantId = this.dependencies.accessPolicy
      .assertTenantContext(authContext);
    const permission = this.permission(action);
    const scope = this.dependencies.accessPolicy.assertPermission(
      authContext, permission,
    );
    const id = parseLeadId(leadId);
    if (!authContext.employeeId || !scope) {
      throw Errors.business(403, "当前操作需要员工身份",
        "DOUYIN_LEAD_EMPLOYEE_REQUIRED");
    }
    let visibleAssigneeIds = await this.dependencies.accessPolicy
      .getVisibleCustomerOwnerIds(authContext, permission);
    if (this.permissionResource === "customer_lead") {
      const read = await this.requireRead(authContext, "detail");
      const readIds = read.visibleAssigneeIds;
      visibleAssigneeIds = visibleAssigneeIds === null ? readIds
        : readIds === null ? visibleAssigneeIds
          : visibleAssigneeIds.filter((employeeId) => readIds.includes(employeeId));
    }
    const access = await this.dependencies.repository.findLeadAccess({
      tenantId, leadId: id,
    });
    if (!access || access.id !== id || access.tenant_id !== tenantId
      || !isVisibleAssignee(access.assigned_employee_id, visibleAssigneeIds)) {
      throwLeadNotFound();
    }
    return { tenantId, leadId: id, actorEmployeeId: authContext.employeeId,
      expectedVersion: 0, idempotencyKey: "", scope, visibleAssigneeIds };
  }
}

function commandBase(input: CommandBase): CommandBase {
  return {
    tenantId: input.tenantId,
    leadId: input.leadId,
    actorEmployeeId: input.actorEmployeeId,
    expectedVersion: input.expectedVersion,
    idempotencyKey: input.idempotencyKey,
  };
}

export const tenantDouyinLeadsService = new TenantDouyinLeadsService({
  repository: tenantDouyinLeadsRepository,
  accessPolicy: accessPolicyService,
  phonePrivacy: customerPhonePrivacyService,
});
