"use client";

import { Badge } from "@/components/ui/badge";
import { ApprovalTimeline } from "@/components/admin/approval-timeline";
import { DetailInfoGrid } from "@/components/admin/detail-info-grid";
import { ImageAttachmentList } from "@/components/admin/attachment-list";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { ExpenseRecord } from "@/components/expenses/expense-mutation-types";
import {
  formatApprovalAction,
  formatDateTime,
  expenseCostCategoryLabel,
  formatExpenseCategory,
  formatMoney,
  formatSettlementMethod,
  getEvidenceImagePreviewSrc,
  modeLabel,
  personName,
  projectName,
  relationOne,
} from "@/components/expenses/expense-mutation-shared";

export function DetailDialog({
  expense,
  onClose,
}: {
  expense: ExpenseRecord;
  onClose: () => void;
}) {
  const settlement = relationOne(expense.settlement);
  const workflowState = expense.workflow_state;
  const settlementEvidenceImages = settlement?.evidence_images || [];
  const settlementAttachments = settlementEvidenceImages.map((image, index) => {
    const previewSrc = getEvidenceImagePreviewSrc(image);
    return {
      id: `${image}-${index}`,
      src: previewSrc,
      alt: `打款凭证 ${index + 1}`,
      label: `凭证 ${index + 1}`,
      title: `打款凭证 ${index + 1}`,
    };
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[88vh] max-w-[920px] overflow-hidden p-0">
        <DialogHeader className="flex-row items-start justify-between gap-4 border-b p-5 text-left">
          <div>
            <DialogTitle>{expense.title || "费用申请详情"}</DialogTitle>
            <DialogDescription>
              {expense.request_no || expense.id} · {personName(expense.employee)}
            </DialogDescription>
          </div>
          <Button type="button" variant="outline" onClick={onClose}>关闭</Button>
        </DialogHeader>
        <div className="flex max-h-[calc(88vh-82px)] flex-col gap-5 overflow-y-auto p-5">
          <DetailInfoGrid
            items={[
              { label: "金额", value: `¥${formatMoney(expense.total_amount)}` },
              { label: "模式", value: modeLabel[expense.mode] || expense.mode },
              { label: "项目", value: projectName(expense.project) },
              { label: "成本归集", value: expenseCostCategoryLabel(expense) },
              { label: "创建时间", value: formatDateTime(expense.created_at) },
            ]}
          />

          <section>
            <h3 className="mb-3 text-sm font-semibold">费用明细</h3>
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">分类</th>
                    <th className="px-4 py-3">金额</th>
                    <th className="px-4 py-3">商户</th>
                    <th className="px-4 py-3">发生时间</th>
                    <th className="px-4 py-3">说明</th>
                  </tr>
                </thead>
                <tbody>
                  {(expense.items || []).length > 0 ? (
                    (expense.items || []).map((item) => (
                      <tr key={item.id} className="border-t">
                        <td className="px-4 py-3">{formatExpenseCategory(item)}</td>
                        <td className="px-4 py-3">¥{formatMoney(item.amount)}</td>
                        <td className="px-4 py-3">{item.vendor_name || "-"}</td>
                        <td className="px-4 py-3">{formatDateTime(item.occurred_at)}</td>
                        <td className="px-4 py-3 text-muted-foreground">{item.remark || "-"}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td className="px-4 py-8 text-center text-muted-foreground" colSpan={5}>
                        暂无费用明细
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h3 className="mb-3 text-sm font-semibold">流程状态</h3>
            <div className="rounded-md border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-medium">
                  {workflowState?.current_node_title ||
                    workflowState?.current_node_key ||
                    "未接入流程"}
                </div>
                <Badge variant={workflowState?.instance_status === "failed" ? "danger" : "outline"}>
                  {workflowState?.instance_status || "未启动"}
                </Badge>
              </div>
              <div className="mt-2 grid gap-2 text-sm text-muted-foreground md:grid-cols-3">
                <div>
                  待办数：{workflowState?.pending_task_count ?? 0}
                </div>
                <div>
                  当前节点：{workflowState?.current_node_key || "-"}
                </div>
                <div>
                  更新时间：{formatDateTime(workflowState?.updated_at)}
                </div>
              </div>
            </div>
          </section>

          <section>
            <h3 className="mb-3 text-sm font-semibold">审批记录</h3>
            <ApprovalTimeline
              emptyText="暂无审批记录"
              items={(expense.approvals || []).map((item) => ({
                id: item.id,
                title: `${formatApprovalAction(item.action)} · ${personName(item.approver)}`,
                meta: formatDateTime(item.created_at),
                description: item.comment || undefined,
              }))}
            />
          </section>

          {settlement ? (
            <section>
              <h3 className="mb-3 text-sm font-semibold">打款记录</h3>
              <div className="flex flex-col gap-4 rounded-md border p-4">
                <DetailInfoGrid
                  items={[
                    { label: "收款人", value: settlement.payee_name || "-" },
                    { label: "方式", value: formatSettlementMethod(settlement.method) },
                    { label: "金额", value: `¥${formatMoney(settlement.paid_amount)}` },
                    { label: "时间", value: formatDateTime(settlement.paid_at) },
                  ]}
                />

                <div className="flex flex-col gap-2">
                  <div className="text-xs font-medium text-muted-foreground">打款凭证</div>
                  <ImageAttachmentList
                    images={settlementAttachments}
                    emptyText="暂无打款凭证"
                  />
                </div>
              </div>
            </section>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
