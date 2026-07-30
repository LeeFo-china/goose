"use client";

import { StatusAlert } from "@/components/admin/status-alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";

export type RequisitionConfirmAction =
  | "submit"
  | "approve"
  | "reject"
  | "cancel"
  | "convert";

const content: Record<
  RequisitionConfirmAction,
  { title: string; description: string; confirm: string }
> = {
  submit: {
    title: "提交采购申请？",
    description: "服务端将重新按有效目录计价并生成项目预算快照。",
    confirm: "确认提交",
  },
  approve: {
    title: "批准采购申请？",
    description: "批准后保留预算承诺，申请可继续生成采购单。",
    confirm: "确认批准",
  },
  reject: {
    title: "驳回采购申请？",
    description: "驳回后释放预算承诺，原因会记录在审核事实中。",
    confirm: "确认驳回",
  },
  cancel: {
    title: "取消采购申请？",
    description: "取消后不可恢复，已预占的预算会被释放。",
    confirm: "确认取消",
  },
  convert: {
    title: "生成采购单草稿？",
    description: "将按当前服务端事实创建采购单草稿，并转换预算承诺。",
    confirm: "生成采购单",
  },
};

export function RequisitionReviewDialog({
  open,
  action,
  value,
  busy,
  frozen,
  error,
  onValueChange,
  onOpenChange,
  onAbandon,
  onConfirm,
}: {
  open: boolean;
  action: RequisitionConfirmAction;
  value: string;
  busy: boolean;
  frozen: boolean;
  error?: string | null;
  onValueChange: (value: string) => void;
  onOpenChange: (open: boolean) => void;
  onAbandon: () => void;
  onConfirm: () => void;
}) {
  const copy = content[action];
  const requiresReason = action === "reject" || action === "cancel";
  const label = action === "approve"
    ? "审核备注"
    : action === "reject"
    ? "驳回原因"
    : "取消原因";
  const showTextarea = action === "approve" || requiresReason;
  const invalid = requiresReason && !value.trim();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>
        {showTextarea ? (
          <Field data-invalid={invalid}>
            <FieldLabel htmlFor={`requisition-${action}-remark`}>
              {label}
            </FieldLabel>
            <Textarea
              id={`requisition-${action}-remark`}
              value={value}
              maxLength={500}
              disabled={busy || frozen}
              aria-invalid={invalid}
              placeholder={action === "approve" ? "选填" : "必填"}
              onChange={(event) => onValueChange(event.target.value)}
            />
            <FieldError>
              {invalid ? `${label}不能为空` : undefined}
            </FieldError>
          </Field>
        ) : null}
        {error ? (
          <StatusAlert>{error}</StatusAlert>
        ) : null}
        <DialogFooter>
          {frozen ? (
            <Button type="button" variant="outline" disabled={busy}
              onClick={onAbandon}>
              放弃本次重试并刷新
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            disabled={busy || frozen}
            onClick={() => onOpenChange(false)}
          >
            返回
          </Button>
          <Button
            type="button"
            variant={action === "reject" || action === "cancel"
              ? "destructive"
              : "default"}
            disabled={busy || invalid}
            onClick={onConfirm}
          >
            {busy ? <Spinner data-icon="inline-start" /> : null}
            {copy.confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
