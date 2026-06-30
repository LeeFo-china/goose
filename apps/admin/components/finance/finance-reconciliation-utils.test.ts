import { describe, expect, test } from "bun:test";
import {
  buildFinanceReconciliationStatsSearchParams,
  buildFinanceReconciliationSearchParams,
  financeReconciliationActionLabel,
  financeReconciliationPrimaryActionLabel,
  financeReconciliationLevelMeta,
  financeReconciliationStatusMeta,
} from "./finance-reconciliation-utils";

describe("finance reconciliation helpers", () => {
  test("builds backend query params for reconciliation filters", () => {
    const params = buildFinanceReconciliationSearchParams({
      page: 2,
      pageSize: 20,
      date_from: "2026-06-01",
      date_to: "2026-06-30",
      exception_code: "payment_without_ledger",
      level: "danger",
      direction: "payment",
      project_id: "project-1",
      status: "acknowledged",
      actor_employee_id: "employee-1",
    });

    expect(params.toString()).toBe(
      "page=2&pageSize=20&date_from=2026-06-01&date_to=2026-06-30&project_id=project-1&exception_code=payment_without_ledger&level=danger&direction=payment&status=acknowledged&actor_employee_id=employee-1",
    );
  });

  test("builds stats query params without pagination", () => {
    const params = buildFinanceReconciliationStatsSearchParams({
      page: 2,
      pageSize: 20,
      date_from: "2026-06-01",
      date_to: "2026-06-30",
      exception_code: "payment_without_ledger",
      level: "danger",
      direction: "payment",
      project_id: "project-1",
      status: "acknowledged",
      actor_employee_id: "employee-1",
    });

    expect(params.toString()).toBe(
      "date_from=2026-06-01&date_to=2026-06-30&project_id=project-1&exception_code=payment_without_ledger&level=danger&direction=payment&status=acknowledged&actor_employee_id=employee-1",
    );
    expect(params.has("page")).toBe(false);
    expect(params.has("pageSize")).toBe(false);
  });

  test("maps reconciliation levels to badge labels", () => {
    expect(financeReconciliationLevelMeta("danger")).toEqual({
      label: "高风险",
      variant: "danger",
    });
    expect(financeReconciliationLevelMeta("warning")).toEqual({
      label: "预警",
      variant: "secondary",
    });
  });

  test("maps reconciliation statuses and actions to labels", () => {
    expect(financeReconciliationStatusMeta("open")).toEqual({
      label: "未处理",
      variant: "warning",
    });
    expect(financeReconciliationStatusMeta("ignored")).toEqual({
      label: "已忽略",
      variant: "secondary",
    });
    expect(financeReconciliationStatusMeta("resolved")).toEqual({
      label: "人工闭环",
      variant: "success",
    });
    expect(financeReconciliationActionLabel("resolve")).toBe("标记人工闭环");
  });

  test("uses a clear manual correction label for row navigation", () => {
    expect(financeReconciliationPrimaryActionLabel("")).toBe("去处理");
    expect(financeReconciliationPrimaryActionLabel(" 查看应收 ")).toBe("查看应收");
  });
});
