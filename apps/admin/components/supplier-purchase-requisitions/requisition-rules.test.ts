import { describe, expect, test } from "bun:test";

import { actionsFor } from "./requisition-rules";
import type {
  RequisitionActionContext,
  RequisitionBudgetStatus,
  RequisitionStatus,
} from "./requisition-types";

const CURRENT_EMPLOYEE_ID = "employee-current";
const REQUESTER_EMPLOYEE_ID = "employee-requester";

function context(
  status: RequisitionStatus,
  overrides: Partial<RequisitionActionContext> = {},
): RequisitionActionContext {
  return {
    status,
    budgetStatus: "within_budget",
    currentEmployeeId: CURRENT_EMPLOYEE_ID,
    requesterEmployeeId: REQUESTER_EMPLOYEE_ID,
    canManage: false,
    canApprove: false,
    canManageBudget: false,
    ...overrides,
  };
}

describe("采购申请状态动作规则", () => {
  test("草稿只向管理人显示编辑、提交和取消", () => {
    expect(actionsFor(context("draft", { canManage: true }))).toEqual([
      "edit",
      "submit",
      "cancel",
    ]);
    expect(actionsFor(context("draft"))).toEqual([]);
  });

  test("待审批申请向非申请审批人显示批准和驳回", () => {
    expect(actionsFor(context("pending_approval", {
      canApprove: true,
    }))).toEqual(["approve", "reject"]);
  });

  test("申请人不能自审但有管理权限时可以取消", () => {
    expect(actionsFor(context("pending_approval", {
      currentEmployeeId: REQUESTER_EMPLOYEE_ID,
      canApprove: true,
      canManage: true,
    }))).toEqual(["cancel"]);
  });

  test("超预算且没有预算管理权限时隐藏批准但保留驳回", () => {
    expect(actionsFor(context("pending_approval", {
      budgetStatus: "over_budget",
      canApprove: true,
    }))).toEqual(["reject"]);
    expect(actionsFor(context("pending_approval", {
      budgetStatus: "over_budget",
      canApprove: true,
      canManageBudget: true,
    }))).toEqual(["approve", "reject"]);
  });

  test("待审批管理人可以取消且审批动作保持确定顺序", () => {
    expect(actionsFor(context("pending_approval", {
      canApprove: true,
      canManage: true,
    }))).toEqual(["approve", "reject", "cancel"]);
  });

  test("已批准申请向管理人显示转换和取消", () => {
    expect(actionsFor(context("approved", { canManage: true }))).toEqual([
      "convert",
      "cancel",
    ]);
  });

  test("终态与只读用户不显示 mutation", () => {
    const terminalStatuses: RequisitionStatus[] = [
      "converted",
      "rejected",
      "cancelled",
    ];
    for (const status of terminalStatuses) {
      expect(actionsFor(context(status, {
        canManage: true,
        canApprove: true,
        canManageBudget: true,
      }))).toEqual([]);
    }

    const mutableStates: Array<[
      RequisitionStatus,
      RequisitionBudgetStatus,
    ]> = [
      ["draft", "unchecked"],
      ["pending_approval", "within_budget"],
      ["approved", "within_budget"],
    ];
    for (const [status, budgetStatus] of mutableStates) {
      expect(actionsFor(context(status, { budgetStatus }))).toEqual([]);
    }
  });

  test("无法识别当前员工时审批动作 fail closed", () => {
    expect(actionsFor(context("pending_approval", {
      currentEmployeeId: null,
      canApprove: true,
    }))).toEqual([]);
  });
});
