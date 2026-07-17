import type { ComponentProps } from "react";
import { FilterSelect } from "@/components/admin/filter-select";
import { RechargeRefundRequestDetailButton } from "@/components/billing/billing-recharge-refund-actions";
import type {
  PlatformRechargeRefundRequest,
  PlatformRechargeRefundRequestListData,
  PlatformRechargeRefundStatus,
} from "@/components/billing/billing-types";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TabsContent } from "@/components/ui/tabs";
import { FilterInput, FilterPanel, formatCredits, formatDateTime, SectionHeader } from "./billing-page-shared";

type RechargeRefundFilters = {
  rechargeRefundStatus?: string;
  rechargeRefundKeyword?: string;
};

export function BillingRechargeRefundsTab({
  refunds,
  refundFilters,
}: {
  refunds: PlatformRechargeRefundRequestListData;
  refundFilters: RechargeRefundFilters;
}) {
  return (
    <TabsContent value="refunds" className="mt-0">
      <div className="flex flex-col gap-3 p-3">
        <SectionHeader
          title="退款审核"
          description="审核小程序提交的充值退款申请。真实微信退款暂不在此页面执行。"
          badge={`${refunds.pagination.total} 条申请`}
        />
        <FilterPanel tab="refunds">
          <FilterInput
            label="退款关键词"
            name="rechargeRefundKeyword"
            defaultValue={refundFilters.rechargeRefundKeyword}
            placeholder="申请号 / 订单号 / 微信交易号"
          />
          <FilterSelect
            label="审核状态"
            name="rechargeRefundStatus"
            defaultValue={refundFilters.rechargeRefundStatus}
            options={[
              { label: "待审核", value: "pending_review" },
              { label: "已通过", value: "approved" },
              { label: "已驳回", value: "rejected" },
              { label: "退款中", value: "refunding" },
              { label: "已退款", value: "refunded" },
              { label: "退款失败", value: "failed" },
            ]}
          />
        </FilterPanel>
        <div className="overflow-hidden rounded-md border">
          <Table className="table-fixed">
            <TableHeader>
              <TableRow>
                <TableHead className="w-40">申请时间</TableHead>
                <TableHead className="w-[18%]">租户</TableHead>
                <TableHead>订单 / 申请</TableHead>
                <TableHead className="w-28 text-right">退款金额</TableHead>
                <TableHead className="w-24 text-right">积分</TableHead>
                <TableHead className="w-24">状态</TableHead>
                <TableHead className="w-24 text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {refunds.list.map((request) => (
                <TableRow key={request.id}>
                  <TableCell>{formatDateTime(request.created_at)}</TableCell>
                  <TableCell>
                    <div className="min-w-0">
                      <div className="truncate font-medium">{tenantLabel(request)}</div>
                      <div className="truncate text-xs text-muted-foreground">{request.tenant?.slug || request.tenant_id}</div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="min-w-0">
                      <div className="truncate font-medium">{request.order?.order_no || request.order_id}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {request.request_no} · {request.order?.transaction_id || request.order?.out_trade_no || "无微信交易号"}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">{formatFen(request.requested_amount_fen)}</TableCell>
                  <TableCell className="text-right">{formatCredits(request.requested_credits)}</TableCell>
                  <TableCell>
                    <Badge variant={refundStatusVariant(request.status)}>{refundStatusLabel(request.status)}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <RechargeRefundRequestDetailButton request={request} />
                  </TableCell>
                </TableRow>
              ))}
              {!refunds.list.length ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center text-sm text-muted-foreground">
                    暂无退款申请
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>
      </div>
    </TabsContent>
  );
}

function tenantLabel(request: PlatformRechargeRefundRequest) {
  return request.tenant?.name || request.tenant?.slug || request.tenant_id;
}

function formatFen(value: number | null | undefined) {
  return `¥${(Number(value || 0) / 100).toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function refundStatusLabel(status: PlatformRechargeRefundStatus) {
  const labels: Record<PlatformRechargeRefundStatus, string> = {
    pending_review: "待审核",
    approved: "已通过",
    rejected: "已驳回",
    refunding: "退款中",
    refunded: "已退款",
    failed: "退款失败",
  };
  return labels[status];
}

function refundStatusVariant(
  status: PlatformRechargeRefundStatus,
): ComponentProps<typeof Badge>["variant"] {
  if (status === "refunded") return "success";
  if (status === "failed" || status === "rejected") return "danger";
  if (status === "pending_review" || status === "refunding") return "warning";
  return "secondary";
}
