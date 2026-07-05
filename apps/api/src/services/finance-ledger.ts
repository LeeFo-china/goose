import { Errors } from "@/errors/error-factory";
import {
  financeLedgerRepository,
  type FinanceLedgerEntryInput,
  type FinanceLedgerRecord,
} from "@/repositories/finance-ledger";
import { paymentRepository, type PaymentRecord } from "@/repositories/payments";
import type { UpdateFinanceLedgerCostCategoryInput } from "@/schema/finance-costs";
import type {
  FinanceLedgerListQuery,
  LinkFinanceLedgerPaymentInput,
  MarkLegacyFinanceLedgerInput,
} from "@/schema/finance";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";

class FinanceLedgerService {
  async listLedger(authContext: AuthContext, query: FinanceLedgerListQuery) {
    const tenantId = accessPolicyService.assertTenantContext(authContext);
    const allowed = authContext.permissions.some((permission) =>
      permission.code === "finance.ledger.view" ||
      permission.code === "finance.view"
    );

    if (!allowed) {
      throw Errors.forbidden();
    }

    return financeLedgerRepository.list(tenantId, query);
  }

  async createProjectPaymentLedger(input: FinanceLedgerEntryInput) {
    return financeLedgerRepository.createIdempotent(input);
  }

  async createExpenseSettlementLedger(input: FinanceLedgerEntryInput) {
    return financeLedgerRepository.createIdempotent(input);
  }

  async updateCostCategory(
    authContext: AuthContext,
    ledgerId: string,
    input: UpdateFinanceLedgerCostCategoryInput,
  ) {
    const tenantId = accessPolicyService.assertTenantContext(authContext);
    if (!accessPolicyService.hasPermission(
      authContext,
      "finance.cost-allocation.manage",
    )) {
      throw Errors.forbidden();
    }
    if (!authContext.employeeId) {
      throw Errors.forbidden();
    }

    if (input.cost_category_id) {
      const category = await financeLedgerRepository.findActiveCostCategory({
        tenantId,
        costCategoryId: input.cost_category_id,
      });
      if (!category) {
        throw Errors.badRequest("成本分类不存在或已停用");
      }
    }

    return financeLedgerRepository.updateCostCategory({
      tenantId,
      ledgerId,
      costCategoryId: input.cost_category_id,
      employeeId: authContext.employeeId,
    });
  }

  async linkProjectPayment(
    authContext: AuthContext,
    ledgerId: string,
    input: LinkFinanceLedgerPaymentInput,
  ) {
    const { tenantId, employeeId } = this.assertRepairPermission(authContext);
    const ledger = await this.requireRepairableProjectPaymentLedger({
      tenantId,
      ledgerId,
      requireUnlinked: true,
    });
    const projectId = this.requireLedgerProjectId(ledger);
    const payment = await paymentRepository.findById(input.payment_id);

    if (!payment) {
      throw Errors.business(404, "收款记录不存在", "PAYMENT_NOT_FOUND");
    }
    this.assertPaymentTenant(payment, tenantId);
    if (payment.project_id !== projectId) {
      throw Errors.business(
        409,
        "收款记录与台账项目不一致",
        "LEDGER_PAYMENT_PROJECT_MISMATCH",
      );
    }
    if (payment.status !== "confirmed") {
      throw Errors.business(
        409,
        "只能关联已确认收款",
        "PAYMENT_NOT_CONFIRMED",
      );
    }
    if (this.moneyToCents(payment.amount) !== this.moneyToCents(ledger.amount)) {
      throw Errors.business(
        409,
        "收款金额与台账金额不一致",
        "LEDGER_PAYMENT_AMOUNT_MISMATCH",
      );
    }

    const existingLedger = await financeLedgerRepository
      .findProjectPaymentByPaymentId({
        tenantId,
        paymentId: payment.id,
      });
    if (existingLedger && (existingLedger as { id?: unknown }).id !== ledger.id) {
      throw Errors.business(
        409,
        "该收款已存在项目收款台账",
        "PAYMENT_LEDGER_ALREADY_EXISTS",
        { ledger_id: (existingLedger as { id?: unknown }).id },
      );
    }

    return financeLedgerRepository.linkProjectPayment({
      tenantId,
      ledgerId: ledger.id,
      paymentId: payment.id,
      employeeId,
      reason: input.reason,
      previousPaymentId: ledger.payment_id ?? null,
      metadata: this.mergeMetadata(ledger.metadata, {
        operation: "link_ledger_payment",
        linked_payment_id: payment.id,
        payment_link_reason: input.reason,
        payment_linked_by: employeeId,
      }),
    });
  }

  async markLegacyProjectPayment(
    authContext: AuthContext,
    ledgerId: string,
    input: MarkLegacyFinanceLedgerInput,
  ) {
    const { tenantId, employeeId } = this.assertRepairPermission(authContext);
    const ledger = await this.requireRepairableProjectPaymentLedger({
      tenantId,
      ledgerId,
      requireUnlinked: true,
    });

    return financeLedgerRepository.markLegacyProjectPayment({
      tenantId,
      ledgerId: ledger.id,
      employeeId,
      reason: input.reason,
      metadata: this.mergeMetadata(ledger.metadata, {
        operation: "mark_legacy_ledger",
        legacy_payment_ledger: true,
        legacy_payment_ledger_reason: input.reason,
        legacy_payment_ledger_marked_by: employeeId,
      }),
    });
  }

  private assertRepairPermission(authContext: AuthContext) {
    const tenantId = accessPolicyService.assertTenantContext(authContext);
    if (!accessPolicyService.hasPermission(
      authContext,
      "finance.reconciliation.manage",
    )) {
      throw Errors.forbidden();
    }
    if (!authContext.employeeId) {
      throw Errors.forbidden();
    }
    return { tenantId, employeeId: authContext.employeeId };
  }

  private async requireRepairableProjectPaymentLedger(input: {
    tenantId: string;
    ledgerId: string;
    requireUnlinked: boolean;
  }) {
    const ledger = await financeLedgerRepository.findById(input);
    if (!ledger) {
      throw Errors.business(404, "财务台账不存在", "FINANCE_LEDGER_NOT_FOUND");
    }
    if (ledger.direction !== "in" || ledger.entry_type !== "project_payment") {
      throw Errors.business(
        409,
        "只能修正项目收款入账流水",
        "LEDGER_NOT_PROJECT_PAYMENT",
      );
    }
    if (input.requireUnlinked && ledger.payment_id) {
      throw Errors.business(
        409,
        "项目收款流水已关联收款记录",
        "LEDGER_PAYMENT_ALREADY_LINKED",
      );
    }
    if (ledger.legacy_payment_ledger_marked_at) {
      throw Errors.business(
        409,
        "项目收款流水已标记为历史流水",
        "LEDGER_LEGACY_ALREADY_MARKED",
      );
    }
    return ledger;
  }

  private requireLedgerProjectId(ledger: FinanceLedgerRecord) {
    if (!ledger.project_id) {
      throw Errors.badRequest("项目收款流水必须关联项目");
    }
    return ledger.project_id;
  }

  private assertPaymentTenant(payment: PaymentRecord, tenantId: string) {
    const project = payment.project;
    const paymentTenantId = project && typeof project === "object"
      ? (project as { tenant_id?: unknown }).tenant_id
      : null;
    if (paymentTenantId !== tenantId) {
      throw Errors.forbidden();
    }
  }

  private moneyToCents(value: unknown) {
    const amount = Number(value ?? 0);
    return Number.isFinite(amount) ? Math.round(amount * 100) : 0;
  }

  private mergeMetadata(
    current: Record<string, unknown> | undefined,
    patch: Record<string, unknown>,
  ) {
    const base = current && typeof current === "object" && !Array.isArray(current)
      ? current
      : {};
    return {
      ...base,
      ...patch,
    };
  }
}

export const financeLedgerService = new FinanceLedgerService();
