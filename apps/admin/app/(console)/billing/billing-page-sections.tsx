import { AlertTriangle, ShoppingCart, type LucideIcon } from "lucide-react";
import { TenantRechargeOrderButton } from "@/components/billing/tenant-recharge-actions";
import type {
  BillingLedger,
  TenantBillingSummary,
  TenantRechargeProduct,
} from "@/components/billing/billing-types";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";

type AccountMetric = {
  label: string;
  value: string;
  helper: string;
  icon: LucideIcon;
};

type PricingItem = {
  label: string;
  value: string;
  min: number;
  icon: LucideIcon;
};

export function AccountOverviewCard({
  availableCredits,
  balanceCredits,
  frozenCredits,
  lastActivity,
  metrics,
  status,
}: {
  availableCredits: number | null | undefined;
  balanceCredits: number | null | undefined;
  frozenCredits: number | null | undefined;
  lastActivity: string;
  metrics: AccountMetric[];
  status: { label: string; variant: BadgeProps["variant"] };
}) {
  const available = toFiniteNumber(availableCredits);
  const frozen = toFiniteNumber(frozenCredits);
  const balance = toFiniteNumber(balanceCredits) || available + frozen;
  const availableRatio = getAvailableRatio(available, balance);
  const activityLabel = lastActivity === "-" ? "暂无活动" : lastActivity;

  return (
    <Card data-testid="tenant-billing-account-card" className="overflow-hidden shadow-none">
      <CardHeader className="flex-row items-start justify-between gap-3 border-b bg-muted/20 p-4">
        <div className="min-w-0">
          <CardTitle className="text-sm">账户余额</CardTitle>
          <CardDescription className="mt-1 text-xs">
            当前租户可用于短信、视频转文本和 AI 服务扣费的积分。
          </CardDescription>
        </div>
        <Badge variant={status.variant} className="w-fit shrink-0">
          {status.label}
        </Badge>
      </CardHeader>
      <CardContent className="p-0">
        <div className="px-4 py-4">
          <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
            <div className="min-w-0">
              <div className="text-xs text-muted-foreground">当前可用</div>
              <div className="mt-1 flex flex-wrap items-baseline gap-2">
                <span className="text-2xl font-semibold tracking-normal tabular-nums">
                  {formatCredits(available)}
                </span>
                <span className="text-sm text-muted-foreground">积分</span>
              </div>
            </div>
            <div className="text-xs text-muted-foreground md:text-right">
              最近活动 {activityLabel}
            </div>
          </div>
          <div className="mt-4">
            <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
              <span>可用率</span>
              <span className="tabular-nums">{availableRatio}%</span>
            </div>
            <Progress
              value={availableRatio}
              className="mt-2 h-1.5 bg-muted [&>div]:bg-accent"
            />
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className="tabular-nums">总余额 {formatCredits(balance)}</span>
              <span className="tabular-nums">冻结 {formatCredits(frozen)}</span>
            </div>
          </div>
        </div>
        <Separator />
        <div data-testid="tenant-billing-account-metrics" className="grid divide-y md:grid-cols-4 md:divide-x md:divide-y-0">
          {metrics.map((metric) => (
            <AccountMetricCell key={metric.label} {...metric} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function FeaturePricingCard({ items }: { items: PricingItem[] }) {
  return (
    <Card data-testid="tenant-billing-pricing-card" className="overflow-hidden shadow-none">
      <CardHeader className="border-b bg-muted/20 p-4">
        <CardTitle className="text-sm">功能计费</CardTitle>
        <CardDescription className="mt-1 text-xs">
          当前价格口径，实际账单会保留生成时的价格快照。
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y">
          {items.map((item) => (
            <FeaturePriceRow key={item.label} {...item} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function BillingLockedPanel({
  canRecharge,
  lock,
  productError,
  products,
}: {
  canRecharge: boolean;
  lock: TenantBillingSummary["subscription_lock"];
  productError: string | null;
  products: TenantRechargeProduct[];
}) {
  return (
    <Alert className="shrink-0 border-warning/60 bg-warning/5 [&>svg]:text-warning-foreground">
      <AlertTriangle />
      <div className="min-w-0">
        <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <AlertTitle className="mb-0">系统使用费待缴纳</AlertTitle>
              <Badge variant="warning">已锁定</Badge>
            </div>
            <AlertDescription className="mt-1 text-muted-foreground">
              当前租户积分不足，业务功能已暂停。充值到账后系统会自动补扣欠费并恢复使用。
            </AlertDescription>
          </div>
          {lock.locked_at ? (
            <Badge variant="outline" className="w-fit shrink-0">
              锁定时间 {formatDateTime(lock.locked_at)}
            </Badge>
          ) : null}
        </div>
        <Separator className="my-3 bg-warning/30" />
        <div className="grid lg:grid-cols-[14rem_minmax(0,1fr)]">
          <div className="pb-3 lg:border-r lg:pb-0 lg:pr-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <ShoppingCart className="size-4" />
              购买积分
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {canRecharge
                ? "选择套餐后创建支付订单。"
                : "请联系具备积分充值权限的管理员处理。"}
            </p>
            {lock.reason ? (
              <p className="mt-3 text-xs text-muted-foreground">
                原因：{lock.reason}
              </p>
            ) : null}
          </div>
          <div className="min-w-0 lg:pl-4">
            <BillingLockProducts
              canRecharge={canRecharge}
              productError={productError}
              products={products}
            />
          </div>
        </div>
      </div>
    </Alert>
  );
}

export function ledgerSourceLabel(item: BillingLedger) {
  return [item.source_type, item.source_id].filter(Boolean).join(" / ") || item.order_no || "-";
}

export function ledgerDirectionClassName(direction: string) {
  if (direction === "out" || direction === "freeze") return "text-destructive";
  if (direction === "in" || direction === "unfreeze") return "text-success";

  return "";
}

function BillingLockProducts({
  canRecharge,
  productError,
  products,
}: {
  canRecharge: boolean;
  productError: string | null;
  products: TenantRechargeProduct[];
}) {
  if (productError) {
    return <div className="text-sm text-destructive">{productError}</div>;
  }

  if (!canRecharge) {
    return <div className="text-sm text-muted-foreground">当前账号没有积分充值权限。</div>;
  }

  if (!products.length) {
    return <div className="text-sm text-muted-foreground">暂无可用充值套餐。</div>;
  }

  return (
    <div className="divide-y">
      {products.map((product) => (
        <div
          key={product.code}
          className="flex flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:justify-between"
        >
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{product.title}</span>
              <Badge variant="outline">{product.code}</Badge>
            </div>
            <div className="mt-1 text-sm text-muted-foreground">
              {formatFen(product.amount_fen)}，到账 {formatCredits(product.credits + product.bonus_credits)} 积分
            </div>
          </div>
          <TenantRechargeOrderButton product={product} />
        </div>
      ))}
    </div>
  );
}

function AccountMetricCell({
  label,
  value,
  helper,
  icon: Icon,
}: AccountMetric) {
  return (
    <div className="min-w-0 px-4 py-3">
      <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <span>{label}</span>
        <Icon className="size-4 shrink-0" />
      </div>
      <div className="mt-1 truncate text-base font-semibold tracking-normal tabular-nums">
        {value}
      </div>
      <div className="mt-1 truncate text-xs text-muted-foreground">{helper}</div>
    </div>
  );
}

function FeaturePriceRow({
  label,
  value,
  min,
  icon: Icon,
}: PricingItem) {
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
        <Icon className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm font-medium">{label}</div>
          <Badge variant="outline" className="shrink-0 tabular-nums">
            最低 {formatCredits(min)}
          </Badge>
        </div>
        <div className="mt-1 text-sm font-semibold tracking-normal">{value}</div>
      </div>
    </div>
  );
}

function formatCredits(value: number | null | undefined) {
  return Number(value || 0).toLocaleString("zh-CN");
}

function toFiniteNumber(value: number | null | undefined) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

function formatFen(value: number) {
  return `￥${(Number(value || 0) / 100).toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function getAvailableRatio(availableCredits: number, balanceCredits: number) {
  if (balanceCredits <= 0) {
    return availableCredits > 0 ? 100 : 0;
  }

  return Math.min(100, Math.max(0, Math.round((availableCredits / balanceCredits) * 100)));
}
