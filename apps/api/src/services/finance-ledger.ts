import { Errors } from "@/errors/error-factory";
import {
  financeLedgerRepository,
  type FinanceLedgerEntryInput,
} from "@/repositories/finance-ledger";
import type { UpdateFinanceLedgerCostCategoryInput } from "@/schema/finance-costs";
import type { FinanceLedgerListQuery } from "@/schema/finance";
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
}

export const financeLedgerService = new FinanceLedgerService();
