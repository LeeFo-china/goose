import { redirect } from "next/navigation";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  AlertTriangle,
  BrainCircuit,
  Clock3,
  LockKeyhole,
  MessageSquareText,
  ShoppingCart,
  Video,
  WalletCards,
  type LucideIcon,
} from "lucide-react";
import { TenantRechargeOrderButton } from "@/components/billing/tenant-recharge-actions";
import type {
  BillingLedger,
  BillingLedgerListData,
  TenantBillingSummary,
  TenantFeatureEstimates,
  TenantRechargeProduct,
  TenantRechargeProductListData,
} from "@/components/billing/billing-types";
import { StatusAlert } from "@/components/admin/status-alert";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getAdminSession, getAdminToken } from "@/lib/auth";
import { buildBackendUrl, parseBackendJson } from "@/lib/backend";

const emptySummary: TenantBillingSummary = {
  account: {
    id: "",
    tenant_id: "",
    balance_credits: 0,
    frozen_credits: 0,
    available_credits: 0,
    total_recharged_credits: 0,
    total_consumed_credits: 0,
    status: "active",
    last_activity_at: null,
    updated_at: null,
  },
  period: { start_date: null, end_date: null },
  totals: {
    recharged_credits: 0,
    consumed_credits: 0,
    frozen_credits: 0,
    available_credits: 0,
  },
  metrics: [],
  subscription_lock: {
    locked: false,
    reason: null,
    locked_at: null,
    last_invoice_id: null,
  },
};

const emptyEstimates: TenantFeatureEstimates = {
  sms: { metric_code: "sms_domestic_success", unit: "message", unit_credits: 50, min_charge_credits: 50 },
  social_video: { metric_code: "social_video_transcription_minute", unit: "minute", unit_credits: 60, min_charge_credits: 60 },
  ai: { input_token_1k_credits: 10, output_token_1k_credits: 50, min_charge_credits: 0 },
};

const emptyLedger: BillingLedgerListData = {
  list: [],
  pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
};

const emptyRechargeProducts: TenantRechargeProductListData = {
  list: [],
  pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
};

const accountStatusMeta: Record<string, { label: string; variant: BadgeProps["variant"] }> = {
  active: { label: "正常", variant: "success" },
  suspended: { label: "暂停", variant: "warning" },
  closed: { label: "关闭", variant: "secondary" },
};

async function fetchBackend<T>(path: string, fallback: T) {
  const token = await getAdminToken();
  if (!token) {
    return { data: fallback, error: "缺少登录凭证" };
  }

  try {
    const response = await fetch(buildBackendUrl(path), {
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const payload = await parseBackendJson<T>(response);
    return { data: payload.data || fallback, error: null, code: null };
  } catch (error) {
    return {
      data: fallback,
      error: error instanceof Error ? error.message : "计费数据加载失败",
      code: getErrorCode(error),
    };
  }
}

function getErrorCode(error: unknown) {
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === "string" ? code : null;
  }

  return null;
}

function formatCredits(value: number | null | undefined) {
  return Number(value || 0).toLocaleString("zh-CN");
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

function directionLabel(direction: string) {
  const labels: Record<string, string> = {
    in: "入账",
    out: "扣费",
    freeze: "冻结",
    unfreeze: "解冻",
  };
  return labels[direction] || direction;
}

function formatFen(value: number) {
  return `￥${(Number(value || 0) / 100).toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function hasPermission(
  session: Awaited<ReturnType<typeof getAdminSession>>,
  permissionCode: string,
) {
  return Boolean(
    session?.permissions.some((permission) => permission.code === permissionCode),
  );
}

export default async function TenantBillingPage() {
  const session = await getAdminSession();
  if (!session) {
    redirect("/login");
  }

  if (session.roles.includes("platform_admin")) {
    redirect("/platform/billing");
  }

  const [summaryResult, estimateResult, ledgerResult] = await Promise.all([
    fetchBackend<TenantBillingSummary>("/billing/summary", emptySummary),
    fetchBackend<TenantFeatureEstimates>("/billing/feature-estimates", emptyEstimates),
    fetchBackend<BillingLedgerListData>("/billing/ledger?page=1&pageSize=20", emptyLedger),
  ]);
  const canRecharge = hasPermission(session, "billing.recharge.create");
  const subscriptionLock = summaryResult.data.subscription_lock;
  const isBillingLocked = subscriptionLock.locked ||
    summaryResult.code === "TENANT_BILLING_LOCKED" ||
    estimateResult.code === "TENANT_BILLING_LOCKED" ||
    ledgerResult.code === "TENANT_BILLING_LOCKED";
  const rechargeProductsResult = isBillingLocked && canRecharge
    ? await fetchBackend<TenantRechargeProductListData>(
      "/billing/recharge-products?page=1&pageSize=20",
      emptyRechargeProducts,
    )
    : { data: emptyRechargeProducts, error: null, code: null };
  const account = summaryResult.data.account;
  const status = account.status
    ? accountStatusMeta[account.status] || { label: account.status, variant: "outline" as const }
    : { label: "未初始化", variant: "outline" as const };
  const accountStats = [
    { label: "可用积分", value: formatCredits(account.available_credits), helper: "当前可扣费余额", icon: WalletCards },
    { label: "冻结积分", value: formatCredits(account.frozen_credits), helper: "待结算或锁定额度", icon: LockKeyhole },
    { label: "累计充值", value: formatCredits(account.total_recharged_credits), helper: "历史入账总额", icon: ArrowDownToLine },
    { label: "累计消耗", value: formatCredits(account.total_consumed_credits), helper: "历史扣费总额", icon: ArrowUpFromLine },
  ];
  const priceLines = [
    {
      label: "短信",
      value: `${formatCredits(estimateResult.data.sms.unit_credits)} 积分 / 条`,
      min: estimateResult.data.sms.min_charge_credits,
      icon: MessageSquareText,
    },
    {
      label: "视频转文本",
      value: `${formatCredits(estimateResult.data.social_video.unit_credits)} 积分 / 分钟`,
      min: estimateResult.data.social_video.min_charge_credits,
      icon: Video,
    },
    {
      label: "AI token",
      value: `输入 ${formatCredits(estimateResult.data.ai.input_token_1k_credits)} / 输出 ${formatCredits(estimateResult.data.ai.output_token_1k_credits)} 积分`,
      min: estimateResult.data.ai.min_charge_credits,
      icon: BrainCircuit,
    },
  ];
  const lastActivity = formatDateTime(account.last_activity_at || account.updated_at);

  return (
    <div className="flex h-[calc(100vh-6.5625rem)] min-h-0 flex-col gap-5 overflow-auto lg:overflow-hidden">
      <div className="flex shrink-0 flex-col justify-between gap-3 md:flex-row md:items-end">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-normal">计费账户</h1>
            <Badge variant={status.variant}>{status.label}</Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            查看当前租户积分余额、近期扣费和主要功能的计费口径。
          </p>
        </div>
        <div className="flex w-fit items-center gap-2 rounded-md border bg-card px-3 py-2 text-sm text-muted-foreground">
          <Clock3 className="size-4" />
          最近活动 {lastActivity}
        </div>
      </div>

      {summaryResult.error ? <StatusAlert>{summaryResult.error}</StatusAlert> : null}
      {estimateResult.error ? <StatusAlert>{estimateResult.error}</StatusAlert> : null}
      {ledgerResult.error ? <StatusAlert>{ledgerResult.error}</StatusAlert> : null}

      {isBillingLocked ? (
        <BillingLockedPanel
          canRecharge={canRecharge}
          lock={subscriptionLock}
          productError={rechargeProductsResult.error}
          products={rechargeProductsResult.data.list}
        />
      ) : null}

      <Card className="shrink-0 overflow-hidden shadow-none">
        <CardHeader className="border-b bg-muted/20 p-4">
          <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-start">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle>账户概览</CardTitle>
                <Badge variant={status.variant}>{status.label}</Badge>
              </div>
              <CardDescription className="mt-1">
                可用余额、冻结额度和当前功能计费口径集中展示。
              </CardDescription>
            </div>
            <div className="rounded-md border bg-background px-3 py-2 text-sm">
              <div className="text-xs text-muted-foreground">当前可用</div>
              <div className="mt-1 text-lg font-semibold tabular-nums">
                {formatCredits(account.available_credits)} 积分
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="grid divide-y md:grid-cols-4 md:divide-x md:divide-y-0">
            {accountStats.map((item) => (
              <AccountStat key={item.label} {...item} />
            ))}
          </div>
          <Separator />
          <div className="grid lg:grid-cols-[13rem_minmax(0,1fr)]">
            <div className="border-b px-4 py-3 lg:border-b-0 lg:border-r">
              <CardTitle className="text-sm">功能计费</CardTitle>
              <CardDescription className="mt-1 text-xs">
                账单生成时会保存价格快照。
              </CardDescription>
            </div>
            <div className="grid md:grid-cols-3 md:divide-x">
              {priceLines.map((item) => (
                <PriceLine key={item.label} {...item} />
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="flex min-h-[18rem] flex-1 flex-col overflow-hidden shadow-none lg:min-h-0">
        <CardHeader className="shrink-0 border-b bg-muted/20 p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <CardTitle>积分流水</CardTitle>
              <CardDescription className="mt-1">
                租户最近的充值、扣费、冻结和解冻记录。
              </CardDescription>
            </div>
            <Badge variant="outline" className="w-fit tabular-nums">
              最近 {ledgerResult.data.list.length} 条 / 共 {ledgerResult.data.pagination.total} 条
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col p-0">
          <div data-testid="tenant-billing-ledger-viewport" className="min-h-0 flex-1 overflow-auto">
            <Table className="table-fixed" containerClassName="min-w-[780px] overflow-visible">
              <TableHeader className="sticky top-0 z-10 bg-background">
                <TableRow>
                  <TableHead className="w-[150px]">时间</TableHead>
                  <TableHead className="w-[118px]">类型</TableHead>
                  <TableHead>来源</TableHead>
                  <TableHead className="w-[128px] text-right">积分</TableHead>
                  <TableHead className="w-[128px] text-right">余额</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ledgerResult.data.list.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{formatDateTime(item.created_at)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="whitespace-nowrap">{directionLabel(item.direction)}</Badge>
                      <div className="mt-1 text-xs text-muted-foreground">{item.event_type}</div>
                    </TableCell>
                    <TableCell>
                      <div className="min-w-0 truncate" title={ledgerSourceLabel(item)}>
                        {ledgerSourceLabel(item)}
                      </div>
                      {item.remark ? (
                        <div className="mt-1 min-w-0 truncate text-xs text-muted-foreground" title={item.remark}>
                          {item.remark}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell className={`text-right font-medium tabular-nums ${ledgerDirectionClassName(item.direction)}`}>
                      {formatCredits(item.change_credits)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatCredits(item.balance_after)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {!ledgerResult.data.list.length ? (
              <div
                data-testid="tenant-billing-ledger-empty"
                className="flex h-24 items-center justify-center border-t text-sm text-muted-foreground"
              >
                暂无积分流水
              </div>
            ) : null}
          </div>
          <div className="shrink-0 border-t bg-card px-4 py-3 text-sm text-muted-foreground">
            <span className="tabular-nums">
              当前显示 {ledgerResult.data.list.length} 条，接口返回第 {ledgerResult.data.pagination.page} / {Math.max(1, ledgerResult.data.pagination.totalPages)} 页
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function AccountStat({
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

function PriceLine({
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

function BillingLockedPanel({
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
    <Card className="shrink-0 border-warning/60 bg-warning/5 shadow-none">
      <CardHeader className="border-b border-warning/30 p-4">
        <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <AlertTriangle className="size-5 text-warning-foreground" />
              <CardTitle>系统使用费待缴纳</CardTitle>
              <Badge variant="warning">已锁定</Badge>
            </div>
            <CardDescription className="mt-1">
              当前租户积分不足，业务功能已暂停。充值到账后系统会自动补扣欠费并恢复使用。
            </CardDescription>
          </div>
          {lock.locked_at ? (
            <Badge variant="outline" className="w-fit">
              锁定时间 {formatDateTime(lock.locked_at)}
            </Badge>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="grid lg:grid-cols-[15rem_minmax(0,1fr)]">
          <div className="border-b px-4 py-3 lg:border-b-0 lg:border-r">
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
          <div className="min-w-0">
            {productError ? (
              <div className="px-4 py-3 text-sm text-destructive">
                {productError}
              </div>
            ) : !canRecharge ? (
              <div className="px-4 py-3 text-sm text-muted-foreground">
                当前账号没有积分充值权限。
              </div>
            ) : products.length ? (
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
            ) : (
              <div className="px-4 py-3 text-sm text-muted-foreground">
                暂无可用充值套餐。
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ledgerSourceLabel(item: BillingLedger) {
  return [item.source_type, item.source_id].filter(Boolean).join(" / ") || item.order_no || "-";
}

function ledgerDirectionClassName(direction: string) {
  if (direction === "out" || direction === "freeze") return "text-destructive";
  if (direction === "in" || direction === "unfreeze") return "text-success";

  return "";
}
