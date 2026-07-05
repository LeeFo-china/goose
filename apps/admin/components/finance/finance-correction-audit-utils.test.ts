import { describe, expect, test } from "bun:test";
import {
  emptyFinanceCorrectionAuditResult,
} from "./finance-correction-audit-requests";
import {
  buildFinanceCorrectionAuditSearchParams,
  financeCorrectionAuditDomainMeta,
  financeCorrectionAuditOperationLabel,
  safeFinanceCorrectionAuditHref,
} from "./finance-correction-audit-utils";

describe("finance correction audit helpers", () => {
  test("builds backend query params for correction audit filters", () => {
    const params = buildFinanceCorrectionAuditSearchParams({
      page: 2,
      pageSize: 20,
      month: "2026-06",
      operation: "link_ledger_payment",
      project_id: "project-1",
      actor_employee_id: "employee-1",
      date_from: "2026-06-01",
      date_to: "2026-06-30",
    });

    expect(params.toString()).toBe(
      "page=2&pageSize=20&month=2026-06&date_from=2026-06-01&date_to=2026-06-30&project_id=project-1&operation=link_ledger_payment&actor_employee_id=employee-1",
    );
  });

  test("maps operation and domain labels", () => {
    expect(financeCorrectionAuditOperationLabel("manual_allocation"))
      .toBe("人工核销");
    expect(financeCorrectionAuditOperationLabel("generate_payment_ledger"))
      .toBe("补生成收款台账");
    expect(financeCorrectionAuditOperationLabel("generate_expense_ledger"))
      .toBe("补生成支出台账");
    expect(
      financeCorrectionAuditOperationLabel("update_expense_ledger_category"),
    ).toBe("补支出台账成本分类");
    expect(
      financeCorrectionAuditOperationLabel(
        "record_expense_amount_mismatch_review",
      ),
    ).toBe("记录费用金额复核");
    expect(financeCorrectionAuditOperationLabel("mark_legacy_ledger"))
      .toBe("标记历史流水");
    expect(financeCorrectionAuditDomainMeta("receivable")).toEqual({
      label: "应收核销",
      variant: "secondary",
    });
    expect(financeCorrectionAuditDomainMeta("ledger")).toEqual({
      label: "台账修正",
      variant: "outline",
    });
  });

  test("keeps row links inside finance pages", () => {
    expect(
      safeFinanceCorrectionAuditHref("/finance/ledger?ledger_id=ledger-1"),
    ).toBe("/finance/ledger?ledger_id=ledger-1");
    expect(safeFinanceCorrectionAuditHref("https://example.com"))
      .toBe("/finance/audits");
  });

  test("builds an empty correction audit result with pagination", () => {
    expect(emptyFinanceCorrectionAuditResult(3, 50)).toEqual({
      list: [],
      pagination: {
        page: 3,
        pageSize: 50,
        total: 0,
        totalPages: 0,
      },
      summary: {
        total: 0,
        ledger_repair: 0,
        receivable_allocation: 0,
      },
      error: null,
    });
  });
});
