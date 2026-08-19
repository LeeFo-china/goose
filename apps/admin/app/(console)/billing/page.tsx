import { redirect } from "next/navigation";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  BrainCircuit,
  Clock3,
  LockKeyhole,
  MessageSquareText,
  Video,
  WalletCards,
} from "lucide-react";
import {
  AccountOverviewCard,
  BillingLockedPanel,
  FeaturePricingCard,
  ledgerDirectionClassName,
  ledgerSourceLabel,
} from "./billing-page-sections";
import type {
  BillingLedgerListData,
  TenantBillingSummary,
  TenantFeatureEstimates,
  TenantRechargeProductListData,
} from "@/components/billing/billing-types";
import { StatusAlert } from "@/components/admin/status-alert";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getAdminSession, getAdminToken } from "@/lib/auth";
import { buildBackendUrl, parseBackendJson } from "@/lib/backend";
import { isPlatformOnlySession } from "@/lib/session-mode";
import { cn } from "@/lib/utils";

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

function ledgerEventTypeLabel(eventType: string) {
  const labels: Record<string, string> = {
    manual_recharge: "人工积分充值",
    wechat_recharge: "微信支付积分充值",
    billing_charge: "功能服务扣费",
    subscription_monthly_fee: "系统月度使用费",
    subscription_monthly: "系统月度使用费",
    billing_refund: "服务扣费退回",
    billing_freeze: "积分冻结",
    billing_unfreeze: "积分解冻",
  };
  return labels[eventType] || eventType;
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

  if (isPlatformOnlySession(session)) {
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
    <div className="flex h-[calc(100vh-6.5625rem)] min-h-0 flex-col gap-4 overflow-hidden">
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
        {lastActivity !== "-" ? (
          <div className="flex w-fit items-center gap-2 text-sm text-muted-foreground">
            <Clock3 className="size-4" />
            最近活动 {lastActivity}
          </div>
        ) : null}
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

      <section data-testid="tenant-billing-account-section" className="shrink-0">
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1.35fr)_minmax(20rem,0.65fr)]">
          <AccountOverviewCard
            availableCredits={account.available_credits}
            balanceCredits={account.balance_credits}
            frozenCredits={account.frozen_credits}
            lastActivity={lastActivity}
            metrics={accountStats}
            status={status}
          />
          <FeaturePricingCard items={priceLines} />
        </div>
      </section>

      <Card
        data-testid="tenant-billing-ledger-card"
        className="flex min-h-0 flex-1 flex-col overflow-hidden shadow-none"
      >
        <CardHeader className="shrink-0 flex-row items-start justify-between gap-3 border-b bg-muted/20 p-4">
          <div className="min-w-0">
            <CardTitle className="text-sm">积分流水</CardTitle>
            <CardDescription className="mt-1 text-xs">
              租户最近的充值、扣费、冻结和解冻记录。
            </CardDescription>
          </div>
          <Badge
            variant="outline"
            className="w-fit shrink-0 tabular-nums"
          >
            最近 {ledgerResult.data.list.length} 条 / 共{" "}
            {ledgerResult.data.pagination.total} 条
          </Badge>
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col overflow-hidden p-0">
          <div
            data-testid="tenant-billing-ledger-viewport"
            className="min-h-0 flex-1 overflow-auto"
          >
            <Table
              className="table-fixed"
              containerClassName="min-w-[780px] overflow-visible"
            >
              <TableHeader className="sticky top-0 z-10 bg-card">
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
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {formatDateTime(item.created_at)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="whitespace-nowrap">
                        {directionLabel(item.direction)}
                      </Badge>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {ledgerEventTypeLabel(item.event_type)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div
                        className="min-w-0 truncate"
                        title={ledgerSourceLabel(item)}
                      >
                        {ledgerSourceLabel(item)}
                      </div>
                      {item.remark ? (
                        <div
                          className="mt-1 min-w-0 truncate text-xs text-muted-foreground"
                          title={item.remark}
                        >
                          {item.remark}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right font-medium tabular-nums",
                        ledgerDirectionClassName(item.direction),
                      )}
                    >
                      {formatCredits(item.change_credits)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCredits(item.balance_after)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {!ledgerResult.data.list.length ? (
              <Empty
                data-testid="tenant-billing-ledger-empty"
                className="h-40 rounded-none border-0 border-t p-6"
              >
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <WalletCards />
                  </EmptyMedia>
                  <EmptyTitle className="text-sm">暂无积分流水</EmptyTitle>
                  <EmptyDescription>
                    充值、扣费、冻结和解冻记录会显示在这里。
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : null}
          </div>
        </CardContent>
        <CardFooter className="shrink-0 border-t px-4 py-3 text-sm text-muted-foreground">
          <span className="tabular-nums">
            当前显示 {ledgerResult.data.list.length} 条，接口返回第{" "}
            {ledgerResult.data.pagination.page} /{" "}
            {Math.max(1, ledgerResult.data.pagination.totalPages)} 页
          </span>
        </CardFooter>
      </Card>
    </div>
  );
}
