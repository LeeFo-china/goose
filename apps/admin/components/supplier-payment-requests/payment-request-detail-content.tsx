import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { getEvidenceImagePreviewSrc } from "@/components/expenses/expense-mutation-shared";
import { formatPaymentMoney } from "./payment-request-page-utils";
import type {
  SupplierPaymentPage,
  SupplierPaymentRequestDetail,
} from "./payment-request-types";
import {
  formatPaymentDateTime,
  paymentMethodLabels,
  paymentRequestStatusMeta,
  shortPaymentId,
} from "./payment-request-ui";

export function PaymentRequestFacts({
  detail,
  projectName,
  supplierName,
}: {
  detail: SupplierPaymentRequestDetail;
  projectName?: string;
  supplierName?: string;
}) {
  const request = detail.payment_request;
  const timeline = [
    {
      key: "created",
      label: "创建草稿",
      at: request.created_at,
      note: null,
    },
    {
      key: "submitted",
      label: "提交审批",
      at: request.submitted_at,
      note: null,
    },
    {
      key: "reviewed",
      label: request.status === "rejected" ? "驳回申请" : "审核申请",
      at: request.reviewed_at,
      note: request.review_remark,
    },
    {
      key: "cancelled",
      label: "取消申请",
      at: request.cancelled_at,
      note: request.cancel_reason,
    },
    {
      key: "closed",
      label: "关闭尾款",
      at: request.closed_at,
      note: request.close_reason,
    },
  ].filter(({ at }) => at !== null);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-lg font-semibold">{request.request_no}</span>
        <Badge variant={paymentRequestStatusMeta[request.status].variant}>
          {paymentRequestStatusMeta[request.status].label}
        </Badge>
        <Badge variant="outline">版本 {request.version}</Badge>
      </div>
      <dl className="grid gap-3 rounded-md border bg-muted/20 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <Fact label="项目" value={projectName ?? shortPaymentId(request.project_id)} />
        <Fact label="供应商" value={supplierName ?? shortPaymentId(request.tenant_supplier_id)} />
        <Fact label="申请金额" value={formatPaymentMoney(request.requested_amount)} />
        <Fact label="已付金额" value={formatPaymentMoney(request.paid_amount)} />
        <Fact label="申请原因" value={request.reason} />
        <Fact label="备注" value={request.remark ?? "-"} />
        <Fact label="提交时间" value={formatPaymentDateTime(request.submitted_at)} />
        <Fact label="审批时间" value={formatPaymentDateTime(request.reviewed_at)} />
      </dl>
      <section className="flex flex-col gap-2">
        <h3 className="text-base font-semibold">状态时间线</h3>
        <ol className="flex flex-col gap-2 rounded-md border p-3">
          {timeline.map((event) => (
            <li key={event.key} className="grid gap-1 text-sm sm:grid-cols-[9rem_11rem_1fr]">
              <span className="font-medium">{event.label}</span>
              <time className="tabular-nums text-muted-foreground">
                {formatPaymentDateTime(event.at)}
              </time>
              <span className="break-words text-muted-foreground">
                {event.note ?? "-"}
              </span>
            </li>
          ))}
        </ol>
      </section>
      {detail.allocations.some(({ invoice_required_before_payment }) =>
        invoice_required_before_payment
      ) ? (
        <Alert variant="destructive">
          <AlertTitle>发票门禁</AlertTitle>
          <AlertDescription>
            该申请至少一个应付来源要求付款前发票，当前不提供绕过操作。
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}

export function PaymentRequestAllocations({
  detail,
}: {
  detail: SupplierPaymentRequestDetail;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-base font-semibold">应付分配</h3>
      <Table containerClassName="max-w-full overflow-x-auto">
        <TableHeader>
          <TableRow>
            <TableHead>采购/收货来源</TableHead>
            <TableHead>到期日</TableHead>
            <TableHead className="text-right">应付金额</TableHead>
            <TableHead className="text-right">申请金额</TableHead>
            <TableHead className="text-right">已付金额</TableHead>
            <TableHead>发票门禁</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {detail.allocations.map((allocation) => (
            <TableRow key={allocation.id}>
              <TableCell className="font-mono text-xs">
                {shortPaymentId(allocation.supplier_purchase_order_id)} / {shortPaymentId(allocation.receipt_id)}
              </TableCell>
              <TableCell>{formatPaymentDateTime(allocation.due_at)}</TableCell>
              <Money value={allocation.payable_amount} />
              <Money value={allocation.requested_amount} />
              <Money value={allocation.paid_amount} />
              <TableCell>
                <Badge variant={allocation.invoice_required_before_payment ? "danger" : "secondary"}>
                  {allocation.invoice_required_before_payment ? "付款前需发票" : "无"}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  );
}

export function PaymentRecords({
  payments,
  loading,
  onPageChange,
}: {
  payments: SupplierPaymentPage;
  loading: boolean;
  onPageChange: (page: number) => void;
}) {
  return (
    <section className="flex flex-col gap-3">
      <Separator />
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-base font-semibold">付款记录</h3>
        <span className="text-sm text-muted-foreground">共 {payments.pagination.total} 笔</span>
      </div>
      {payments.list.length === 0 ? (
        <p className="text-sm text-muted-foreground">暂无付款记录。</p>
      ) : payments.list.map((payment) => (
        <div key={payment.id} className="flex flex-col gap-3 rounded-md border p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-mono font-medium">{payment.payment_no}</span>
            <span className="font-mono font-semibold">{formatPaymentMoney(payment.amount)}</span>
          </div>
          <div className="grid gap-2 text-sm sm:grid-cols-3">
            <Fact label="付款方式" value={paymentMethodLabels[payment.payment_method]} />
            <Fact label="付款流水" value={payment.payment_reference} />
            <Fact label="付款时间" value={formatPaymentDateTime(payment.paid_at)} />
          </div>
          <div className="flex gap-2 overflow-x-auto">
            {payment.evidence_images.map((image, index) => (
              <a key={image} href={getEvidenceImagePreviewSrc(image)} target="_blank" rel="noreferrer">
                <img src={getEvidenceImagePreviewSrc(image)} alt={`付款凭证 ${index + 1}`} className="size-20 rounded-md border object-cover" />
              </a>
            ))}
          </div>
        </div>
      ))}
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={loading || payments.pagination.page <= 1}
          onClick={() => onPageChange(payments.pagination.page - 1)}
        >
          上一页
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={loading || payments.pagination.page >= Math.max(1, payments.pagination.totalPages)}
          onClick={() => onPageChange(payments.pagination.page + 1)}
        >
          下一页
        </Button>
      </div>
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="break-words font-medium">{value}</dd>
    </div>
  );
}

function Money({ value }: { value: string }) {
  return <TableCell className="text-right font-mono">{formatPaymentMoney(value)}</TableCell>;
}
