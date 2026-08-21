import { z } from "zod";

import { AppError } from "@/errors/app-error";
import { Errors } from "@/errors/error-factory";
import {
  TenantDouyinAppointmentDetailRowSchema,
  TenantDouyinAppointmentSummaryRowSchema,
  TenantDouyinCustomerRowSchema,
  TenantDouyinEmployeeRowSchema,
  TenantDouyinFollowUpRowSchema,
  TenantDouyinLeadCommandEnvelopeSchema,
  TenantDouyinLeadRowSchema,
  type TenantDouyinAppointmentRow,
  type TenantDouyinCustomerRow,
  type TenantDouyinEmployeeRow,
  type TenantDouyinLeadCommandData,
  type TenantDouyinLeadCommandResult,
  type TenantDouyinLeadRow,
} from "@/repositories/tenant-douyin-leads-contract";
import {
  RELATED_IDS_PER_BATCH,
  chunkValues,
  hydrateFollowUps,
  hydrateLeadBundles,
} from "@/repositories/tenant-douyin-leads-hydration";
import type { TenantDouyinLeadListQuery } from
  "@/schema/tenant-douyin-leads";
import type { Json } from "@/types/database";
import { SupabaseDB } from "@/utils/supabase";

const LEAD_FIELDS = [
  "id", "tenant_id", "douyin_miniapp_installation_id", "customer_id",
  "assigned_employee_id", "name", "phone", "community", "lead_status",
  "created_at", "followed_at", "follow_remark", "version",
].join(",");
const LEAD_DETAIL_FIELDS = `${LEAD_FIELDS},form_data`;
const APPOINTMENT_FIELDS = [
  "id", "appointment_no", "tenant_id", "marketing_lead_id", "customer_id",
  "assigned_employee_id", "budget_estimate_id", "preferred_visit_date",
  "preferred_visit_period", "community", "status", "confirmed_visit_at",
  "source_snapshot", "created_at", "updated_at", "version",
].join(",");
const CUSTOMER_FIELDS = "id,tenant_id,name,status,owner_id";
const EMPLOYEE_FIELDS = "id,tenant_id,name,avatar,status";
const FOLLOW_UP_FIELDS = [
  "id", "tenant_id", "marketing_lead_id",
  "douyin_measurement_appointment_id", "employee_id", "follow_up_type",
  "summary", "result", "next_follow_up_at", "created_at",
].join(",");
const PRE_FLIGHT_FIELDS = "id,tenant_id,phone,customer_id";
const PreflightLeadSchema = z.strictObject({
  id: z.uuid(), tenant_id: z.uuid(),
  phone: z.string().regex(/^1[3-9]\d{9}$/), customer_id: z.uuid().nullable(),
  assigned_employee_id: z.uuid().nullable(),
});

type DatabaseResult = {
  readonly data: unknown;
  readonly error: unknown;
  readonly count?: number | null;
};
export interface TenantDouyinLeadsQuery extends PromiseLike<DatabaseResult> {
  select(...args: unknown[]): TenantDouyinLeadsQuery;
  eq(...args: unknown[]): TenantDouyinLeadsQuery;
  gte(...args: unknown[]): TenantDouyinLeadsQuery;
  lt(...args: unknown[]): TenantDouyinLeadsQuery;
  lte(...args: unknown[]): TenantDouyinLeadsQuery;
  or(...args: unknown[]): TenantDouyinLeadsQuery;
  in(...args: unknown[]): TenantDouyinLeadsQuery;
  order(...args: unknown[]): TenantDouyinLeadsQuery;
  range(...args: unknown[]): TenantDouyinLeadsQuery;
  limit(...args: unknown[]): TenantDouyinLeadsQuery;
  maybeSingle(): Promise<DatabaseResult>;
}
type CommandName =
  | "assign_douyin_lead"
  | "append_douyin_lead_follow_up"
  | "convert_douyin_lead_to_customer"
  | "list_tenant_douyin_lead_latest_appointments"
  | "mark_douyin_lead_invalid";
export interface TenantDouyinLeadsDatabaseClient {
  from(table: string): TenantDouyinLeadsQuery;
  rpc(
    name: CommandName,
    args: Readonly<Record<string, Json | undefined>>,
  ): Promise<DatabaseResult>;
}

type ScopedLeadListInput = TenantDouyinLeadListQuery & {
  readonly tenantId: string;
  readonly visibleAssigneeIds: readonly string[] | null;
};
type CommandBaseInput = {
  readonly tenantId: string;
  readonly leadId: string;
  readonly actorEmployeeId: string;
  readonly expectedVersion: number;
  readonly idempotencyKey: string;
};
type ConvertCommandInput = CommandBaseInput & {
  readonly expectedCustomerId: string | null;
  readonly allowCustomerCreate: boolean;
};

export class TenantDouyinLeadsRepository {
  constructor(private readonly configuredClient?: TenantDouyinLeadsDatabaseClient) {}

  private get client(): TenantDouyinLeadsDatabaseClient {
    return this.configuredClient ?? SupabaseDB.getAdminClient() as unknown as
      TenantDouyinLeadsDatabaseClient;
  }

  async listLeads(input: ScopedLeadListInput) {
    if (input.visibleAssigneeIds !== null
      && (input.visibleAssigneeIds.length === 0
        || (input.assigneeId !== undefined
          && !input.visibleAssigneeIds.includes(input.assigneeId)))) {
      return { rows: [], total: 0 };
    }
    const offset = (input.page - 1) * input.pageSize;
    const result = await executeDatabase(async () => {
      let query = this.client.from("marketing_leads")
        .select(LEAD_FIELDS, { count: "exact" })
        .eq("tenant_id", input.tenantId)
        .eq("source", "douyin_miniapp");
      if (input.status) query = query.eq("lead_status", input.status);
      if (input.assigneeId) {
        query = query.eq("assigned_employee_id", input.assigneeId);
      }
      if (input.visibleAssigneeIds !== null) {
        query = query.in("assigned_employee_id", input.visibleAssigneeIds);
      }
      if (input.dateFrom) {
        query = query.gte("created_at", `${input.dateFrom}T00:00:00+08:00`);
      }
      if (input.dateTo) {
        query = query.lt("created_at", `${nextIsoDate(input.dateTo)}T00:00:00+08:00`);
      }
      if (input.keyword) {
        const pattern = `%${input.keyword}%`;
        query = query.or(
          `name.ilike.${pattern},phone.ilike.${pattern},community.ilike.${pattern}`,
        );
      }
      return await query.order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(offset, offset + input.pageSize - 1);
    }, "查询抖音线索失败");
    assertDatabaseSuccess(result, "查询抖音线索失败");
    const total = parseExactCount(result.count, "查询抖音线索总数失败");
    const leads = parseData(z.array(TenantDouyinLeadRowSchema),
      result.data ?? [], "解析抖音线索失败");
    if (leads.length === 0) return { rows: [], total };

    const [appointments, customers, employees] = await Promise.all([
      this.loadLatestAppointments(input.tenantId, leads.map((lead) => lead.id)),
      this.loadCustomers(input.tenantId, compactIds(leads, "customer_id")),
      this.loadEmployees(
        input.tenantId,
        compactIds(leads, "assigned_employee_id"),
      ),
    ]);
    return {
      rows: safeHydrateLeadBundles({ leads, appointments, customers, employees }),
      total,
    };
  }

  async getLeadDetail(input: { tenantId: string; leadId: string }) {
    const leadResult = await executeDatabase(
      () => this.client.from("marketing_leads").select(LEAD_DETAIL_FIELDS)
        .eq("tenant_id", input.tenantId).eq("source", "douyin_miniapp")
        .eq("id", input.leadId).maybeSingle(),
      "查询抖音线索详情失败",
    );
    assertDatabaseSuccess(leadResult, "查询抖音线索详情失败");
    if (leadResult.data === null) return null;
    const lead = parseData(TenantDouyinLeadRowSchema, leadResult.data,
      "解析抖音线索详情失败");
    const [appointmentPage, customers, employees, followUps] = await Promise.all([
      this.listAppointments(input),
      this.loadCustomers(input.tenantId, compactIds([lead], "customer_id")),
      this.loadEmployees(input.tenantId,
        compactIds([lead], "assigned_employee_id")),
      this.listFollowUps({ ...input, page: 1, pageSize: 20 }),
    ]);
    const bundle = safeHydrateLeadBundles({ leads: [lead],
      appointments: appointmentPage.rows,
      customers, employees })[0];
    if (!bundle) throw Errors.dbError("解析抖音线索详情失败");
    return { ...bundle, appointmentTotal: appointmentPage.total,
      followUps: followUps.rows,
      followUpTotal: followUps.total };
  }

  async findLeadAccess(input: { tenantId: string; leadId: string }) {
    const result = await executeDatabase(
      () => this.client.from("marketing_leads")
        .select("id,tenant_id,assigned_employee_id")
        .eq("tenant_id", input.tenantId).eq("source", "douyin_miniapp")
        .eq("id", input.leadId).maybeSingle(),
      "查询抖音线索访问范围失败",
    );
    assertDatabaseSuccess(result, "查询抖音线索访问范围失败");
    if (result.data === null) return null;
    return parseData(z.strictObject({
      id: z.uuid(), tenant_id: z.uuid(),
      assigned_employee_id: z.uuid().nullable(),
    }), result.data, "解析抖音线索访问范围失败");
  }

  async findEmployeeAccess(input: { tenantId: string; employeeId: string }) {
    const result = await executeDatabase(
      () => this.client.from("employees")
        .select("id,tenant_id,tenant_department_id,status")
        .eq("tenant_id", input.tenantId).eq("id", input.employeeId)
        .maybeSingle(),
      "查询负责人访问范围失败",
    );
    assertDatabaseSuccess(result, "查询负责人访问范围失败");
    if (result.data === null) return null;
    return parseData(z.strictObject({ id: z.uuid(), tenant_id: z.uuid(),
      tenant_department_id: z.uuid().nullable(), status: z.string().nullable() }),
    result.data, "解析负责人访问范围失败");
  }

  async listFollowUps(input: {
    tenantId: string; leadId: string; page: number; pageSize: number;
  }) {
    const offset = (input.page - 1) * input.pageSize;
    const result = await executeDatabase(
      () => this.client.from("douyin_lead_follow_ups")
        .select(FOLLOW_UP_FIELDS, { count: "exact" })
        .eq("tenant_id", input.tenantId)
        .eq("marketing_lead_id", input.leadId)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(offset, offset + input.pageSize - 1),
      "查询抖音线索跟进记录失败",
    );
    assertDatabaseSuccess(result, "查询抖音线索跟进记录失败");
    const total = parseExactCount(result.count, "查询跟进记录总数失败");
    const rows = parseData(z.array(TenantDouyinFollowUpRowSchema),
      result.data ?? [], "解析抖音线索跟进记录失败");
    const employees = await this.loadEmployees(
      input.tenantId,
      [...new Set(rows.map((row) => row.employee_id))],
    );
    return { rows: hydrateFollowUps(rows, employees), total };
  }

  async findConversionPreflight(input: { tenantId: string; leadId: string }) {
    const leadResult = await executeDatabase(
      () => this.client.from("marketing_leads")
        .select(`${PRE_FLIGHT_FIELDS},assigned_employee_id`)
        .eq("tenant_id", input.tenantId).eq("source", "douyin_miniapp")
        .eq("id", input.leadId).maybeSingle(),
      "查询抖音线索转化条件失败",
    );
    assertDatabaseSuccess(leadResult, "查询抖音线索转化条件失败");
    if (leadResult.data === null) return null;
    const lead = parseData(PreflightLeadSchema, leadResult.data,
      "解析抖音线索转化条件失败");
    const customerResult = await executeDatabase(
      () => this.client.from("customers").select(CUSTOMER_FIELDS)
        .eq("tenant_id", input.tenantId).eq("phone", lead.phone)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true }).limit(1).maybeSingle(),
      "查询抖音线索关联客户失败",
    );
    assertDatabaseSuccess(customerResult, "查询抖音线索关联客户失败");
    const customer = customerResult.data === null ? null : parseData(
      TenantDouyinCustomerRowSchema, customerResult.data,
      "解析抖音线索关联客户失败",
    );
    return { leadId: lead.id, phone: lead.phone,
      assignedEmployeeId: lead.assigned_employee_id,
      customerId: customer?.id ?? null };
  }

  assign(input: CommandBaseInput & { assignedEmployeeId: string;
    expectedAssigneeDepartmentId: string | null }) {
    return this.runCommand("assign_douyin_lead", "assign", {
      p_tenant_id: input.tenantId, p_marketing_lead_id: input.leadId,
      p_actor_employee_id: input.actorEmployeeId,
      p_assigned_employee_id: input.assignedEmployeeId,
      p_expected_version: input.expectedVersion,
      p_idempotency_key: input.idempotencyKey,
      p_expected_assignee_department_id: input.expectedAssigneeDepartmentId,
    });
  }

  appendFollowUp(input: CommandBaseInput & {
    appointmentId: string; followUpType: string; summary: string; result: string;
    nextFollowUpAt: string | null; appointmentStatus: string | null;
    confirmedVisitAt: string | null;
  }) {
    return this.runCommand("append_douyin_lead_follow_up", "follow_up", {
      p_tenant_id: input.tenantId, p_marketing_lead_id: input.leadId,
      p_appointment_id: input.appointmentId,
      p_actor_employee_id: input.actorEmployeeId,
      p_follow_up_type: input.followUpType, p_summary: input.summary,
      p_result: input.result, p_next_follow_up_at: input.nextFollowUpAt,
      p_appointment_status: input.appointmentStatus,
      p_confirmed_visit_at: input.confirmedVisitAt,
      p_expected_version: input.expectedVersion,
      p_idempotency_key: input.idempotencyKey,
    });
  }

  convert(input: ConvertCommandInput) {
    return this.runCommand("convert_douyin_lead_to_customer", "convert", {
      p_tenant_id: input.tenantId, p_marketing_lead_id: input.leadId,
      p_actor_employee_id: input.actorEmployeeId,
      p_expected_version: input.expectedVersion,
      p_idempotency_key: input.idempotencyKey,
      p_expected_customer_id: input.expectedCustomerId,
      p_allow_customer_create: input.allowCustomerCreate,
    });
  }

  markInvalid(input: CommandBaseInput & { reason: string }) {
    return this.runCommand("mark_douyin_lead_invalid", "mark_invalid", {
      p_tenant_id: input.tenantId, p_marketing_lead_id: input.leadId,
      p_actor_employee_id: input.actorEmployeeId, p_reason: input.reason,
      p_expected_version: input.expectedVersion,
      p_idempotency_key: input.idempotencyKey,
    });
  }

  private async runCommand(
    name: CommandName,
    expectedAction: TenantDouyinLeadCommandData["action"],
    args: Readonly<Record<string, Json | undefined>>,
  ): Promise<TenantDouyinLeadCommandResult> {
    const result = await executeDatabase(() => this.client.rpc(name, args),
      "执行抖音线索命令失败");
    assertDatabaseSuccess(result, "执行抖音线索命令失败");
    const envelope = parseData(TenantDouyinLeadCommandEnvelopeSchema,
      result.data, "解析抖音线索命令结果失败");
    if ("error" in envelope) return { ok: false, error: envelope.error };
    if (envelope.data.action !== expectedAction) {
      throw Errors.dbError("解析抖音线索命令结果失败");
    }
    return { ok: true, data: envelope.data };
  }

  private async loadLatestAppointments(tenantId: string,
    leadIds: readonly string[]) {
    const result = await executeDatabase(
      () => this.client.rpc("list_tenant_douyin_lead_latest_appointments", {
        p_tenant_id: tenantId, p_marketing_lead_ids: [...leadIds],
      }),
      "查询抖音线索最新量房预约失败",
    );
    assertDatabaseSuccess(result, "查询抖音线索最新量房预约失败");
    const rows = parseData(z.array(TenantDouyinAppointmentSummaryRowSchema),
      result.data ?? [], "解析抖音线索最新量房预约失败");
    assertLatestAppointmentScope(rows, tenantId, leadIds);
    return rows;
  }

  private async listAppointments(input: { tenantId: string; leadId: string }) {
    const result = await executeDatabase(
      () => this.client.from("douyin_measurement_appointments")
        .select(APPOINTMENT_FIELDS, { count: "exact" })
        .eq("tenant_id", input.tenantId)
        .eq("marketing_lead_id", input.leadId)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false }).range(0, 19),
      "查询抖音量房预约详情失败",
    );
    assertDatabaseSuccess(result, "查询抖音量房预约详情失败");
    return {
      rows: parseData(z.array(TenantDouyinAppointmentDetailRowSchema),
        result.data ?? [], "解析抖音量房预约详情失败"),
      total: parseExactCount(result.count, "查询抖音量房预约总数失败"),
    };
  }

  private loadCustomers(tenantId: string, customerIds: readonly string[]) {
    return this.loadRelatedRows("customers", CUSTOMER_FIELDS,
      TenantDouyinCustomerRowSchema, tenantId, customerIds,
      "查询抖音线索关联客户失败") as Promise<TenantDouyinCustomerRow[]>;
  }

  private loadEmployees(tenantId: string, employeeIds: readonly string[]) {
    return this.loadRelatedRows("employees", EMPLOYEE_FIELDS,
      TenantDouyinEmployeeRowSchema, tenantId, employeeIds,
      "查询抖音线索关联员工失败") as Promise<TenantDouyinEmployeeRow[]>;
  }

  private async loadRelatedRows<T>(table: string, fields: string,
    schema: z.ZodType<T>, tenantId: string, ids: readonly string[],
    message: string): Promise<T[]> {
    const uniqueIds = [...new Set(ids)];
    const rows: T[] = [];
    for (const batchIds of chunkValues(uniqueIds, RELATED_IDS_PER_BATCH)) {
      const result = await executeDatabase(
        () => this.client.from(table).select(fields).eq("tenant_id", tenantId)
          .in("id", batchIds).limit(batchIds.length), message);
      assertDatabaseSuccess(result, message);
      rows.push(...parseData(z.array(schema), result.data ?? [], message));
    }
    return rows;
  }
}

function compactIds<K extends "customer_id" | "assigned_employee_id">(
  leads: readonly TenantDouyinLeadRow[], key: K,
): string[] {
  return [...new Set(leads.flatMap((lead) => lead[key] ? [lead[key]] : []))];
}

function assertLatestAppointmentScope(
  rows: readonly TenantDouyinAppointmentRow[],
  tenantId: string,
  leadIds: readonly string[],
): void {
  const requested = new Set(leadIds);
  const seen = new Set<string>();
  for (const row of rows) {
    if (row.tenant_id !== tenantId
      || !requested.has(row.marketing_lead_id)
      || seen.has(row.marketing_lead_id)) {
      throw Errors.dbError("解析抖音线索最新量房预约失败");
    }
    seen.add(row.marketing_lead_id);
  }
}

function nextIsoDate(value: string): string {
  const next = new Date(`${value}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}

function safeHydrateLeadBundles(input: Parameters<
  typeof hydrateLeadBundles
>[0]) {
  try {
    return hydrateLeadBundles(input);
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw Errors.dbError("解析抖音线索关联数据失败");
  }
}

function parseExactCount(value: number | null | undefined, message: string) {
  if (!Number.isInteger(value) || value! < 0) throw Errors.dbError(message);
  return value!;
}

function assertDatabaseSuccess(result: DatabaseResult, message: string): void {
  if (result.error) throw Errors.dbError(message);
}

function parseData<T>(schema: z.ZodType<T>, value: unknown, message: string): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw Errors.dbError(message);
  return parsed.data;
}

async function executeDatabase<T>(operation: () => T | PromiseLike<T>,
  message: string): Promise<T> {
  try {
    return await operation();
  } catch {
    throw Errors.dbError(message);
  }
}

export const tenantDouyinLeadsRepository = new TenantDouyinLeadsRepository();
