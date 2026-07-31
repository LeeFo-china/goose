import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import type { SupplierPayable } from "./payable-types";

export function PayableSummary({ records }: { records: SupplierPayable[] }) {
  const items = [
    {
      label: "待付金额",
      value: sumMoney(records.map(({ open_amount }) => open_amount)),
      hint: "应付扣除已付款",
      variant: "warning" as const,
    },
    {
      label: "已申请未付",
      value: sumMoney(records.map(({ reserved_amount }) => reserved_amount)),
      hint: "审批及付款处理中",
      variant: "secondary" as const,
    },
    {
      label: "已付金额",
      value: sumMoney(records.map(({ paid_amount }) => paid_amount)),
      hint: "已完成付款分配",
      variant: "success" as const,
    },
    {
      label: "可申请金额",
      value: sumMoney(
        records.map(({ available_to_request_amount }) =>
          available_to_request_amount
        ),
      ),
      hint: "当前可纳入新申请",
      variant: "outline" as const,
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <Card key={item.label} className="shadow-none">
          <CardHeader className="flex-row items-start justify-between gap-3 pb-2">
            <div className="flex flex-col gap-1">
              <CardTitle>{item.label}</CardTitle>
              <CardDescription>{item.hint}</CardDescription>
            </div>
            <Badge variant={item.variant}>已加载</Badge>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tabular-nums">{item.value}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function sumMoney(values: string[]) {
  const total = values.reduce(
    (sum, value) => sum + moneyToMinor(value),
    BigInt(0),
  );
  const digits = total.toString().padStart(3, "0");
  const integer = digits.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `¥${integer}.${digits.slice(-2)}`;
}

function moneyToMinor(value: string) {
  return /^(?:0|[1-9]\d{0,15})\.\d{2}$/.test(value)
    ? BigInt(value.replace(".", ""))
    : BigInt(0);
}
