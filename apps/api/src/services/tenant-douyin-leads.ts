import { Errors } from "@/errors/error-factory";
import type {
  TenantDouyinLeadCommandData,
  TenantDouyinLeadCommandError,
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
  TenantDouyinLeadConvertSchema,
  TenantDouyinLeadFollowUpListQuerySchema,
  TenantDouyinLeadFollowUpSchema,
  TenantDouyinLeadListQuerySchema,
  TenantDouyinLeadMarkInvalidSchema,
  TenantDouyinLeadParamsSchema,
  type TenantDouyinLeadAssign,
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
import {
  customerPhonePrivacyService,
  type CustomerPhonePrivacyContext,
} from "@/services/customer-phone-privacy";
import {
  serializeFollowUpBundle,
  serializeLeadBundle,
  type TenantDouyinLeadPhonePrivacyPort,
} from "@/services/tenant-douyin-leads-serializer";
import type { z } from "zod";

type LeadAction =
  | "list" | "detail" | "follow_up_list" | "assign"
  | "follow_up" | "convert" | "mark_invalid";
const ACTION_PERMISSIONS = {
  list: "douyin_lead.read",
  detail: "douyin_lead.read",
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
  listLeads(input: TenantDouyinLeadListQuery & {
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
      appointmentTotal: number;
      followUps: readonly TenantDouyinFollowUpBundle[];
      followUpTotal: number;
    }) | null
  >;
  listFollowUps(input: { tenantId: string; leadId: string; page: number;
    pageSize: number }): Promise<{
      rows: readonly TenantDouyinFollowUpBundle[]; total: number;
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
    appointmentId: string; followUpType: string; summary: string; result: string;
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
type PhonePrivacyPort = TenantDouyinLeadPhonePrivacyPort & {
  createPrivacyContext(authContext: AuthContext):
    Promise<CustomerPhonePrivacyContext>;
};
type CommandBase = {
  tenantId: string; leadId: string; actorEmployeeId: string;
  expectedVersion: number; idempotencyKey: string;
};

export class TenantDouyinLeadsService {
  constructor(private readonly dependencies: {
    readonly repository: RepositoryPort;
    readonly accessPolicy: AccessPolicyPort;
    readonly phonePrivacy: PhonePrivacyPort;
  }) {}

  async list(authContext: AuthContext, input: TenantDouyinLeadListQueryInput) {
    const { tenantId, visibleAssigneeIds } = await this.requireRead(
      authContext,
      "list",
    );
    const query = parseRequest(TenantDouyinLeadListQuerySchema, input);
    if (visibleAssigneeIds !== null && visibleAssigneeIds.length === 0) {
      return { list: [], pagination: pagination(query.page, query.pageSize, 0) };
    }
    const result = await this.dependencies.repository.listLeads({
      tenantId, ...query, visibleAssigneeIds,
    });
    assertTotal(result.total);
    const phoneContext = await this.dependencies.phonePrivacy
      .createPrivacyContext(authContext);
    return {
      list: result.rows.map((bundle) => serializeLeadBundle({
        bundle, tenantId, phoneContext,
        phonePrivacy: this.dependencies.phonePrivacy,
        includeDetail: false,
      })),
      pagination: pagination(query.page, query.pageSize, result.total),
    };
  }

  async getDetail(authContext: AuthContext, leadId: string) {
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
    const phoneContext = await this.dependencies.phonePrivacy
      .createPrivacyContext(authContext);
    const serialized = serializeLeadBundle({ bundle: detail, tenantId,
      phoneContext, phonePrivacy: this.dependencies.phonePrivacy,
      includeDetail: true });
    return {
      ...serialized,
      appointments: {
        list: [...detail.appointments],
        pagination: pagination(1, 20, detail.appointmentTotal),
        truncated: detail.appointmentTotal > detail.appointments.length,
      },
      follow_ups: {
        list: detail.followUps.map((row) =>
          serializeFollowUpBundle(row, tenantId, id)),
        pagination: pagination(1, 20, detail.followUpTotal),
      },
    };
  }

  async listFollowUps(authContext: AuthContext, leadId: string,
    input: TenantDouyinLeadFollowUpListQueryInput) {
    const { tenantId, visibleAssigneeIds } = await this.requireRead(
      authContext,
      "follow_up_list",
    );
    const id = parseLeadId(leadId);
    const query = parseRequest(TenantDouyinLeadFollowUpListQuerySchema, input);
    const access = await this.dependencies.repository.findLeadAccess({
      tenantId,
      leadId: id,
    });
    if (!access || access.id !== id || access.tenant_id !== tenantId
      || !isVisibleAssignee(access.assigned_employee_id, visibleAssigneeIds)) {
      throwLeadNotFound();
    }
    const result = await this.dependencies.repository.listFollowUps({
      tenantId, leadId: id, ...query,
    });
    assertTotal(result.total);
    return {
      list: result.rows.map((row) => serializeFollowUpBundle(row, tenantId, id)),
      pagination: pagination(query.page, query.pageSize, result.total),
    };
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
        authContext, target, permissionFor("assign"),
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
    input: TenantDouyinLeadFollowUp) {
    const context = await this.commandContext(authContext, "follow_up", leadId);
    const body = parseRequest(TenantDouyinLeadFollowUpSchema, input);
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
      || (data.created_customer && !allowCustomerCreate)
      || (data.repeated_conversion && allowCustomerCreate)
      || (preflight.customerId !== null
        && (data.customer_id !== preflight.customerId || data.created_customer))) {
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
    this.dependencies.accessPolicy.assertPermission(
      authContext,
      permissionFor(action),
    );
    return tenantId;
  }

  private async requireRead(
    authContext: AuthContext,
    action: Extract<LeadAction, "list" | "detail" | "follow_up_list">,
  ) {
    const tenantId = this.requireAction(authContext, action);
    const visibleAssigneeIds = await this.dependencies.accessPolicy
      .getVisibleCustomerOwnerIds(authContext, permissionFor(action));
    return { tenantId, visibleAssigneeIds };
  }

  private async commandContext(authContext: AuthContext,
    action: Extract<LeadAction, "assign" | "follow_up" | "convert" |
      "mark_invalid">, leadId: string): Promise<CommandBase & {
        scope: EffectivePermission["scope"];
        visibleAssigneeIds: readonly string[] | null;
      }> {
    const tenantId = this.dependencies.accessPolicy
      .assertTenantContext(authContext);
    const permission = permissionFor(action);
    const scope = this.dependencies.accessPolicy.assertPermission(
      authContext, permission,
    );
    const id = parseLeadId(leadId);
    if (!authContext.employeeId || !scope) {
      throw Errors.business(403, "当前操作需要员工身份",
        "DOUYIN_LEAD_EMPLOYEE_REQUIRED");
    }
    const visibleAssigneeIds = await this.dependencies.accessPolicy
      .getVisibleCustomerOwnerIds(authContext, permission);
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

function parseRequest<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw Errors.fromZod(result.error);
  return result.data;
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

function parseLeadId(leadId: string): string {
  return parseRequest(TenantDouyinLeadParamsSchema, { id: leadId }).id;
}

function pagination(page: number, pageSize: number, total: number) {
  return { page, pageSize, total,
    totalPages: total === 0 ? 0 : Math.ceil(total / pageSize) };
}

function isVisibleAssignee(
  assignedEmployeeId: string | null,
  visibleAssigneeIds: readonly string[] | null,
): boolean {
  return visibleAssigneeIds === null
    || (assignedEmployeeId !== null
      && visibleAssigneeIds.includes(assignedEmployeeId));
}

function assertTotal(total: number): void {
  if (!Number.isInteger(total) || total < 0) throwInvalidResponse();
}

function unwrapCommand(result: TenantDouyinLeadCommandResult) {
  if (!result.ok) throwCommandError(result.error);
  return result.data;
}

function throwCommandError(error: TenantDouyinLeadCommandError): never {
  throw Errors.business(error.status_code, commandErrorMessage(error.code), error.code);
}

function commandErrorMessage(code: TenantDouyinLeadCommandError["code"]): string {
  if (code === "DOUYIN_LEAD_NOT_FOUND") return "抖音线索不存在";
  if (code === "DOUYIN_MEASUREMENT_APPOINTMENT_NOT_FOUND") return "量房预约不存在";
  if (code === "DOUYIN_LEAD_ASSIGNEE_NOT_FOUND") return "负责人不存在或不可用";
  if (code === "DOUYIN_LEAD_ASSIGNEE_SCOPE_CONFLICT") {
    return "负责人部门已变化，请刷新后重试";
  }
  if (code === "DOUYIN_LEAD_VERSION_CONFLICT") return "线索已更新，请刷新后重试";
  if (code === "DOUYIN_LEAD_IDEMPOTENCY_CONFLICT") return "幂等键已用于其他请求";
  if (code === "DOUYIN_LEAD_CUSTOMER_PREFLIGHT_CONFLICT") {
    return "客户状态已变化，请刷新后重试";
  }
  if (code === "DOUYIN_MEASUREMENT_APPOINTMENT_TRANSITION_INVALID") {
    return "量房预约状态不能这样变更";
  }
  if (code === "DOUYIN_LEAD_CONVERTED_NOT_INVALIDATABLE") {
    return "已转化线索不能标记为无效";
  }
  if (code === "DOUYIN_LEAD_INVALID_NOT_CONVERTIBLE") return "无效线索不能转为客户";
  if (code === "DOUYIN_LEAD_NOT_ASSIGNABLE") return "当前线索不能分配";
  if (code === "DOUYIN_LEAD_NOT_FOLLOWABLE") return "当前线索不能继续跟进";
  if (code === "DOUYIN_LEAD_ACTOR_NOT_FOUND") return "当前员工不可用";
  if (code.endsWith("_COMMAND_INVALID")) return "线索操作参数无效";
  return "抖音线索操作失败";
}

function throwLeadNotFound(): never {
  throw Errors.business(404, "抖音线索不存在", "DOUYIN_LEAD_NOT_FOUND");
}

function throwInvalidResponse(): never {
  throw Errors.business(500, "抖音线索响应数据无效",
    "DOUYIN_LEAD_RESPONSE_INVALID");
}

export const tenantDouyinLeadsService = new TenantDouyinLeadsService({
  repository: tenantDouyinLeadsRepository,
  accessPolicy: accessPolicyService,
  phonePrivacy: customerPhonePrivacyService,
});
