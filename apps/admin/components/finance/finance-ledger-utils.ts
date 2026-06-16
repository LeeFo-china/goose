type BadgeVariant = "success" | "secondary";

export function formatFinanceMoney(value: number | string | null | undefined) {
  const amount = Number(value || 0);
  return `¥${amount.toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function financeDirectionMeta(direction: "in" | "out" | string | null | undefined): {
  label: string;
  variant: BadgeVariant;
} {
  if (direction === "in") {
    return { label: "收入", variant: "success" };
  }
  return { label: "支出", variant: "secondary" };
}

export function formatFinanceDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
