import Link from "next/link";
import type { ReactNode } from "react";
import {
  formatFinanceMoney,
  formatFinancePercent,
} from "@/components/finance/finance-ledger-utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type FinanceTone = "normal" | "warning" | "danger";

export function FinanceMetricCard({
  icon,
  label,
  value,
  helper,
  alert,
  tone = "normal",
}: {
  icon: ReactNode;
  label: string;
  value: string;
  helper?: string;
  alert?: string;
  tone?: FinanceTone;
}) {
  return (
    <Card className={financeToneCardClass(tone)}>
      <CardContent className="flex h-full flex-col gap-1 p-2.5">
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs font-medium text-muted-foreground">{label}</span>
          <span className={tone === "normal" ? "text-muted-foreground" : financeToneTextClass(tone)}>
            {icon}
          </span>
        </div>
        <div className={`truncate text-xl font-semibold tabular-nums ${financeToneTextClass(tone)}`}>
          {value}
        </div>
        {helper ? (
          <div className="truncate text-xs text-muted-foreground">{helper}</div>
        ) : null}
        {alert ? (
          <div className="truncate rounded-md bg-amber-100 px-2 py-0.5 text-[11px] font-medium leading-4 text-amber-800">
            {alert}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function FinanceTodoCard({
  title,
  value,
  helper,
  actionLabel,
  href,
  tone = "normal",
}: {
  title: string;
  value: string;
  helper: string;
  actionLabel: string;
  href: string;
  tone?: FinanceTone;
}) {
  return (
    <Card className={financeToneCardClass(tone)}>
      <CardContent className="flex h-full items-center justify-between gap-2 p-2">
        <div className="min-w-0">
          <div className="text-xs font-medium text-muted-foreground">{title}</div>
          <div className={`mt-0.5 truncate text-base font-semibold tabular-nums ${financeToneTextClass(tone)}`}>
            {value}
          </div>
          <div className="mt-0.5 truncate text-xs leading-4 text-muted-foreground">
            {helper}
          </div>
        </div>
        <Button
          asChild
          variant={tone === "normal" ? "outline" : "secondary"}
          size="sm"
          className="h-7 shrink-0 px-2"
        >
          <Link href={href}>{actionLabel}</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

export function formatCollectionRate(
  receivedAmount: number | string | null | undefined,
  contractAmount: number | string | null | undefined,
) {
  const contract = Number(contractAmount || 0);
  if (!Number.isFinite(contract) || contract <= 0) return "-";
  return formatFinancePercent(Number(receivedAmount || 0) / contract);
}

export function formatCompactMoney(value: number | string | null | undefined) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) return "0 万";
  if (Math.abs(amount) >= 10000) {
    return `${(amount / 10000).toLocaleString("zh-CN", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 1,
    })} 万`;
  }
  return formatFinanceMoney(amount);
}

function financeToneCardClass(tone: FinanceTone) {
  if (tone === "danger") return "border-red-200 bg-red-50/90 shadow-none";
  if (tone === "warning") return "border-amber-200 bg-amber-50/80 shadow-none";
  return "bg-card shadow-sm";
}

function financeToneTextClass(tone: FinanceTone) {
  if (tone === "danger") return "text-red-700";
  if (tone === "warning") return "text-amber-700";
  return "text-foreground";
}
