"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Eye,
  Loader2,
  RotateCcw,
  SendHorizontal,
  WalletCards,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Person = {
  id?: string | null;
  name?: string | null;
  phone?: string | null;
  status?: string | null;
};

type Project = {
  id?: string | null;
  name?: string | null;
  status?: string | null;
};

export type ExpenseItem = {
  id: string;
  occurred_at: string | null;
  category_code: string | null;
  category: string | null;
  amount: number;
  remark: string | null;
  invoice_no: string | null;
  vendor_name: string | null;
  evidence_images?: string[];
};

export type ApprovalRecord = {
  id: string;
  step: string;
  action: string;
  approver_id: string | null;
  comment: string | null;
  created_at: string | null;
  approver?: Person | Person[] | null;
};

export type ApprovalChainRecord = {
  id: string;
  step: string;
  step_name: string;
  sort_order: number;
  assignee_id: string;
  assignee_name_snapshot: string | null;
  required_permission: string;
  status: string;
  acted_by: string | null;
  acted_at: string | null;
  comment: string | null;
  assignee?: Person | Person[] | null;
};

type SettlementRecord = {
  id: string;
  payee_name?: string | null;
  payee_bank?: string | null;
  payee_account?: string | null;
  method: string;
  paid_amount: number;
  paid_at: string | null;
  remark?: string | null;
  evidence_images?: string[];
  paid_operator?: Person | Person[] | null;
};

export type ExpenseRecord = {
  id: string;
  request_no: string | null;
  employee_id: string;
  project_id: string | null;
  mode: string;
  title: string | null;
  total_amount: number;
  status: string;
  current_step: string;
  submitted_at: string | null;
  approved_at: string | null;
  rejected_at: string | null;
  cancelled_at: string | null;
  completed_at: string | null;
  assignee_id: string | null;
  rejected_reason: string | null;
  created_at: string | null;
  updated_at: string | null;
  employee?: Person | Person[] | null;
  project?: Project | Project[] | null;
  assignee?: Person | Person[] | null;
  items?: ExpenseItem[];
  approvals?: ApprovalRecord[];
  settlement?: SettlementRecord | SettlementRecord[] | null;
  approval_chain?: ApprovalChainRecord[];
};

const settlementMethodOptions = [
  ["bank_transfer", "银行转账"],
  ["wechat", "微信转账"],
  ["alipay", "支付宝"],
  ["cash", "现金"],
] as const;

const modeLabel: Record<string, string> = {
  reimbursement: "员工报销",
  advance: "预借款",
  direct: "公司直付",
  petty_cash: "备用金",
};

const actionLabel: Record<string, string> = {
  submit: "提交",
  resubmit: "重新提交",
  approve: "通过",
  reject: "驳回",
  cancel: "撤回",
  pay: "打款",
};

function relationOne<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function personName(value: Person | Person[] | null | undefined) {
  const item = relationOne(value);
  return item?.name || item?.phone || "-";
}

function projectName(value: Project | Project[] | null | undefined) {
  const item = relationOne(value);
  return item?.name || "-";
}

function formatMoney(value: number | string | null | undefined) {
  const amount = Number(value || 0);
  return amount.toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getPayloadMessage(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object" && "message" in payload) {
    const message = (payload as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

async function requestExpense(input: {
  path: string;
  method?: "GET" | "POST";
  payload?: unknown;
}) {
  const response = await fetch(`/api/backend${input.path}`, {
    method: input.method || "GET",
    headers: input.payload ? { "content-type": "application/json" } : undefined,
    body: input.payload ? JSON.stringify(input.payload) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    throw new Error(getPayloadMessage(payload, "操作失败"));
  }
  return payload.data;
}

function DetailDialog({
  expense,
  onClose,
}: {
  expense: ExpenseRecord;
  onClose: () => void;
}) {
  const settlement = relationOne(expense.settlement);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/30 p-4">
      <div className="max-h-[88vh] w-full max-w-[920px] overflow-hidden rounded-lg border bg-card shadow-[0_20px_80px_rgba(15,23,42,0.22)]">
        <div className="flex items-start justify-between gap-4 border-b p-5">
          <div>
            <h2 className="text-base font-semibold">{expense.title || "费用申请详情"}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {expense.request_no || expense.id} · {personName(expense.employee)}
            </p>
          </div>
          <Button type="button" variant="outline" onClick={onClose}>关闭</Button>
        </div>
        <div className="max-h-[calc(88vh-82px)] space-y-5 overflow-y-auto p-5">
          <div className="grid gap-3 md:grid-cols-4">
            <InfoItem label="金额" value={`¥${formatMoney(expense.total_amount)}`} />
            <InfoItem label="模式" value={modeLabel[expense.mode] || expense.mode} />
            <InfoItem label="项目" value={projectName(expense.project)} />
            <InfoItem label="创建时间" value={formatDateTime(expense.created_at)} />
          </div>

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
                        <td className="px-4 py-3">{item.category || item.category_code || "-"}</td>
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
            <h3 className="mb-3 text-sm font-semibold">审批链</h3>
            <div className="grid gap-2 md:grid-cols-2">
              {(expense.approval_chain || []).map((node) => (
                <div key={node.id} className="rounded-md border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium">{node.step_name || node.step}</div>
                    <Badge variant={node.status === "approved" ? "success" : node.status === "current" ? "warning" : "outline"}>
                      {node.status}
                    </Badge>
                  </div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    {personName(node.assignee)} · {formatDateTime(node.acted_at)}
                  </div>
                  {node.comment ? (
                    <div className="mt-2 text-sm text-muted-foreground">{node.comment}</div>
                  ) : null}
                </div>
              ))}
              {(expense.approval_chain || []).length === 0 ? (
                <div className="rounded-md border p-4 text-sm text-muted-foreground">
                  暂无审批链
                </div>
              ) : null}
            </div>
          </section>

          <section>
            <h3 className="mb-3 text-sm font-semibold">审批记录</h3>
            <div className="space-y-2">
              {(expense.approvals || []).map((item) => (
                <div key={item.id} className="rounded-md border p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      {actionLabel[item.action] || item.action} · {personName(item.approver)}
                    </div>
                    <span className="text-muted-foreground">{formatDateTime(item.created_at)}</span>
                  </div>
                  {item.comment ? (
                    <div className="mt-1 text-muted-foreground">{item.comment}</div>
                  ) : null}
                </div>
              ))}
              {(expense.approvals || []).length === 0 ? (
                <div className="rounded-md border p-4 text-sm text-muted-foreground">
                  暂无审批记录
                </div>
              ) : null}
            </div>
          </section>

          {settlement ? (
            <section>
              <h3 className="mb-3 text-sm font-semibold">打款记录</h3>
              <div className="grid gap-3 rounded-md border p-4 md:grid-cols-4">
                <InfoItem label="收款人" value={settlement.payee_name || "-"} />
                <InfoItem label="方式" value={settlement.method} />
                <InfoItem label="金额" value={`¥${formatMoney(settlement.paid_amount)}`} />
                <InfoItem label="时间" value={formatDateTime(settlement.paid_at)} />
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-background p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 truncate text-sm font-medium">{value}</div>
    </div>
  );
}

function PayDialog({
  expense,
  currentEmployeeId,
  onClose,
  onDone,
}: {
  expense: ExpenseRecord;
  currentEmployeeId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const evidenceImages = String(formData.get("evidence_images") || "")
      .split(/[\n,]/)
      .map((item) => item.trim())
      .filter(Boolean);
    const payload = {
      payee_name: String(formData.get("payee_name") || "").trim(),
      payee_bank: String(formData.get("payee_bank") || "").trim() || null,
      payee_account: String(formData.get("payee_account") || "").trim() || null,
      method: String(formData.get("method") || "bank_transfer"),
      paid_amount: Number(formData.get("paid_amount") || expense.total_amount),
      paid_at: new Date(String(formData.get("paid_at") || new Date().toISOString())).toISOString(),
      paid_by: currentEmployeeId,
      evidence_images: evidenceImages,
      remark: String(formData.get("remark") || "").trim() || null,
    };

    setError("");
    startTransition(async () => {
      try {
        await requestExpense({
          path: `/expense-requests/${expense.id}/pay`,
          method: "POST",
          payload,
        });
        onDone();
      } catch (err) {
        setError(err instanceof Error ? err.message : "登记打款失败");
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/30 p-4">
      <div className="w-full max-w-[560px] rounded-lg border bg-card shadow-[0_20px_80px_rgba(15,23,42,0.22)]">
        <div className="border-b p-5">
          <h2 className="text-base font-semibold">登记打款</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            金额必须等于申请总额 ¥{formatMoney(expense.total_amount)}，打款凭证至少 1 张。
          </p>
        </div>
        <form className="space-y-4 p-5" onSubmit={submit}>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="payee_name">收款人</Label>
              <Input id="payee_name" name="payee_name" disabled={pending} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="method">打款方式</Label>
              <select
                id="method"
                name="method"
                disabled={pending}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              >
                {settlementMethodOptions.map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="paid_amount">打款金额</Label>
              <Input
                id="paid_amount"
                name="paid_amount"
                type="number"
                step="0.01"
                defaultValue={expense.total_amount}
                disabled={pending}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="paid_at">打款时间</Label>
              <Input
                id="paid_at"
                name="paid_at"
                type="datetime-local"
                defaultValue={new Date().toISOString().slice(0, 16)}
                disabled={pending}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="payee_bank">收款银行</Label>
              <Input id="payee_bank" name="payee_bank" disabled={pending} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="payee_account">收款账号</Label>
              <Input id="payee_account" name="payee_account" disabled={pending} />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="evidence_images">打款凭证 URL</Label>
              <textarea
                id="evidence_images"
                name="evidence_images"
                placeholder="每行一个图片地址"
                disabled={pending}
                required
                className="min-h-[84px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="remark">备注</Label>
              <textarea
                id="remark"
                name="remark"
                disabled={pending}
                className="min-h-[72px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>
          </div>
          {error ? (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          ) : null}
          <div className="flex justify-end gap-2 border-t pt-4">
            <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
              取消
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : <WalletCards />}
              确认打款
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function ExpenseRowActions({
  expense,
  currentEmployeeId,
}: {
  expense: ExpenseRecord;
  currentEmployeeId: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [detail, setDetail] = useState<ExpenseRecord | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const canApprove = expense.status === "pending" &&
    ["manager_review", "finance_review"].includes(expense.current_step);
  const canCancel = ["draft", "pending", "rejected"].includes(expense.status) &&
    Boolean(currentEmployeeId);
  const canPay = expense.status === "approved" &&
    expense.current_step === "payment" &&
    Boolean(currentEmployeeId);

  function refresh() {
    router.refresh();
  }

  function runAction(input: {
    label: string;
    path: string;
    payload: unknown;
    confirm?: string;
  }) {
    if (input.confirm && !window.confirm(input.confirm)) return;
    setError("");
    startTransition(async () => {
      try {
        await requestExpense({
          path: input.path,
          method: "POST",
          payload: input.payload,
        });
        refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : `${input.label}失败`);
      }
    });
  }

  function approve() {
    const comment = window.prompt("审批意见（可留空）");
    if (comment === null) return;
    runAction({
      label: "审批通过",
      path: `/expense-requests/${expense.id}/approve`,
      payload: { comment: comment.trim() || null },
    });
  }

  function reject() {
    const reason = window.prompt("请输入驳回原因");
    if (!reason?.trim()) return;
    runAction({
      label: "审批驳回",
      path: `/expense-requests/${expense.id}/reject`,
      payload: {
        rejected_reason: reason.trim(),
        comment: reason.trim(),
      },
    });
  }

  function cancel() {
    if (!currentEmployeeId) return;
    const comment = window.prompt("撤回说明（可留空）") || "";
    runAction({
      label: "撤回",
      path: `/expense-requests/${expense.id}/cancel`,
      payload: {
        operator_id: currentEmployeeId,
        comment: comment.trim() || null,
      },
      confirm: "确认撤回这条费用申请？",
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

  return (
    <div className="flex items-center justify-end gap-2">
      <Button type="button" variant="outline" size="sm" onClick={openDetail} disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : <Eye />}
        详情
      </Button>
      {canApprove ? (
        <>
          <Button type="button" variant="outline" size="sm" onClick={approve} disabled={pending}>
            <CheckCircle2 />
            通过
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={reject} disabled={pending}>
            <XCircle />
            驳回
          </Button>
        </>
      ) : null}
      {canCancel ? (
        <Button type="button" variant="outline" size="sm" onClick={cancel} disabled={pending}>
          <RotateCcw />
          撤回
        </Button>
      ) : null}
      {canPay ? (
        <Button type="button" variant="outline" size="sm" onClick={() => setPayOpen(true)} disabled={pending}>
          <SendHorizontal />
          打款
        </Button>
      ) : null}
      {detail ? <DetailDialog expense={detail} onClose={() => setDetail(null)} /> : null}
      {payOpen && currentEmployeeId ? (
        <PayDialog
          expense={expense}
          currentEmployeeId={currentEmployeeId}
          onClose={() => setPayOpen(false)}
          onDone={() => {
            setPayOpen(false);
            refresh();
          }}
        />
      ) : null}
      {error ? (
        <div className="absolute right-5 mt-10 max-w-[360px] rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 shadow-sm">
          {error}
        </div>
      ) : null}
    </div>
  );
}
