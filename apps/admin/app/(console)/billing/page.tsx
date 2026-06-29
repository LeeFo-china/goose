import { redirect } from "next/navigation";
import type {
  BillingLedger,
  BillingLedgerListData,
  TenantBillingSummary,
  TenantFeatureEstimates,
} from "@/components/billing/billing-types";
import { StatusAlert } from "@/components/admin/status-alert";
import { Badge, type BadgeProps } from "@/components/ui/badge";
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
    return { data: payload.data || fallback, error: null };
  } catch (error) {
    return {
      data: fallback,
      error: error instanceof Error ? error.message : "计费数据加载失败",
    };
  }
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
  const account = summaryResult.data.account;
  const status = account.status
    ? accountStatusMeta[account.status] || { label: account.status, variant: "outline" as const }
    : { label: "未初始化", variant: "outline" as const };
  const accountStats = [
    { label: "可用积分", value: formatCredits(account.available_credits), helper: "当前可扣费余额" },
    { label: "冻结积分", value: formatCredits(account.frozen_credits), helper: "待结算或锁定额度" },
    { label: "累计充值", value: formatCredits(account.total_recharged_credits), helper: "历史入账总额" },
    { label: "累计消耗", value: formatCredits(account.total_consumed_credits), helper: "历史扣费总额" },
  ];

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
        <div className="text-sm text-muted-foreground">
          最近活动 {formatDateTime(account.last_activity_at || account.updated_at)}
        </div>
      </div>

      {summaryResult.error ? <StatusAlert>{summaryResult.error}</StatusAlert> : null}
      {estimateResult.error ? <StatusAlert>{estimateResult.error}</StatusAlert> : null}
      {ledgerResult.error ? <StatusAlert>{ledgerResult.error}</StatusAlert> : null}

      <section className="shrink-0 overflow-hidden border-y bg-background/40">
        <div className="grid divide-y md:grid-cols-4 md:divide-x md:divide-y-0">
          {accountStats.map((item) => (
            <AccountStat key={item.label} {...item} />
          ))}
        </div>
        <div className="border-t">
          <div className="flex flex-col gap-1 px-4 py-3 md:flex-row md:items-baseline md:justify-between">
            <div>
              <h2 className="text-sm font-semibold tracking-normal">功能计费</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                当前生效规则的简化展示，实际扣费以生成账单时的价格快照为准。
              </p>
            </div>
          </div>
          <div className="grid border-t md:grid-cols-3 md:divide-x">
            <PriceLine label="短信" value={`${formatCredits(estimateResult.data.sms.unit_credits)} 积分 / 条`} min={estimateResult.data.sms.min_charge_credits} />
            <PriceLine label="视频转文本" value={`${formatCredits(estimateResult.data.social_video.unit_credits)} 积分 / 分钟`} min={estimateResult.data.social_video.min_charge_credits} />
            <PriceLine label="AI token" value={`输入 ${formatCredits(estimateResult.data.ai.input_token_1k_credits)} / 输出 ${formatCredits(estimateResult.data.ai.output_token_1k_credits)} 积分`} min={estimateResult.data.ai.min_charge_credits} />
          </div>
        </div>
      </section>

      <section className="flex min-h-0 flex-1 flex-col overflow-hidden border-y bg-background/40">
        <div className="flex shrink-0 flex-col gap-1 border-b px-4 py-3 md:flex-row md:items-baseline md:justify-between">
          <div>
            <h2 className="text-sm font-semibold tracking-normal">积分流水</h2>
            <p className="mt-1 text-xs text-muted-foreground">租户最近的充值、扣费、冻结和解冻记录。</p>
          </div>
          <Badge variant="outline" className="w-fit">
            最近 {ledgerResult.data.list.length} 条 / 共 {ledgerResult.data.pagination.total} 条
          </Badge>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">
          <Table className="table-fixed" containerClassName="h-full overflow-auto">
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
              {!ledgerResult.data.list.length ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center text-sm text-muted-foreground">
                    暂无积分流水
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  );
}

function AccountStat({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <div className="px-4 py-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold tracking-normal tabular-nums">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{helper}</div>
    </div>
  );
}

function PriceLine({
  label,
  value,
  min,
}: {
  label: string;
  value: string;
  min: number;
}) {
  return (
    <div className="border-t px-4 py-3 first:border-t-0 md:border-t-0">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-semibold tracking-normal">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">最低 {formatCredits(min)} 积分</div>
    </div>
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
