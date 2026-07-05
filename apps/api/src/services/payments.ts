import { Errors } from "@/errors/error-factory";
import {
  financeLedgerRepository,
  type FinanceLedgerEntryInput,
} from "@/repositories/finance-ledger";
import { paymentRepository } from "@/repositories/payments";
import type {
  CreatePaymentInput,
  GeneratePaymentLedgerInput,
  PaymentListQuery,
  UpdatePaymentInput,
} from "@/schema/payment";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";
import { financeLedgerService } from "@/services/finance-ledger";
import type { PaymentRecord } from "@/repositories/payments";

class PaymentService {
  private normalizePaymentInput<T extends CreatePaymentInput | UpdatePaymentInput>(
    input: T,
  ): T {
    const normalized = { ...input } as T & {
      paid_at?: string | null;
      pay_date?: string | null;
    };

    if (normalized.paid_at && !normalized.pay_date) {
      normalized.pay_date = normalized.paid_at;
    }
    delete normalized.paid_at;

    return normalized as T;
  }

  private requireProjectId(projectId: string | null | undefined) {
    if (!projectId) {
      throw Errors.badRequest("收款记录必须关联项目");
    }

    return projectId;
  }

  private async getReadableProjectIds(authContext: AuthContext) {
    const tenantId = accessPolicyService.assertTenantContext(authContext);
    const visibleProjectIds = await accessPolicyService.getVisibleProjectIds(
      authContext,
      "project.read",
    );

    if (visibleProjectIds === null) {
      return paymentRepository.listProjectIdsByTenant(tenantId);
    }

    return visibleProjectIds;
  }

  private async assertProjectAccess(
    authContext: AuthContext,
    projectId: string,
    permissionCode: "project.read" | "project.update",
  ) {
    const hasAccess = await accessPolicyService.canAccessProject(
      authContext,
      projectId,
      permissionCode,
    );

    if (!hasAccess) {
      throw Errors.forbidden();
    }
  }

  private getPaymentProjectTenantId(payment: PaymentRecord) {
    const project = payment.project;
    if (!project || typeof project !== "object") return null;
    const tenantId = (project as { tenant_id?: unknown }).tenant_id;
    return typeof tenantId === "string" && tenantId.trim() ? tenantId : null;
  }

  private buildProjectPaymentLedgerInput(input: {
    tenantId: string;
    payment: PaymentRecord;
    projectId: string;
    employeeId: string;
    reason: string;
  }): FinanceLedgerEntryInput {
    const sourceType = input.payment.source_type?.trim() || "payment";
    const sourceId = input.payment.source_id?.trim() || input.payment.id;

    return {
      tenant_id: input.tenantId,
      project_id: input.projectId,
      direction: "in",
      entry_type: "project_payment",
      amount: Number(input.payment.amount || 0),
      occurred_at: input.payment.pay_date ?? new Date().toISOString(),
      source_type: sourceType,
      source_id: sourceId,
      workflow_task_id: input.payment.workflow_task_id ?? null,
      payment_id: input.payment.id,
      handled_by: input.employeeId,
      summary: "项目收款入账",
      metadata: {
        operation: "generate_missing_project_payment_ledger",
        payment_type: input.payment.type,
        payment_channel: input.payment.payment_channel ?? "manual",
        repair_reason: input.reason,
        repaired_by: input.employeeId,
        source_type: sourceType,
        source_id: sourceId,
      },
    };
  }

  async listPayments(authContext: AuthContext, params: PaymentListQuery) {
    const projectIds = await this.getReadableProjectIds(authContext);

    if (params.project_id && !projectIds.includes(params.project_id)) {
      throw Errors.forbidden();
    }

    return paymentRepository.list(params, projectIds);
  }

  async getPaymentById(authContext: AuthContext, id: string) {
    const payment = await paymentRepository.findById(id);
    if (!payment) {
      throw Errors.badRequest("收款记录不存在");
    }

    const projectId = this.requireProjectId(payment.project_id);
    await this.assertProjectAccess(authContext, projectId, "project.read");
    return payment;
  }

  async createPayment(authContext: AuthContext, input: CreatePaymentInput) {
    const projectId = this.requireProjectId(input.project_id);
    await this.assertProjectAccess(authContext, projectId, "project.update");
    return paymentRepository.create({
      ...this.normalizePaymentInput(input),
      project_id: projectId,
    });
  }

  async updatePayment(
    authContext: AuthContext,
    id: string,
    input: UpdatePaymentInput,
  ) {
    const existing = await paymentRepository.findById(id);
    if (!existing) {
      throw Errors.badRequest("收款记录不存在");
    }

    const existingProjectId = this.requireProjectId(existing.project_id);
    await this.assertProjectAccess(authContext, existingProjectId, "project.update");

    if (input.project_id === null) {
      throw Errors.badRequest("收款记录必须关联项目");
    }

    if (input.project_id && input.project_id !== existingProjectId) {
      await this.assertProjectAccess(authContext, input.project_id, "project.update");
    }

    return paymentRepository.update(id, this.normalizePaymentInput(input));
  }

  async generateProjectPaymentLedger(
    authContext: AuthContext,
    id: string,
    input: GeneratePaymentLedgerInput,
  ) {
    const tenantId = accessPolicyService.assertTenantContext(authContext);
    if (!accessPolicyService.hasPermission(
      authContext,
      "finance.payment.confirm",
    )) {
      throw Errors.forbidden();
    }
    if (!authContext.employeeId) {
      throw Errors.forbidden();
    }

    const payment = await paymentRepository.findById(id);
    if (!payment) {
      throw Errors.business(404, "收款记录不存在", "PAYMENT_NOT_FOUND");
    }

    const projectId = this.requireProjectId(payment.project_id);
    const projectTenantId = this.getPaymentProjectTenantId(payment) ??
      (await paymentRepository.findProjectTenant(projectId))?.tenant_id;
    if (projectTenantId !== tenantId) {
      throw Errors.forbidden();
    }

    if (payment.status !== "confirmed") {
      throw Errors.business(
        409,
        "只有已确认收款才能补生成项目收款台账",
        "PAYMENT_NOT_CONFIRMED",
      );
    }

    const amount = Number(payment.amount || 0);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw Errors.badRequest("收款金额必须大于 0");
    }

    const existingLedger = await financeLedgerRepository
      .findProjectPaymentByPaymentId({ tenantId, paymentId: payment.id });
    if (existingLedger) {
      throw Errors.business(
        409,
        "项目收款台账已存在",
        "PAYMENT_LEDGER_ALREADY_EXISTS",
        { ledger_id: (existingLedger as { id?: unknown }).id },
      );
    }

    return financeLedgerService.createProjectPaymentLedger(
      this.buildProjectPaymentLedgerInput({
        tenantId,
        payment,
        projectId,
        employeeId: authContext.employeeId,
        reason: input.reason,
      }),
    );
  }
}

export const paymentService = new PaymentService();
