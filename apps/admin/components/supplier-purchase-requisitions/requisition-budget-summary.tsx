import { AlertTriangle, Info } from "lucide-react";

import type {
  FinanceCostCategoryRecord,
} from "@/components/finance/finance-cost-budget-requests";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import {
  formatRequisitionMoney,
  isNegativeRequisitionMoney,
  requisitionBudgetFacts,
  shortBusinessId,
  subtractRequisitionMoney,
} from "./requisition-page-utils";
import type { RequisitionDetail } from "./requisition-types";

export function RequisitionBudgetSummary({
  detail,
  categories,
}: {
  detail: RequisitionDetail;
  categories: FinanceCostCategoryRecord[];
}) {
  const snapshots = detail.budget_snapshots;
  if (snapshots.length === 0) {
    return (
      <section className="rounded-md border p-4">
        <h3 className="text-base font-semibold">预算影响</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          提交后生成预算快照，草稿阶段暂不显示预算占用事实。
        </p>
      </section>
    );
  }
  const facts = requisitionBudgetFacts(
    detail.requisition.total_amount,
    snapshots,
  );
  const isOverBudget =
    detail.requisition.budget_status === "over_budget";
  const isCommitmentReleased = snapshots.every(
    ({ status }) => status === "released",
  );
  const categoryNames = Object.fromEntries(
    categories.map((category) => [category.id, category.name]),
  );

  return (
    <section className="rounded-md border">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b p-4">
        <div>
          <h3 className="text-base font-semibold">预算影响</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            以下金额来自提交时的项目预算与承诺快照。
          </p>
        </div>
        {isCommitmentReleased ? (
          <Badge variant="success">预算承诺已释放</Badge>
        ) : isOverBudget ? (
          <Badge variant="danger">
            <AlertTriangle />
            超出预算 {formatRequisitionMoney(facts.shortfallAmount)}
          </Badge>
        ) : (
          <Badge variant="success">预算内</Badge>
        )}
      </div>
      <div className="grid gap-3 border-b p-4 sm:grid-cols-2 xl:grid-cols-5">
        <Fact label="申请金额" amount={facts.requisitionAmount} />
        <Fact label="已支出" amount={facts.expenseAmount} />
        <Fact
          label="其他采购占用"
          amount={facts.otherCommitmentAmount}
          description="不含本单，来自同项目同成本分类下仍占用预算的采购申请或采购单。"
        />
        <Fact
          label="本申请承诺"
          amount={facts.currentCommitmentAmount}
        />
        <Fact
          label="批准后可用余额"
          amount={facts.availableAfterApproval}
          danger={isNegativeRequisitionMoney(facts.availableAfterApproval)}
        />
      </div>
      <Table containerClassName="max-w-full overflow-x-auto">
        <TableHeader>
          <TableRow>
            <TableHead>成本分类</TableHead>
            <TableHead className="text-right">本申请</TableHead>
            <TableHead className="text-right">已支出</TableHead>
            <TableHead className="text-right">
              <LabelWithHelp
                align="end"
                label="其他采购占用"
                description="不含本单，来自同项目同成本分类下仍占用预算的采购申请或采购单。"
              />
            </TableHead>
            <TableHead className="text-right">批准后可用</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {snapshots.map((snapshot) => {
            const availableAfterApproval = subtractRequisitionMoney(
              snapshot.available_amount_snapshot,
              snapshot.amount,
            );
            return (
              <TableRow key={snapshot.id}>
                <TableCell>
                  {categoryNames[snapshot.cost_category_id] ??
                    `分类 ${shortBusinessId(snapshot.cost_category_id)}`}
                </TableCell>
                <MoneyCell value={snapshot.amount} />
                <MoneyCell value={snapshot.expense_amount_snapshot} />
                <MoneyCell
                  value={snapshot.other_commitment_amount_snapshot}
                />
                <MoneyCell
                  value={availableAfterApproval}
                  danger={isNegativeRequisitionMoney(
                    availableAfterApproval,
                  )}
                />
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </section>
  );
}

function Fact({
  label,
  amount,
  description,
  danger = false,
}: {
  label: string;
  amount: string;
  description?: string;
  danger?: boolean;
}) {
  return (
    <div>
      <LabelWithHelp label={label} description={description} />
      <div
        className={cn(
          "mt-1 font-mono text-sm font-medium tabular-nums",
          danger && "text-destructive",
        )}
      >
        {formatRequisitionMoney(amount)}
      </div>
    </div>
  );
}

function LabelWithHelp({
  label,
  description,
  align = "start",
}: {
  label: string;
  description?: string;
  align?: "start" | "end";
}) {
  if (!description) {
    return <div className="text-xs text-muted-foreground">{label}</div>;
  }

  return (
    <div
      className={cn(
        "flex items-center gap-1 text-xs text-muted-foreground",
        align === "end" && "justify-end",
      )}
    >
      <span>{label}</span>
      <Tooltip>
        <TooltipTrigger
          type="button"
          className="inline-flex size-3.5 items-center justify-center rounded-full text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`${label}说明`}
        >
          <Info className="size-3.5" />
        </TooltipTrigger>
        <TooltipContent align={align} className="max-w-[300px] leading-5">
          {description}
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

function MoneyCell({
  value,
  danger = false,
}: {
  value: string;
  danger?: boolean;
}) {
  return (
    <TableCell
      className={cn(
        "text-right font-mono tabular-nums",
        danger && "text-destructive",
      )}
    >
      {formatRequisitionMoney(value)}
    </TableCell>
  );
}
