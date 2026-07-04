import { AlertTriangle, ShoppingCart, type LucideIcon } from "lucide-react";
import { TenantRechargeOrderButton } from "@/components/billing/tenant-recharge-actions";
import type {
  BillingLedger,
  TenantBillingSummary,
  TenantRechargeProduct,
} from "@/components/billing/billing-types";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

export function AccountStat({
  label,
  value,
  helper,
  icon: Icon,
}: {
  label: string;
  value: string;
  helper: string;
  icon: LucideIcon;
}) {
  return (
    <div className="px-4 py-3">
      <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <span>{label}</span>
        <Icon className="size-4" />
      </div>
      <div className="mt-1 text-2xl font-semibold tracking-normal tabular-nums">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{helper}</div>
    </div>
  );
}

export function PriceLine({
  label,
  value,
  min,
  icon: Icon,
}: {
  label: string;
  value: string;
  min: number;
  icon: LucideIcon;
}) {
  return (
    <div className="border-t px-4 py-3 first:border-t-0 md:border-t-0">
      <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <span>{label}</span>
        <Icon className="size-4" />
      </div>
      <div className="mt-1 text-sm font-semibold tracking-normal">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">最低 {formatCredits(min)} 积分</div>
    </div>
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

function formatCredits(value: number | null | undefined) {
  return Number(value || 0).toLocaleString("zh-CN");
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
