"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type {
  FinanceProjectOperatingSummaryTotals,
  FinanceProjectSummaryAnalytics,
} from "@/components/finance/finance-requests";
import { formatFinanceMoney } from "@/components/finance/finance-ledger-utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type ChartItem = {
  label: string;
  value: number;
};

function toNumber(value: number | string | null | undefined) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? amount : 0;
}

function moneyTick(value: number) {
  if (Math.abs(value) >= 10000) {
    return `${(value / 10000).toLocaleString("zh-CN", {
      maximumFractionDigits: 0,
    })}万`;
  }
  return value.toLocaleString("zh-CN");
}

function ChartTooltip({
  active,
  payload,
  label,
  unit = "",
}: {
  active?: boolean;
  payload?: Array<{ value?: number; name?: string }>;
  label?: string;
  unit?: string;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-md border bg-background px-3 py-2 text-xs shadow-sm">
      <div className="mb-1 font-medium">{label}</div>
      {payload.map((item) => (
        <div key={item.name} className="text-muted-foreground">
          {item.name}：
          {unit === "money"
            ? formatFinanceMoney(item.value)
            : `${Number(item.value || 0).toLocaleString("zh-CN")} 个`}
        </div>
      ))}
    </div>
  );
}

function FinanceBarChart({
  data,
  fill,
  unit,
}: {
  data: ChartItem[];
  fill: string;
  unit: "money" | "count";
}) {
  return (
    <div className="h-[125px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="label"
            interval={0}
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            allowDecimals={false}
            width={46}
            tickFormatter={unit === "money" ? moneyTick : undefined}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip content={<ChartTooltip unit={unit} />} />
          <Bar
            dataKey="value"
            name={unit === "money" ? "金额" : "项目数"}
            fill={fill}
            isAnimationActive={false}
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function EmptyChart() {
  return (
    <div className="flex h-[125px] items-center justify-center text-xs text-muted-foreground">
      暂无图表数据
    </div>
  );
}

function FinanceTrendChart({
  data,
}: {
  data: FinanceProjectSummaryAnalytics["trends"];
}) {
  if (data.length === 0) return <EmptyChart />;

  return (
    <div className="h-[125px]">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="date" tickFormatter={(value: string) => value.slice(5)} tickLine={false} axisLine={false} />
          <YAxis width={46} tickFormatter={moneyTick} tickLine={false} axisLine={false} />
          <Tooltip content={<ChartTooltip unit="money" />} />
          <Line
            type="monotone"
            dataKey="net_cash_flow_amount"
            name="净现金流"
            stroke="hsl(var(--primary))"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function hasPositiveData(data: ChartItem[]) {
  return data.some((item) => item.value > 0);
}

export function FinanceOverviewCharts({
  summary,
  analytics,
}: {
  summary: FinanceProjectOperatingSummaryTotals;
  analytics: FinanceProjectSummaryAnalytics;
}) {
  const riskCounts = summary.risk_counts || {
    normal: 0,
    info: 0,
    warning: 0,
    danger: 0,
  };
  const collectionData: ChartItem[] = [
    { label: "已收", value: toNumber(summary.received_amount) },
    { label: "待收", value: toNumber(summary.receivable_remaining_amount) },
    { label: "逾期", value: toNumber(summary.overdue_amount) },
  ];
  const profitData: ChartItem[] = [
    { label: "已收", value: toNumber(summary.received_amount) },
    { label: "已付费用", value: toNumber(summary.expense_paid_amount) },
    { label: "实际利润", value: toNumber(summary.actual_profit_amount) },
    { label: "预算利润", value: toNumber(summary.projected_budget_profit_amount) },
  ];
  const riskData: ChartItem[] = [
    { label: "正常", value: Number(riskCounts.normal || 0) },
    { label: "待处理", value: Number(riskCounts.info || 0) },
    { label: "预警", value: Number(riskCounts.warning || 0) },
    { label: "高风险", value: Number(riskCounts.danger || 0) },
  ];

  return (
    <div className="grid shrink-0 gap-2 md:grid-cols-2 xl:grid-cols-4">
      <Card className="shadow-none">
        <CardHeader className="p-2.5 pb-1">
          <CardTitle className="text-sm">回款结构</CardTitle>
        </CardHeader>
        <CardContent className="p-2.5 pt-0">
          {hasPositiveData(collectionData) ? (
            <FinanceBarChart
              data={collectionData}
              fill="hsl(var(--primary))"
              unit="money"
            />
          ) : <EmptyChart />}
        </CardContent>
      </Card>
      <Card className="shadow-none">
        <CardHeader className="p-2.5 pb-1">
          <CardTitle className="text-sm">利润拆解</CardTitle>
        </CardHeader>
        <CardContent className="p-2.5 pt-0">
          {hasPositiveData(profitData) ? (
            <FinanceBarChart
              data={profitData}
              fill="hsl(var(--secondary-foreground))"
              unit="money"
            />
          ) : <EmptyChart />}
        </CardContent>
      </Card>
      <Card className="shadow-none">
        <CardHeader className="p-2.5 pb-1">
          <CardTitle className="text-sm">风险分布</CardTitle>
        </CardHeader>
        <CardContent className="p-2.5 pt-0">
          {hasPositiveData(riskData) ? (
            <FinanceBarChart
              data={riskData}
              fill="hsl(var(--warning))"
              unit="count"
            />
          ) : <EmptyChart />}
        </CardContent>
      </Card>
      <Card className="shadow-none">
        <CardHeader className="p-2.5 pb-1">
          <CardTitle className="text-sm">30天现金流</CardTitle>
        </CardHeader>
        <CardContent className="p-2.5 pt-0">
          <FinanceTrendChart data={analytics.trends} />
        </CardContent>
      </Card>
    </div>
  );
}
