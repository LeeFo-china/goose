import { Errors } from "@/errors/error-factory";
import {
  financeLedgerRepository,
  type FinanceLedgerEntryInput,
} from "@/repositories/finance-ledger";
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
}

export const financeLedgerService = new FinanceLedgerService();
