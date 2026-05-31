"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Eye, Loader2, MoreHorizontal, RotateCcw, SendHorizontal, XCircle } from "lucide-react";
import { TextActionDialog } from "@/components/admin/action-dialogs";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { DetailDialog } from "@/components/expenses/expense-detail-dialog";
import { PayDialog } from "@/components/expenses/expense-pay-dialog";
import type { ApprovalChainRecord, ApprovalRecord, ExpenseItem, ExpenseRecord } from "@/components/expenses/expense-mutation-types";
import { requestExpense } from "@/components/expenses/expense-mutation-shared";

export type { ApprovalChainRecord, ApprovalRecord, ExpenseItem, ExpenseRecord } from "@/components/expenses/expense-mutation-types";

export function ExpenseRowActions({
  expense,
  currentEmployeeId,
  onExpenseUpdated,
}: {
  expense: ExpenseRecord;
  currentEmployeeId: string | null;
  onExpenseUpdated?: (expense: ExpenseRecord) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [detail, setDetail] = useState<ExpenseRecord | null>(null);
  const [payExpense, setPayExpense] = useState<ExpenseRecord | null>(null);
  const [approvalDialog, setApprovalDialog] = useState<"approve" | "reject" | "cancel" | null>(null);
  const canApprove = expense.status === "pending" &&
    ["manager_review", "finance_review"].includes(expense.current_step);
  const canCancel = ["draft", "pending", "rejected"].includes(expense.status) &&
    Boolean(currentEmployeeId);
  const canPay = expense.status === "approved" &&
    expense.current_step === "payment" &&
    Boolean(currentEmployeeId);

  function runAction(input: {
    label: string;
    path: string;
    payload: unknown;
  }) {
    setError("");
    startTransition(async () => {
      try {
        const data = await requestExpense({
          path: input.path,
          method: "POST",
          payload: input.payload,
        });
        onExpenseUpdated?.(data as ExpenseRecord);
      } catch (err) {
        setError(err instanceof Error ? err.message : `${input.label}失败`);
      }
    });
  }

  function approve(comment: string) {
    setApprovalDialog(null);
    runAction({
      label: "审批通过",
      path: `/expense-requests/${expense.id}/approve`,
      payload: { comment: comment.trim() || null },
    });
  }

  function reject(reason: string) {
    setApprovalDialog(null);
    runAction({
      label: "审批驳回",
      path: `/expense-requests/${expense.id}/reject`,
      payload: {
        rejected_reason: reason.trim(),
        comment: reason.trim(),
      },
    });
  }

  function cancel(comment: string) {
    if (!currentEmployeeId) return;
    setApprovalDialog(null);
    runAction({
      label: "撤回",
      path: `/expense-requests/${expense.id}/cancel`,
      payload: {
        operator_id: currentEmployeeId,
        comment: comment.trim() || null,
      },
    });
  }

  function openDetail() {
    setError("");
    startTransition(async () => {
      try {
        const data = await requestExpense({ path: `/expense-requests/${expense.id}` });
        setDetail(data as ExpenseRecord);
      } catch (err) {
        setError(err instanceof Error ? err.message : "详情加载失败");
      }
    });
  }

  function openPay() {
    setError("");
    startTransition(async () => {
      try {
        const data = await requestExpense({ path: `/expense-requests/${expense.id}` });
        setPayExpense(data as ExpenseRecord);
      } catch (err) {
        setError(err instanceof Error ? err.message : "打款信息加载失败");
      }
    });
  }

  return (
    <div className="relative flex min-w-24 justify-end whitespace-nowrap">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" size="sm" disabled={pending}>
            {pending ? (
              <Loader2 className="animate-spin" data-icon="inline-start" />
            ) : (
              <MoreHorizontal data-icon="inline-start" />
            )}
            操作
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="left" sideOffset={8} className="w-36">
          <DropdownMenuGroup>
            <DropdownMenuItem disabled={pending} onSelect={openDetail}>
              <Eye />
              详情
            </DropdownMenuItem>
            {canApprove ? (
              <>
                <DropdownMenuItem disabled={pending} onSelect={() => setApprovalDialog("approve")}>
                  <CheckCircle2 />
                  通过
                </DropdownMenuItem>
                <DropdownMenuItem disabled={pending} onSelect={() => setApprovalDialog("reject")}>
                  <XCircle />
                  驳回
                </DropdownMenuItem>
              </>
            ) : null}
            {canCancel ? (
              <DropdownMenuItem disabled={pending} onSelect={() => setApprovalDialog("cancel")}>
                <RotateCcw />
                撤回
              </DropdownMenuItem>
            ) : null}
            {canPay ? (
              <DropdownMenuItem disabled={pending} onSelect={openPay}>
                <SendHorizontal />
                打款
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      {detail ? <DetailDialog expense={detail} onClose={() => setDetail(null)} /> : null}
      {payExpense && currentEmployeeId ? (
        <PayDialog
          expense={payExpense}
          currentEmployeeId={currentEmployeeId}
          onClose={() => setPayExpense(null)}
          onDone={(updatedExpense) => {
            setPayExpense(null);
            onExpenseUpdated?.(updatedExpense);
          }}
        />
      ) : null}
      <TextActionDialog
        open={approvalDialog === "approve"}
        onOpenChange={(open) => setApprovalDialog(open ? "approve" : null)}
        title="审批通过"
        description="可填写审批意见，留空将直接通过。"
        label="审批意见"
        placeholder="请输入审批意见"
        submitLabel="确认通过"
        pending={pending}
        onSubmit={approve}
      />
      <TextActionDialog
        open={approvalDialog === "reject"}
        onOpenChange={(open) => setApprovalDialog(open ? "reject" : null)}
        title="审批驳回"
        description="请输入驳回原因，系统会同步写入审批记录。"
        label="驳回原因"
        placeholder="请输入驳回原因"
        submitLabel="确认驳回"
        required
        pending={pending}
        onSubmit={reject}
      />
      <TextActionDialog
        open={approvalDialog === "cancel"}
        onOpenChange={(open) => setApprovalDialog(open ? "cancel" : null)}
        title="撤回费用申请"
        description="确认撤回这条费用申请？可补充撤回说明。"
        label="撤回说明"
        placeholder="请输入撤回说明"
        submitLabel="确认撤回"
        pending={pending}
        onSubmit={cancel}
      />
      {error ? (
        <div className="absolute right-5 mt-10 max-w-[360px] rounded-md border border-destructive/50 bg-background px-3 py-2 text-xs text-destructive shadow-sm">
          {error}
        </div>
      ) : null}
    </div>
  );
}
