import { randomUUID } from "crypto";
import { Errors } from "@/errors/error-factory";
import {
  projectReceivableAllocationRepository,
  type ProjectReceivableAllocationInput,
  type ProjectReceivableAllocationRecord,
  type ProjectReceivablePaymentAllocationCandidate,
  type ProjectReceivablePaymentRecord,
} from "@/repositories/project-receivable-allocations";
import { projectReceivableEventRepository } from "@/repositories/project-receivable-events";
import { projectReceivableOperationsRepository, type ProjectReceivableOperationRecord } from "@/repositories/project-receivable-operations";
import { projectReceivablePlanRepository, type ProjectReceivablePlanRecord } from "@/repositories/project-receivable-plans";
import type {
  CreateFinanceReceivableAllocationInput,
  ProjectReceivableEventType,
  ProjectReceivableStatus,
  ReverseFinanceReceivableAllocationInput,
  UpdateFinanceReceivableAllocationInput,
} from "@/schema/finance-receivables";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";

export type ProjectReceivableAllocationContext = {
  receivable_plan: ProjectReceivableAllocationPlan;
  allocations: ProjectReceivableAllocationRecord[];
  payments: ProjectReceivablePaymentAllocationCandidate[];
};
export type ProjectReceivableAllocationPlan =
  ProjectReceivableOperationRecord & { remaining_amount: number };

export type ProjectReceivableAllocationMutationResult = {
  allocation: ProjectReceivableAllocationRecord;
  receivable_plan: ProjectReceivablePlanRecord & { remaining_amount: number };
};
type Dependencies = {
  receivableRepository: Pick<typeof projectReceivableOperationsRepository, "findById">;
  planRepository: Pick<typeof projectReceivablePlanRepository, "updatePaidAmount">;
  allocationRepository: {
    listActiveByReceivable: typeof projectReceivableAllocationRepository.listActiveByReceivable;
    listConfirmedProjectPayments: typeof projectReceivableAllocationRepository.listConfirmedProjectPayments;
    findPaymentById: typeof projectReceivableAllocationRepository.findPaymentById;
    createIdempotent: (input: ProjectReceivableAllocationInput) =>
      ReturnType<typeof projectReceivableAllocationRepository.createIdempotent>;
    sumActiveAllocatedAmount: typeof projectReceivableAllocationRepository.sumActiveAllocatedAmount;
    sumActiveAllocatedAmountByPayment: typeof projectReceivableAllocationRepository.sumActiveAllocatedAmountByPayment;
    findActiveById: typeof projectReceivableAllocationRepository.findActiveById;
    updateManualAllocationAmount: typeof projectReceivableAllocationRepository.updateManualAllocationAmount;
    reverseManualAllocation: typeof projectReceivableAllocationRepository.reverseManualAllocation;
  };
  eventRepository: {
    create: (input: {
      tenant_id: string;
      project_id: string;
      receivable_plan_id: string;
      event_type: ProjectReceivableEventType;
      title: string;
      note?: string | null;
      before_snapshot?: Record<string, unknown> | null;
      after_snapshot?: Record<string, unknown> | null;
      created_by?: string | null;
    }) => Promise<unknown>;
  };
  accessPolicyService: Pick<typeof accessPolicyService, "assertTenantContext" | "hasPermission">;
};

export class ProjectReceivableAllocationsService {
  constructor(
    private readonly dependencies: Dependencies = {
      receivableRepository: projectReceivableOperationsRepository,
      planRepository: projectReceivablePlanRepository,
      allocationRepository: projectReceivableAllocationRepository,
      eventRepository: projectReceivableEventRepository,
      accessPolicyService,
    },
  ) {}

  async getAllocationContext(
    authContext: AuthContext,
    planId: string,
  ): Promise<ProjectReceivableAllocationContext> {
    const tenantId = this.requireManage(authContext);
    const receivablePlan = await this.getReceivablePlan({ tenantId, planId });
    const [allocations, payments] = await Promise.all([
      this.dependencies.allocationRepository.listActiveByReceivable({
        tenantId,
        receivablePlanId: planId,
      }),
      this.dependencies.allocationRepository.listConfirmedProjectPayments({
        tenantId,
        projectId: receivablePlan.project_id,
        pageSize: 100,
      }),
    ]);

    return {
      receivable_plan: withRemainingAmount(receivablePlan),
      allocations,
      payments,
    };
  }

  async createManualAllocation(
    authContext: AuthContext,
    planId: string,
    input: CreateFinanceReceivableAllocationInput,
  ): Promise<ProjectReceivableAllocationMutationResult> {
    const tenantId = this.requireManage(authContext);
    const receivablePlan = await this.getReceivablePlan({ tenantId, planId });
    this.assertReceivableWritableForCreate(receivablePlan);
    const amount = roundMoney(input.amount);
    const payment = await this.getValidPayment({
      tenantId,
      receivablePlan,
      paymentId: input.payment_id,
    });
    await this.assertAllocationWithinBounds({
      tenantId,
      receivablePlan,
      payment,
      amount,
      currentAllocationAmount: 0,
    });

    const allocation = await this.dependencies.allocationRepository
      .createIdempotent({
        tenant_id: tenantId,
        project_id: receivablePlan.project_id,
        receivable_plan_id: receivablePlan.id,
        payment_id: payment.id,
        amount,
        allocated_by: authContext.employeeId,
        source_type: "manual",
        source_id: input.idempotency_key ?? randomUUID(),
        metadata: {
          reason: input.reason,
          created_by: authContext.employeeId,
        },
      });
    const updatedPlan = await this.refreshReceivablePaidAmount({
      tenantId,
      planId: receivablePlan.id,
      amount: receivablePlan.amount,
    });
    await this.createEvent({
      receivablePlan,
      eventType: "allocate_payment",
      title: "人工核销收款",
      note: input.reason,
      before: snapshot(receivablePlan),
      after: snapshot(updatedPlan),
      createdBy: authContext.employeeId,
    });

    return {
      allocation,
      receivable_plan: updatedPlan,
    };
  }

  async adjustManualAllocation(
    authContext: AuthContext,
    planId: string,
    allocationId: string,
    input: UpdateFinanceReceivableAllocationInput,
  ): Promise<ProjectReceivableAllocationMutationResult> {
    const tenantId = this.requireManage(authContext);
    const receivablePlan = await this.getReceivablePlan({ tenantId, planId });
    this.assertReceivableNotCanceled(receivablePlan);
    const allocation = await this.getManualAllocation({
      tenantId,
      planId,
      allocationId,
    });
    const payment = await this.getValidPayment({
      tenantId,
      receivablePlan,
      paymentId: allocation.payment_id,
    });
    const amount = roundMoney(input.amount);
    await this.assertAllocationWithinBounds({
      tenantId,
      receivablePlan,
      payment,
      amount,
      currentAllocationAmount: allocation.amount,
    });

    const updatedAllocation = await this.dependencies.allocationRepository
      .updateManualAllocationAmount({
        tenantId,
        allocationId,
        amount,
        metadata: {
          ...allocation.metadata,
          adjust_reason: input.reason,
          adjusted_by: authContext.employeeId,
          previous_amount: allocation.amount,
        },
      });
    const updatedPlan = await this.refreshReceivablePaidAmount({
      tenantId,
      planId: receivablePlan.id,
      amount: receivablePlan.amount,
    });
    await this.createEvent({
      receivablePlan,
      eventType: "adjust_allocation",
      title: "调整核销金额",
      note: input.reason,
      before: snapshotAllocation(allocation),
      after: snapshotAllocation(updatedAllocation),
      createdBy: authContext.employeeId,
    });

    return {
      allocation: updatedAllocation,
      receivable_plan: updatedPlan,
    };
  }

  async reverseManualAllocation(
    authContext: AuthContext,
    planId: string,
    allocationId: string,
    input: ReverseFinanceReceivableAllocationInput,
  ): Promise<ProjectReceivableAllocationMutationResult> {
    const tenantId = this.requireManage(authContext);
    const receivablePlan = await this.getReceivablePlan({ tenantId, planId });
    this.assertReceivableNotCanceled(receivablePlan);
    const allocation = await this.getManualAllocation({
      tenantId,
      planId,
      allocationId,
    });
    const reversedAllocation = await this.dependencies.allocationRepository
      .reverseManualAllocation({
        tenantId,
        allocationId,
        reversedBy: authContext.employeeId,
        reason: input.reason,
        metadata: {
          ...allocation.metadata,
          reverse_reason: input.reason,
          reversed_by: authContext.employeeId,
        },
      });
    const updatedPlan = await this.refreshReceivablePaidAmount({
      tenantId,
      planId: receivablePlan.id,
      amount: receivablePlan.amount,
    });
    await this.createEvent({
      receivablePlan,
      eventType: "reverse_allocation",
      title: "撤销收款核销",
      note: input.reason,
      before: snapshotAllocation(allocation),
      after: snapshotAllocation(reversedAllocation),
      createdBy: authContext.employeeId,
    });

    return {
      allocation: reversedAllocation,
      receivable_plan: updatedPlan,
    };
  }

  private async getReceivablePlan(input: {
    tenantId: string;
    planId: string;
  }): Promise<ProjectReceivableOperationRecord> {
    const receivablePlan = await this.dependencies.receivableRepository.findById(
      input,
    );
    if (!receivablePlan) {
      throw Errors.notFound("应收计划不存在");
    }
    return receivablePlan;
  }

  private async getManualAllocation(input: {
    tenantId: string;
    planId: string;
    allocationId: string;
  }): Promise<ProjectReceivableAllocationRecord> {
    const allocation = await this.dependencies.allocationRepository.findActiveById({
      tenantId: input.tenantId,
      allocationId: input.allocationId,
    });
    if (!allocation || allocation.receivable_plan_id !== input.planId) {
      throw Errors.business(404, "核销记录不存在", "ALLOCATION_NOT_FOUND");
    }
    if (allocation.source_type !== "manual") {
      throw Errors.business(
        409,
        "非人工核销记录不能在此调整",
        "ALLOCATION_NOT_MANUAL",
      );
    }
    return allocation;
  }

  private async getValidPayment(input: {
    tenantId: string;
    receivablePlan: ProjectReceivableOperationRecord;
    paymentId: string;
  }): Promise<ProjectReceivablePaymentRecord> {
    const payment = await this.dependencies.allocationRepository.findPaymentById({
      tenantId: input.tenantId,
      paymentId: input.paymentId,
    });
    if (!payment || payment.status !== "confirmed") {
      throw Errors.business(
        409,
        "请选择已确认收款记录",
        "PAYMENT_NOT_CONFIRMED",
      );
    }
    if (payment.project_id !== input.receivablePlan.project_id) {
      throw Errors.business(
        409,
        "收款记录和应收计划不属于同一项目",
        "PAYMENT_PROJECT_MISMATCH",
      );
    }
    if (payment.amount <= 0) {
      throw Errors.badRequest("收款金额必须大于 0");
    }
    return payment;
  }

  private async assertAllocationWithinBounds(input: {
    tenantId: string;
    receivablePlan: ProjectReceivableOperationRecord;
    payment: ProjectReceivablePaymentRecord;
    amount: number;
    currentAllocationAmount: number;
  }) {
    const [paymentAllocatedAmount, receivableAllocatedAmount] = await Promise.all([
      this.dependencies.allocationRepository.sumActiveAllocatedAmountByPayment({
        tenantId: input.tenantId,
        paymentId: input.payment.id,
      }),
      this.dependencies.allocationRepository.sumActiveAllocatedAmount({
        tenantId: input.tenantId,
        receivablePlanId: input.receivablePlan.id,
      }),
    ]);
    const nextPaymentAllocated = roundMoney(
      paymentAllocatedAmount - input.currentAllocationAmount + input.amount,
    );
    if (nextPaymentAllocated > input.payment.amount) {
      throw Errors.business(
        409,
        "核销金额超过收款剩余可分配金额",
        "PAYMENT_ALLOCATION_EXCEEDS_REMAINING",
        {
          payment_id: input.payment.id,
          payment_amount: input.payment.amount,
          allocated_amount: paymentAllocatedAmount,
          requested_amount: input.amount,
        },
      );
    }

    const nextReceivableAllocated = roundMoney(
      receivableAllocatedAmount - input.currentAllocationAmount + input.amount,
    );
    if (nextReceivableAllocated > input.receivablePlan.amount) {
      throw Errors.business(
        409,
        "核销金额超过应收剩余金额",
        "RECEIVABLE_ALLOCATION_EXCEEDS_REMAINING",
        {
          receivable_plan_id: input.receivablePlan.id,
          receivable_amount: input.receivablePlan.amount,
          allocated_amount: receivableAllocatedAmount,
          requested_amount: input.amount,
        },
      );
    }
  }

  private async refreshReceivablePaidAmount(input: {
    tenantId: string;
    planId: string;
    amount: number;
  }): Promise<ProjectReceivablePlanRecord & { remaining_amount: number }> {
    const paidAmount = await this.dependencies.allocationRepository
      .sumActiveAllocatedAmount({
        tenantId: input.tenantId,
        receivablePlanId: input.planId,
      });
    const updated = await this.dependencies.planRepository.updatePaidAmount({
      tenantId: input.tenantId,
      planId: input.planId,
      paidAmount,
      status: deriveStoredStatus(paidAmount, input.amount),
    });
    return {
      ...updated,
      remaining_amount: Math.max(updated.amount - updated.paid_amount, 0),
    };
  }

  private async createEvent(input: {
    receivablePlan: ProjectReceivableOperationRecord;
    eventType: ProjectReceivableEventType;
    title: string;
    note: string;
    before?: Record<string, unknown> | null;
    after?: Record<string, unknown> | null;
    createdBy: string | null;
  }) {
    return this.dependencies.eventRepository.create({
      tenant_id: input.receivablePlan.tenant_id,
      project_id: input.receivablePlan.project_id,
      receivable_plan_id: input.receivablePlan.id,
      event_type: input.eventType,
      title: input.title,
      note: input.note,
      before_snapshot: input.before,
      after_snapshot: input.after,
      created_by: input.createdBy,
    });
  }

  private assertReceivableWritableForCreate(
    receivablePlan: ProjectReceivableOperationRecord,
  ) {
    this.assertReceivableNotCanceled(receivablePlan);
    if (receivablePlan.status === "paid" || receivablePlan.paid_amount >= receivablePlan.amount) {
      throw Errors.business(409, "已收应收不能继续核销", "RECEIVABLE_PAID");
    }
  }

  private assertReceivableNotCanceled(
    receivablePlan: ProjectReceivableOperationRecord,
  ) {
    if (receivablePlan.status === "canceled") {
      throw Errors.business(409, "已取消应收不能继续操作", "RECEIVABLE_CANCELED");
    }
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
}

function deriveStoredStatus(paidAmount: number, amount: number): ProjectReceivableStatus {
  if (paidAmount <= 0) return "pending";
  return paidAmount >= amount ? "paid" : "partially_paid";
}

function withRemainingAmount(record: ProjectReceivableOperationRecord): ProjectReceivableAllocationPlan {
  return { ...record, remaining_amount: Math.max(record.amount - record.paid_amount, 0) };
}

function snapshot(record: ProjectReceivableOperationRecord | ProjectReceivablePlanRecord) {
  return {
    payment_type: record.payment_type,
    title: record.title,
    amount: record.amount,
    due_date: record.due_date,
    paid_amount: record.paid_amount,
    status: record.status,
  };
}

function snapshotAllocation(record: ProjectReceivableAllocationRecord) {
  return {
    id: record.id,
    payment_id: record.payment_id,
    amount: record.amount,
    source_type: record.source_type,
    source_id: record.source_id,
    reversed_at: record.reversed_at,
    reversed_by: record.reversed_by,
    reverse_reason: record.reverse_reason,
  };
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

export const projectReceivableAllocationsService = new ProjectReceivableAllocationsService();
