import { Errors } from "@/errors/error-factory";
import {
  projectReceivableEventRepository,
} from "@/repositories/project-receivable-events";
import {
  projectReceivableOperationsRepository,
  type ProjectReceivableOperationRecord,
} from "@/repositories/project-receivable-operations";
import {
  projectReceivablePlanRepository,
} from "@/repositories/project-receivable-plans";
import type {
  AdjustFinanceReceivableDueDateInput,
  CancelFinanceReceivableInput,
  CreateFinanceReceivableFollowUpInput,
  CreateFinanceReceivableInput,
  FinanceReceivableEventListQuery,
  UpdateFinanceReceivableInput,
} from "@/schema/finance-receivables";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";

type Dependencies = {
  planRepository: Pick<typeof projectReceivablePlanRepository, "findProjectTenant">;
  operationsRepository: Pick<
    typeof projectReceivableOperationsRepository,
    "findById" | "findEmployeeTenant" | "createManualPlan" | "updatePlan" | "cancelPlan"
  >;
  eventRepository: Pick<
    typeof projectReceivableEventRepository,
    "create" | "listByReceivable"
  >;
  accessPolicyService: Pick<
    typeof accessPolicyService,
    "assertTenantContext" | "hasPermission"
  >;
};

export class ProjectReceivableOperationsService {
  constructor(
    private readonly dependencies: Dependencies = {
      planRepository: projectReceivablePlanRepository,
      operationsRepository: projectReceivableOperationsRepository,
      eventRepository: projectReceivableEventRepository,
      accessPolicyService,
    },
  ) {}

  async createManualReceivable(
    authContext: AuthContext,
    input: CreateFinanceReceivableInput,
  ) {
    const tenantId = this.requireManage(authContext);
    await this.assertProjectBelongsToTenant(input.project_id, tenantId);
    await this.assertEmployeeBelongsToTenant(input.owner_employee_id, tenantId);

    const created = await this.dependencies.operationsRepository.createManualPlan({
      tenant_id: tenantId,
      project_id: input.project_id,
      payment_type: input.payment_type,
      title: input.title,
      amount: roundMoney(input.amount),
      due_date: input.due_date,
      owner_employee_id: input.owner_employee_id ?? null,
      created_by: authContext.employeeId,
      remark: input.remark,
    });
    await this.createEvent({
      record: created,
      eventType: "manual_created",
      title: "人工创建应收",
      note: input.remark,
      after: snapshot(created),
      createdBy: authContext.employeeId,
    });
    return created;
  }

  async updateReceivable(
    authContext: AuthContext,
    planId: string,
    input: UpdateFinanceReceivableInput,
  ) {
    const tenantId = this.requireManage(authContext);
    const current = await this.getWritablePlan(tenantId, planId, "adjust");
    await this.assertEmployeeBelongsToTenant(input.owner_employee_id, tenantId);

    const nextAmount = input.amount === undefined
      ? current.amount
      : roundMoney(input.amount);
    if (nextAmount < current.paid_amount) {
      throw Errors.business(
        409,
        "应收金额不能小于已收金额",
        "RECEIVABLE_AMOUNT_BELOW_PAID",
        {
          receivable_plan_id: current.id,
          paid_amount: current.paid_amount,
          amount: nextAmount,
        },
      );
    }

    const values = compactValues({
      payment_type: input.payment_type,
      title: input.title,
      amount: input.amount === undefined ? undefined : nextAmount,
      due_date: input.due_date,
      owner_employee_id: input.owner_employee_id,
      status: deriveStoredStatus(current.paid_amount, nextAmount),
    });
    const updated = await this.dependencies.operationsRepository.updatePlan({
      tenantId,
      planId,
      values,
    });
    await this.createEvent({
      record: updated,
      eventType: "adjusted",
      title: "调整应收计划",
      note: input.remark,
      before: snapshot(current),
      after: snapshot(updated),
      createdBy: authContext.employeeId,
    });
    return updated;
  }

  async cancelReceivable(
    authContext: AuthContext,
    planId: string,
    input: CancelFinanceReceivableInput,
  ) {
    const tenantId = this.requireManage(authContext);
    const current = await this.getWritablePlan(tenantId, planId, "cancel");
    const canceled = await this.dependencies.operationsRepository.cancelPlan({
      tenantId,
      planId,
      canceledBy: authContext.employeeId,
      reason: input.reason,
    });
    await this.createEvent({
      record: canceled,
      eventType: "cancel_receivable",
      title: "取消应收计划",
      note: input.reason,
      before: snapshot(current),
      after: snapshot(canceled),
      createdBy: authContext.employeeId,
    });
    return canceled;
  }

  async adjustDueDate(
    authContext: AuthContext,
    planId: string,
    input: AdjustFinanceReceivableDueDateInput,
  ) {
    const tenantId = this.requireManage(authContext);
    const current = await this.getWritablePlan(tenantId, planId, "adjust");
    const updated = await this.dependencies.operationsRepository.updatePlan({
      tenantId,
      planId,
      values: {
        due_date: input.due_date,
        status: deriveStoredStatus(current.paid_amount, current.amount),
      },
    });
    await this.createEvent({
      record: updated,
      eventType: "adjust_due_date",
      title: "调整应收到期日",
      note: input.reason,
      before: snapshot(current),
      after: snapshot(updated),
      createdBy: authContext.employeeId,
    });
    return updated;
  }

  async createFollowUp(
    authContext: AuthContext,
    planId: string,
    input: CreateFinanceReceivableFollowUpInput,
  ) {
    const tenantId = this.requireManage(authContext);
    const current = await this.getWritablePlan(tenantId, planId, "follow_up");
    const updated = await this.dependencies.operationsRepository.updatePlan({
      tenantId,
      planId,
      values: {
        latest_follow_up_at: new Date().toISOString(),
        latest_follow_up_note: input.note,
        next_follow_up_at: input.next_follow_up_at ?? null,
      },
    });
    return this.createEvent({
      record: updated,
      eventType: "follow_up",
      title: "登记应收跟进",
      note: input.note,
      before: snapshot(current),
      after: snapshot(updated),
      nextFollowUpAt: input.next_follow_up_at,
      createdBy: authContext.employeeId,
    });
  }

  async listEvents(
    authContext: AuthContext,
    planId: string,
    query: FinanceReceivableEventListQuery,
  ) {
    const tenantId = this.requireView(authContext);
    await this.getReadablePlan(tenantId, planId);
    return this.dependencies.eventRepository.listByReceivable({
      tenantId,
      planId,
      query,
    });
  }

  private async getReadablePlan(tenantId: string, planId: string) {
    const record = await this.dependencies.operationsRepository.findById({
      tenantId,
      planId,
    });
    if (!record) throw Errors.notFound("应收计划不存在");
    return record;
  }

  private async getWritablePlan(
    tenantId: string,
    planId: string,
    operation: "adjust" | "cancel" | "follow_up",
  ) {
    const record = await this.getReadablePlan(tenantId, planId);
    if (record.status === "canceled") {
      throw Errors.business(409, "已取消应收不能继续操作", "RECEIVABLE_CANCELED");
    }
    if (record.status === "paid" || record.paid_amount >= record.amount) {
      throw Errors.business(409, "已收应收不能继续操作", "RECEIVABLE_PAID");
    }
    if (operation === "cancel" && record.paid_amount > 0) {
      throw Errors.business(
        409,
        "已有收款核销的应收不能取消",
        "RECEIVABLE_ALREADY_ALLOCATED",
      );
    }
    return record;
  }

  private async assertProjectBelongsToTenant(projectId: string, tenantId: string) {
    const project = await this.dependencies.planRepository.findProjectTenant(projectId);
    if (!project || project.tenant_id !== tenantId) throw Errors.forbidden();
  }

  private async assertEmployeeBelongsToTenant(
    employeeId: string | undefined,
    tenantId: string,
  ) {
    if (!employeeId) return;
    const employee = await this.dependencies.operationsRepository
      .findEmployeeTenant(employeeId);
    if (!employee || employee.tenant_id !== tenantId) {
      throw Errors.badRequest("请选择当前租户下的负责人");
    }
  }

  private async createEvent(input: {
    record: ProjectReceivableOperationRecord;
    eventType:
      | "manual_created"
      | "adjusted"
      | "canceled"
      | "follow_up"
      | "adjust_due_date"
      | "cancel_receivable";
    title: string;
    note?: string | null;
    before?: Record<string, unknown> | null;
    after?: Record<string, unknown> | null;
    nextFollowUpAt?: string | null;
    createdBy: string | null;
  }) {
    return this.dependencies.eventRepository.create({
      tenant_id: input.record.tenant_id,
      project_id: input.record.project_id,
      receivable_plan_id: input.record.id,
      event_type: input.eventType,
      title: input.title,
      note: input.note,
      before_snapshot: input.before,
      after_snapshot: input.after,
      next_follow_up_at: input.nextFollowUpAt,
      created_by: input.createdBy,
    });
  }

  private requireManage(authContext: AuthContext) {
    const tenantId = this.dependencies.accessPolicyService
      .assertTenantContext(authContext);
    if (
      !this.dependencies.accessPolicyService.hasPermission(
        authContext,
        "finance.receivable.manage",
      )
    ) {
      throw Errors.forbidden();
    }
    return tenantId;
  }

  private requireView(authContext: AuthContext) {
    const tenantId = this.dependencies.accessPolicyService
      .assertTenantContext(authContext);
    const canView = ["finance.receivable.view", "finance.receivable.manage", "finance.view"]
      .some((permission) =>
        this.dependencies.accessPolicyService.hasPermission(authContext, permission)
      );
    if (!canView) throw Errors.forbidden();
    return tenantId;
  }
}

function compactValues(values: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(values).filter(([, value]) => value !== undefined),
  );
}

function deriveStoredStatus(paidAmount: number, amount: number) {
  if (paidAmount <= 0) return "pending";
  return paidAmount >= amount ? "paid" : "partially_paid";
}

function snapshot(record: ProjectReceivableOperationRecord) {
  return {
    payment_type: record.payment_type,
    title: record.title,
    amount: record.amount,
    due_date: record.due_date,
    paid_amount: record.paid_amount,
    status: record.status,
    owner_employee_id: record.owner_employee_id,
    latest_follow_up_at: record.latest_follow_up_at,
    latest_follow_up_note: record.latest_follow_up_note,
    next_follow_up_at: record.next_follow_up_at,
  };
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

export const projectReceivableOperationsService =
  new ProjectReceivableOperationsService();
