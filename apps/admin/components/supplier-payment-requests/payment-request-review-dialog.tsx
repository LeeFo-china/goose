"use client";

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
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";

import { formatPaymentMoney } from "./payment-request-page-utils";
import type { SupplierPaymentRequest } from "./payment-request-types";
import { paymentRequestStatusMeta, shortPaymentId } from "./payment-request-ui";

export type PaymentRequestReviewAction =
  | "submit"
  | "approve"
  | "reject"
  | "cancel"
  | "close";

const actionCopy: Record<PaymentRequestReviewAction, {
  title: string;
  description: string;
  confirm: string;
}> = {
  submit: {
    title: "提交付款申请？",
    description: "服务端会重新校验全部应付余额并锁定申请分配。",
    confirm: "确认提交",
  },
  approve: {
    title: "批准付款申请？",
    description: "批准后具备付款权限的员工可登记实际付款。",
    confirm: "确认批准",
  },
  reject: {
    title: "驳回付款申请？",
    description: "驳回后释放锁定的应付余额，原因会进入审核记录。",
    confirm: "确认驳回",
  },
  cancel: {
    title: "取消付款申请？",
    description: "取消后释放未付款余额，申请不可恢复。",
    confirm: "确认取消",
  },
  close: {
    title: "关闭剩余付款？",
    description: "关闭后释放未支付的申请余额，已付款事实保留。",
    confirm: "确认关闭",
  },
};

export function PaymentRequestReviewDialog({
  open,
  action,
  request,
  projectName,
  supplierName,
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
  action: PaymentRequestReviewAction;
  request: SupplierPaymentRequest | null;
  projectName?: string;
  supplierName?: string;
  value: string;
  busy: boolean;
  frozen: boolean;
  error?: string | null;
  onValueChange: (value: string) => void;
  onOpenChange: (open: boolean) => void;
  onAbandon: () => void;
  onConfirm: () => void;
}) {
  const copy = actionCopy[action];
  const requiresReason = action === "reject" || action === "cancel" ||
    action === "close";
  const label = action === "reject"
    ? "驳回原因"
    : action === "cancel"
    ? "取消原因"
    : action === "close"
    ? "关闭原因"
    : "审批备注";
  const showTextarea = action !== "submit";
  const invalid = requiresReason && !value.trim();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>
        {request ? (
          <dl className="grid gap-2 rounded-md border bg-muted/20 p-3 text-sm sm:grid-cols-2">
            <Fact label="申请号" value={request.request_no} />
            <Fact label="状态版本" value={`${paymentRequestStatusMeta[request.status].label} · v${request.version}`} />
            <Fact label="项目" value={projectName ?? shortPaymentId(request.project_id)} />
            <Fact label="供应商" value={supplierName ?? shortPaymentId(request.tenant_supplier_id)} />
            <Fact label="申请金额" value={formatPaymentMoney(request.requested_amount)} />
          </dl>
        ) : null}
        {showTextarea ? (
          <Field data-invalid={invalid}>
            <FieldLabel htmlFor={`payment-request-${action}-reason`}>
              {label}
            </FieldLabel>
            <Textarea
              id={`payment-request-${action}-reason`}
              value={value}
              maxLength={500}
              disabled={busy || frozen}
              aria-invalid={invalid}
              placeholder={requiresReason ? "必填" : "选填"}
              onChange={(event) => onValueChange(event.target.value)}
            />
            <FieldError>{invalid ? `${label}不能为空` : undefined}</FieldError>
          </Field>
        ) : null}
        {error ? <StatusAlert>{error}</StatusAlert> : null}
        <DialogFooter>
          {frozen ? (
            <Button type="button" variant="outline" disabled={busy} onClick={onAbandon}>
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
            variant={requiresReason ? "destructive" : "default"}
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

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="truncate font-medium">{value}</dd>
    </div>
  );
}
