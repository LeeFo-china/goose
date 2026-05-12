import { redirect } from "next/navigation";
import { Coins, ReceiptText, WalletCards, Zap } from "lucide-react";
import type {
  BillingLedgerListData,
  TenantBillingSummary,
  TenantFeatureEstimates,
} from "@/components/billing/billing-types";
import { StatusAlert } from "@/components/admin/status-alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-normal">计费账户</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          查看当前租户积分余额、近期扣费和主要功能的计费口径。
        </p>
      </div>

      {summaryResult.error ? <StatusAlert>{summaryResult.error}</StatusAlert> : null}
      {estimateResult.error ? <StatusAlert>{estimateResult.error}</StatusAlert> : null}
      {ledgerResult.error ? <StatusAlert>{ledgerResult.error}</StatusAlert> : null}

      <div className="grid gap-3 md:grid-cols-4">
        <SummaryItem icon={WalletCards} label="可用积分" value={formatCredits(summaryResult.data.account.available_credits)} />
        <SummaryItem icon={Coins} label="冻结积分" value={formatCredits(summaryResult.data.account.frozen_credits)} />
        <SummaryItem icon={ReceiptText} label="累计充值" value={formatCredits(summaryResult.data.account.total_recharged_credits)} />
        <SummaryItem icon={Zap} label="累计消耗" value={formatCredits(summaryResult.data.account.total_consumed_credits)} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>功能计费</CardTitle>
          <CardDescription>当前生效规则的简化展示，实际扣费以生成账单时的价格快照为准。</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <PriceLine label="短信" value={`${formatCredits(estimateResult.data.sms.unit_credits)} 积分 / 条`} min={estimateResult.data.sms.min_charge_credits} />
          <PriceLine label="视频转文本" value={`${formatCredits(estimateResult.data.social_video.unit_credits)} 积分 / 分钟`} min={estimateResult.data.social_video.min_charge_credits} />
          <PriceLine label="AI token" value={`输入 ${formatCredits(estimateResult.data.ai.input_token_1k_credits)} / 输出 ${formatCredits(estimateResult.data.ai.output_token_1k_credits)} 积分`} min={estimateResult.data.ai.min_charge_credits} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>积分流水</CardTitle>
          <CardDescription>租户最近的充值、扣费、冻结和解冻记录。</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>时间</TableHead>
                <TableHead>类型</TableHead>
                <TableHead>来源</TableHead>
                <TableHead className="text-right">积分</TableHead>
                <TableHead className="text-right">余额</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ledgerResult.data.list.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>{formatDateTime(item.created_at)}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{directionLabel(item.direction)}</Badge>
                    <div className="mt-1 text-xs text-muted-foreground">{item.event_type}</div>
                  </TableCell>
                  <TableCell>{[item.source_type, item.source_id].filter(Boolean).join(" / ") || item.order_no || "-"}</TableCell>
                  <TableCell className="text-right">{formatCredits(item.change_credits)}</TableCell>
                  <TableCell className="text-right">{formatCredits(item.balance_after)}</TableCell>
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
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryItem({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof WalletCards;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-md border bg-background px-4 py-3">
      <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
        <span>{label}</span>
        <Icon className="size-4" />
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-normal">{value}</div>
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
    <div className="rounded-md border px-4 py-3">
      <div className="text-sm font-medium">{label}</div>
      <div className="mt-2 text-lg font-semibold tracking-normal">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">最低 {formatCredits(min)} 积分</div>
    </div>
  );
}
