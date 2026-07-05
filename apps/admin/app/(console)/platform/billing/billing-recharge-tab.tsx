import { FilterSelect } from "@/components/admin/filter-select";
import {
  PlatformWechatPayConfigButton,
  RecommendedRechargeProductsButton,
  RechargeProductCreateButton,
  RechargeProductEditButton,
  RechargeProductStatusButton,
} from "@/components/billing/billing-recharge-actions";
import { RechargeOrderDetailButton } from "@/components/billing/billing-recharge-order-actions";
import type {
  PlatformRechargeOrderListData,
  PlatformRechargeProductListData,
  PlatformWechatPayConfigResult,
} from "@/components/billing/billing-types";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TabsContent } from "@/components/ui/tabs";
import { FilterInput, FilterPanel, formatDateTime, SectionHeader } from "./billing-page-shared";

type RechargeOrderFilters = {
  rechargeOrderStatus?: string;
  rechargeOrderKeyword?: string;
};

export function BillingRechargeTab({
  configResult,
  products,
  orders,
  orderFilters,
}: {
  configResult: PlatformWechatPayConfigResult;
  products: PlatformRechargeProductListData;
  orders: PlatformRechargeOrderListData;
  orderFilters: RechargeOrderFilters;
}) {
  return (
    <TabsContent value="recharge" className="mt-0">
      <div className="flex flex-col gap-4 p-3">
        <section className="flex flex-col gap-3">
          <SectionHeader
            title="平台微信支付"
            description="员工小程序积分充值使用平台直连商户，租户项目收款仍走服务商/特约商户链路。"
            badge={configStatusLabel(configResult.config?.status)}
            badgeVariant={configResult.config?.status === "active" ? "success" : "outline"}
            action={<PlatformWechatPayConfigButton configResult={configResult} />}
          />
          <div className="grid gap-3 rounded-md border bg-background p-3 md:grid-cols-4">
            <InfoItem label="商户号" value={configResult.config?.merchant_id || "-"} />
            <InfoItem label="小程序 AppID" value={configResult.config?.app_id || "-"} />
            <InfoItem label="证书序列号" value={configResult.config?.serial_no_masked || "-"} />
            <InfoItem label="密钥引用" value={configResult.config?.has_encrypted_config_ref ? "已配置" : "未配置"} />
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <SectionHeader
            title="充值套餐"
            description="小程序只展示启用套餐，金额、积分和赠送积分以后端配置为准。"
            badge={`${products.pagination.total} 个套餐`}
            action={
              <div className="flex flex-wrap justify-end gap-2">
                <RecommendedRechargeProductsButton />
                <RechargeProductCreateButton />
              </div>
            }
          />
          <div className="overflow-hidden rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>套餐</TableHead>
                  <TableHead className="text-right">金额</TableHead>
                  <TableHead className="text-right">到账积分</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.list.map((product) => (
                  <TableRow key={product.id}>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{product.title}</span>
                        {productBadge(product.metadata) ? (
                          <Badge variant="outline">{productBadge(product.metadata)}</Badge>
                        ) : null}
                      </div>
                      <div className="text-xs text-muted-foreground">{product.code} · 排序 {product.sort_order}</div>
                    </TableCell>
                    <TableCell className="text-right">{formatFen(product.amount_fen)}</TableCell>
                    <TableCell className="text-right">
                      {formatCredits(product.credits)}
                      {product.bonus_credits ? (
                        <span className="ml-1 text-xs text-muted-foreground">+{formatCredits(product.bonus_credits)}</span>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <Badge variant={product.enabled ? "success" : "secondary"}>{product.enabled ? "启用" : "停用"}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <RechargeProductEditButton product={product} />
                        <RechargeProductStatusButton product={product} />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {!products.list.length ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-20 text-center text-sm text-muted-foreground">
                      暂无充值套餐
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <SectionHeader
            title="充值订单"
            description="这里展示员工小程序发起的微信充值订单和回调入账状态。"
            badge={`${orders.pagination.total} 笔订单`}
          />
          <FilterPanel tab="recharge">
            <FilterInput
              label="订单关键词"
              name="rechargeOrderKeyword"
              defaultValue={orderFilters.rechargeOrderKeyword}
              placeholder="订单号 / 商户单号 / 微信交易号"
            />
            <FilterSelect
              label="订单状态"
              name="rechargeOrderStatus"
              defaultValue={orderFilters.rechargeOrderStatus}
              options={[
                { label: "待支付", value: "pending" },
                { label: "已支付", value: "paid" },
                { label: "已关闭", value: "closed" },
                { label: "已退款", value: "refunded" },
              ]}
            />
          </FilterPanel>
          <div className="overflow-hidden rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>时间</TableHead>
                  <TableHead>租户</TableHead>
                  <TableHead>订单</TableHead>
                  <TableHead className="text-right">金额</TableHead>
                  <TableHead className="text-right">积分</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.list.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell>{formatDateTime(order.created_at)}</TableCell>
                    <TableCell>
                      <div className="font-medium">{order.tenant?.name || order.tenant?.slug || order.tenant_id}</div>
                      <div className="text-xs text-muted-foreground">{order.tenant?.slug || order.tenant_id}</div>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{order.order_no}</div>
                      <div className="text-xs text-muted-foreground">{order.transaction_id || order.out_trade_no || "-"}</div>
                    </TableCell>
                    <TableCell className="text-right">{formatFen(order.amount_fen)}</TableCell>
                    <TableCell className="text-right">{formatCredits(order.credits + order.bonus_credits)}</TableCell>
                    <TableCell>
                      <Badge variant={order.status === "paid" ? "success" : order.status === "pending" ? "warning" : "secondary"}>
                        {orderStatusLabel(order.status)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <RechargeOrderDetailButton order={order} />
                    </TableCell>
                  </TableRow>
                ))}
                {!orders.list.length ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center text-sm text-muted-foreground">
                      暂无充值订单
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </section>
      </div>
    </TabsContent>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 truncate text-sm font-medium">{value}</div>
    </div>
  );
}

function formatFen(value: number) {
  return `¥${(Number(value || 0) / 100).toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatCredits(value: number) {
  return Number(value || 0).toLocaleString("zh-CN");
}

function productBadge(metadata: Record<string, unknown>) {
  const badge = metadata.badge;
  return typeof badge === "string" && badge.trim() ? badge.trim() : null;
}

function configStatusLabel(status?: string | null) {
  const labels: Record<string, string> = {
    pending: "待配置",
    active: "启用",
    disabled: "停用",
    suspended: "暂停",
  };
  return status ? labels[status] || status : "未配置";
}

function orderStatusLabel(status: string) {
  const labels: Record<string, string> = {
    pending: "待支付",
    paid: "已支付",
    closed: "已关闭",
    refunded: "已退款",
  };
  return labels[status] || status;
}
