"use client";

import { type FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PaymentTypeConfig } from "@gooes/domain";
import {
  CalendarClock,
  Edit3,
  Loader2,
  MessageSquarePlus,
  Plus,
  ReceiptText,
  Trash2,
} from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FinanceReceivableAllocationDialog } from "./finance-receivable-allocation-dialog";
import type { FinanceReceivableRecord } from "./finance-requests";
import { requestBackendJson } from "@/lib/backend-client";

type DialogMode =
  | "create"
  | "edit"
  | "adjust_due_date"
  | "cancel"
  | "follow_up"
  | "allocate";
type ReceivableDialogMode = Exclude<DialogMode, "allocate">;

const PAYMENT_TYPES = ["deposit", "stage_1", "stage_2", "stage_3", "add_on"] as const;

export function FinanceReceivableCreateButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" size="sm" onClick={() => setOpen(true)}>
        <Plus data-icon="inline-start" />
        新增应收
      </Button>
      {open ? (
        <FinanceReceivableDialog
          mode="create"
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

export function FinanceReceivableRowActions({
  row,
}: {
  row: FinanceReceivableRecord;
}) {
  const [mode, setMode] = useState<DialogMode | null>(null);
  const readonly = row.status === "paid" || row.status === "canceled";
  const canCancel = row.status !== "paid" && row.status !== "canceled" &&
    Number(row.paid_amount || 0) <= 0;

  return (
    <div className="flex justify-end gap-1">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-8 px-2"
        disabled={readonly}
        onClick={() => setMode("allocate")}
      >
        <ReceiptText data-icon="inline-start" />
        核销
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-8 px-2"
        disabled={readonly}
        onClick={() => setMode("edit")}
      >
        <Edit3 data-icon="inline-start" />
        调整
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-8 px-2"
        disabled={readonly}
        onClick={() => setMode("adjust_due_date")}
      >
        <CalendarClock data-icon="inline-start" />
        延期
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-8 px-2"
        disabled={readonly}
        onClick={() => setMode("follow_up")}
      >
        <MessageSquarePlus data-icon="inline-start" />
        跟进
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-8 px-2 text-destructive hover:text-destructive"
        disabled={!canCancel}
        onClick={() => setMode("cancel")}
      >
        <Trash2 data-icon="inline-start" />
        取消
      </Button>
      {mode === "allocate" ? (
        <FinanceReceivableAllocationDialog
          row={row}
          onClose={() => setMode(null)}
        />
      ) : mode ? (
        <FinanceReceivableDialog
          mode={mode}
          row={row}
          onClose={() => setMode(null)}
        />
      ) : null}
    </div>
  );
}

function FinanceReceivableDialog({
  mode,
  row,
  onClose,
}: {
  mode: ReceivableDialogMode;
  row?: FinanceReceivableRecord;
  onClose: () => void;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const title = dialogTitle(mode);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    startTransition(async () => {
      try {
        await requestBackendJson(dialogPath(mode, row?.id), {
          method: dialogMethod(mode),
          body: JSON.stringify(buildPayload(mode, form)),
          fallbackMessage: `${title}失败`,
        });
        onClose();
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : `${title}失败`);
      }
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? "人工补录非 workflow 自动生成的项目应收计划。"
              : "操作会写入应收运营记录，便于后续追溯。"}
          </DialogDescription>
        </DialogHeader>

        {error ? <StatusAlert>{error}</StatusAlert> : null}

        <form id="receivable-operation-form" className="grid gap-3" onSubmit={submit}>
          {mode === "create" ? (
            <LabeledInput
              label="项目 ID"
              name="project_id"
              required
              disabled={pending}
            />
          ) : null}
          {mode === "create" || mode === "edit" ? (
            <>
              <label className="grid gap-1.5 text-sm">
                <span className="text-xs font-medium text-muted-foreground">收款类型</span>
                <select
                  name="payment_type"
                  className="h-9 rounded-md border bg-background px-3 text-sm"
                  defaultValue={row?.payment_type || "add_on"}
                  disabled={pending}
                >
                  {PAYMENT_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {PaymentTypeConfig[type].label}
                    </option>
                  ))}
                </select>
              </label>
              <LabeledInput
                label="应收事项"
                name="title"
                required={mode === "create"}
                defaultValue={row?.title}
                disabled={pending}
              />
              <LabeledInput
                label="应收金额"
                name="amount"
                type="number"
                step="0.01"
                min="0.01"
                required={mode === "create"}
                defaultValue={row ? String(row.amount) : undefined}
                disabled={pending}
              />
              <LabeledInput
                label="应收日期"
                name="due_date"
                type="date"
                required={mode === "create"}
                defaultValue={row?.due_date}
                disabled={pending}
              />
              <LabeledInput
                label="负责人 ID"
                name="owner_employee_id"
                defaultValue={row?.owner_employee_id || ""}
                disabled={pending}
              />
            </>
          ) : null}
          {mode === "adjust_due_date" ? (
            <>
              <LabeledInput
                label="新的应收日期"
                name="due_date"
                type="date"
                required
                defaultValue={row?.due_date}
                disabled={pending}
              />
              <Textarea
                name="reason"
                required
                disabled={pending}
                placeholder="请输入调整原因"
              />
            </>
          ) : null}
          {mode === "cancel" ? (
            <Textarea
              name="reason"
              required
              disabled={pending}
              placeholder="请输入取消原因"
            />
          ) : null}
          {mode === "follow_up" ? (
            <>
              <Textarea
                name="note"
                required
                disabled={pending}
                placeholder="请输入本次跟进内容"
              />
              <LabeledInput
                label="下次跟进时间"
                name="next_follow_up_at"
                type="datetime-local"
                disabled={pending}
              />
            </>
          ) : null}
          {mode === "create" || mode === "edit" ? (
            <Textarea
              name="remark"
              disabled={pending}
              placeholder={mode === "create" ? "备注" : "调整说明"}
            />
          ) : null}
        </form>

        <DialogFooter>
          <Button type="button" variant="outline" disabled={pending} onClick={onClose}>
            关闭
          </Button>
          <Button type="submit" form="receivable-operation-form" disabled={pending}>
            {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LabeledInput(props: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  disabled?: boolean;
  defaultValue?: string;
  step?: string;
  min?: string;
}) {
  const { label, ...inputProps } = props;
  return (
    <label className="grid gap-1.5 text-sm">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <Input className="h-9" {...inputProps} />
    </label>
  );
}

function dialogTitle(mode: ReceivableDialogMode) {
  if (mode === "create") return "新增应收";
  if (mode === "edit") return "调整应收";
  if (mode === "adjust_due_date") return "调整到期日";
  if (mode === "cancel") return "取消应收";
  return "登记跟进";
}

function dialogMethod(mode: ReceivableDialogMode) {
  return mode === "edit" || mode === "adjust_due_date" ? "PATCH" : "POST";
}

function dialogPath(mode: ReceivableDialogMode, id?: string) {
  if (mode === "create") return "/finance/receivables";
  if (!id) return "/finance/receivables";
  if (mode === "adjust_due_date") return `/finance/receivables/${id}/due-date`;
  if (mode === "cancel") return `/finance/receivables/${id}/cancel`;
  if (mode === "follow_up") return `/finance/receivables/${id}/follow-ups`;
  return `/finance/receivables/${id}`;
}

function buildPayload(mode: ReceivableDialogMode, form: FormData) {
  if (mode === "cancel") return { reason: read(form, "reason") };
  if (mode === "adjust_due_date") {
    return {
      due_date: read(form, "due_date"),
      reason: read(form, "reason"),
    };
  }
  if (mode === "follow_up") {
    return {
      note: read(form, "note"),
      next_follow_up_at: readDateTime(form, "next_follow_up_at"),
    };
  }
  return compact({
    project_id: read(form, "project_id"),
    payment_type: read(form, "payment_type"),
    title: read(form, "title"),
    amount: readNumber(form, "amount"),
    due_date: read(form, "due_date"),
    owner_employee_id: read(form, "owner_employee_id"),
    remark: read(form, "remark"),
  });
}

function read(form: FormData, key: string) {
  const value = form.get(key);
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readNumber(form: FormData, key: string) {
  const value = read(form, key);
  return value === undefined ? undefined : Number(value);
}

function readDateTime(form: FormData, key: string) {
  const value = read(form, key);
  return value ? new Date(value).toISOString() : undefined;
}

function compact<T extends Record<string, unknown>>(input: T) {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  );
}
