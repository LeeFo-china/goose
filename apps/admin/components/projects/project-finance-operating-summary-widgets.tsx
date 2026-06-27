"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { FinanceProjectRiskLevel } from "@/components/finance/finance-requests";
import {
  formatFinanceMoney,
  formatFinancePercent,
} from "@/components/finance/finance-ledger-utils";
import {
  financeRiskLabel,
  financeRiskVariant,
} from "@/components/finance/finance-risk-display";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type MoneyFlowItem = {
  label: string;
  value: number;
  kind: "base" | "income" | "cost" | "profit" | "forecast";
};

export type StatusItem = {
  key: string;
  title: string;
  value: string;
  description: string;
  level: FinanceProjectRiskLevel;
  href?: string;
  actionLabel?: string;
};

export function SectionHeading({
  icon,
  title,
  helper,
}: {
  icon: ReactNode;
  title: string;
  helper: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2">
        <span className="text-muted-foreground">{icon}</span>
        <div className="min-w-0">
          <h4 className="text-sm font-semibold">{title}</h4>
          <p className="truncate text-xs text-muted-foreground">{helper}</p>
        </div>
      </div>
    </div>
  );
}

export function ProgressTile({
  title,
  progress,
  loading,
  primaryLabel,
  primaryValue,
  secondaryLabel,
  secondaryValue,
  emptyText,
  overLimit,
}: {
  title: string;
  progress: number | null;
  loading: boolean;
  primaryLabel: string;
  primaryValue: string;
  secondaryLabel: string;
  secondaryValue: string;
  emptyText: string;
  overLimit: boolean;
}) {
  const progressText = loading
    ? "加载中"
    : progress === null
      ? "-"
      : formatFinancePercent(progress);
  const helperText = loading
    ? "正在同步"
    : progress === null
      ? emptyText
      : overLimit
        ? "已超出预算"
        : "执行正常";

  return (
    <div className="px-1 py-2">
      <div className="flex items-center gap-3">
        <ProgressRing progress={progress} overLimit={overLimit} />
        <div className="min-w-0">
          <div className="text-sm font-medium">{title}</div>
          <div
            className={cn(
              "mt-1 text-2xl font-semibold tabular-nums",
              overLimit ? "text-destructive" : "text-foreground",
            )}
          >
            {progressText}
          </div>
          <p className="text-xs text-muted-foreground">{helperText}</p>
        </div>
      </div>
      <SegmentedProgress progress={progress} overLimit={overLimit} />
      <div className="mt-3 grid grid-cols-2 gap-2 border-t pt-3 text-xs">
        <ProgressValue
          label={primaryLabel}
          value={primaryValue}
          loading={loading}
        />
        <ProgressValue
          label={secondaryLabel}
          value={secondaryValue}
          loading={loading}
        />
      </div>
    </div>
  );
}

function ProgressValue({
  label,
  value,
  loading,
}: {
  label: string;
  value: string;
  loading: boolean;
}) {
  return (
    <div>
      <div className="text-muted-foreground">{label}</div>
      <div className="mt-1 truncate font-semibold tabular-nums">
        {loading ? "加载中..." : value}
      </div>
    </div>
  );
}

function ProgressRing({
  progress,
  overLimit,
}: {
  progress: number | null;
  overLimit: boolean;
}) {
  const radius = 34;
  const circumference = 2 * Math.PI * radius;
  const normalized = clampProgress(progress);
  const stroke = overLimit ? "hsl(var(--destructive))" : "hsl(var(--accent))";

  return (
    <svg
      aria-hidden="true"
      className="size-[74px] shrink-0 -rotate-90"
      viewBox="0 0 80 80"
    >
      <circle
        cx="40"
        cy="40"
        r={radius}
        fill="none"
        stroke="hsl(var(--muted))"
        strokeWidth="8"
      />
      <circle
        cx="40"
        cy="40"
        r={radius}
        fill="none"
        stroke={stroke}
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - normalized)}
        strokeLinecap="round"
        strokeWidth="8"
      />
    </svg>
  );
}

function SegmentedProgress({
  progress,
  overLimit,
}: {
  progress: number | null;
  overLimit: boolean;
}) {
  return (
    <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
      <div
        className={cn("h-full", overLimit ? "bg-destructive" : "bg-accent")}
        style={{ width: `${clampProgress(progress) * 100}%` }}
      />
    </div>
  );
}

export function MoneyFlowChart({
  data,
  loading,
}: {
  data: MoneyFlowItem[];
  loading: boolean;
}) {
  return (
    <div className="mt-3 h-[178px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ left: 4, right: 8, top: 10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="label"
            interval={0}
            tick={{ fontSize: 11 }}
            tickFormatter={moneyFlowAxisLabel}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            width={54}
            tickFormatter={moneyTick}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip content={<ChartTooltip loading={loading} />} />
          <Bar
            dataKey="value"
            name="金额"
            isAnimationActive={false}
            radius={[4, 4, 0, 0]}
          >
            {data.map((item) => (
              <Cell key={item.label} fill={moneyFlowColor(item)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function ChartTooltip({
  active,
  payload,
  label,
  loading,
}: {
  active?: boolean;
  payload?: Array<{ value?: number; name?: string }>;
  label?: string;
  loading: boolean;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-md border bg-background px-3 py-2 text-xs shadow-sm">
      <div className="mb-1 font-medium">{label}</div>
      {payload.map((item) => (
        <div key={item.name} className="text-muted-foreground">
          {item.name}：{loading ? "加载中..." : formatFinanceMoney(item.value)}
        </div>
      ))}
    </div>
  );
}

export function CompactMetric({
  label,
  value,
  loading,
  danger = false,
}: {
  label: string;
  value: string;
  loading: boolean;
  danger?: boolean;
}) {
  return (
    <div className="border-t pt-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={cn(
          "mt-1 truncate text-sm font-semibold tabular-nums",
          danger ? "text-destructive" : "text-foreground",
        )}
      >
        {loading ? "加载中..." : value}
      </div>
    </div>
  );
}

export function StatusListItem({
  item,
  loading,
}: {
  item: StatusItem;
  loading: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-t py-2 first:border-t-0">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <Badge variant={financeRiskVariant(item.level)}>
            {financeRiskLabel(item.level)}
          </Badge>
          <span className="truncate text-sm font-medium">{item.title}</span>
        </div>
        <div className="mt-1 truncate text-sm font-semibold tabular-nums">
          {loading ? "加载中..." : item.value}
        </div>
        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
          {item.description}
        </p>
      </div>
      {item.href ? (
        <Button asChild type="button" variant="outline" size="sm">
          <Link href={item.href}>{item.actionLabel || "处理"}</Link>
        </Button>
      ) : null}
    </div>
  );
}

function moneyFlowColor(item: MoneyFlowItem) {
  if (item.value < 0) return "hsl(var(--destructive))";
  if (item.kind === "income") return "hsl(var(--accent))";
  if (item.kind === "cost") return "hsl(var(--warning))";
  if (item.kind === "profit") return "hsl(var(--success))";
  if (item.kind === "forecast") return "hsl(var(--primary))";
  return "hsl(var(--muted-foreground))";
}

function moneyTick(value: number) {
  if (Math.abs(value) >= 10000) {
    return `${(value / 10000).toLocaleString("zh-CN", {
      maximumFractionDigits: 0,
    })}万`;
  }
  return value.toLocaleString("zh-CN");
}

function moneyFlowAxisLabel(value: string) {
  const labels: Record<string, string> = {
    合同金额: "合同",
    已收金额: "已收",
    已付支出: "已付",
    实际利润: "实利",
    预测利润: "预利",
  };
  return labels[value] || value;
}

function clampProgress(value: number | null) {
  if (value === null || !Number.isFinite(value)) return 0;
  return Math.min(Math.max(value, 0), 1);
}
