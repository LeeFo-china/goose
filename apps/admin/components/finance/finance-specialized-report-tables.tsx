import type {
  FinanceCostCategorySummaryResult,
  FinanceProjectRankingResult,
  FinanceReceivableAgingResult,
} from "@/components/finance/finance-specialized-report-requests";
import {
  formatFinanceDate,
  formatFinanceMoney,
  formatFinancePercent,
} from "@/components/finance/finance-ledger-utils";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function ProjectRankingTable({
  data,
}: {
  data: FinanceProjectRankingResult;
}) {
  return (
    <Table className="min-w-[1040px] border-t">
      <TableHeader className="bg-muted/60">
        <TableRow className="hover:bg-transparent">
          <TableHead>项目</TableHead>
          <TableHead className="text-right">收入</TableHead>
          <TableHead className="text-right">支出</TableHead>
          <TableHead className="text-right">毛利</TableHead>
          <TableHead className="text-right">毛利率</TableHead>
          <TableHead className="text-right">未收</TableHead>
          <TableHead className="text-right">逾期</TableHead>
          <TableHead className="text-right">异常</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.list.length ? data.list.map((item) => (
          <TableRow key={item.project_id || "unassigned"}>
            <TableCell>
              <div className="max-w-[18rem] truncate font-medium">
                {item.project_name}
              </div>
              <div className="mt-1 truncate text-xs text-muted-foreground">
                {item.project_id || "未关联项目"}
              </div>
            </TableCell>
            <MoneyCell value={item.income_amount} />
            <MoneyCell value={item.expense_amount} />
            <MoneyCell
              value={item.gross_profit_amount}
              danger={item.gross_profit_amount < 0}
            />
            <TableCell className="text-right tabular-nums">
              {formatFinancePercent(item.gross_profit_rate)}
            </TableCell>
            <MoneyCell value={item.receivable_remaining_amount} />
            <MoneyCell
              value={item.overdue_receivable_amount}
              danger={item.overdue_receivable_amount > 0}
            />
            <TableCell className="text-right">
              <Badge variant={item.reconciliation_exception_count > 0 ? "warning" : "outline"}>
                {item.reconciliation_exception_count}
              </Badge>
            </TableCell>
          </TableRow>
        )) : (
          <EmptyRow colSpan={8} text="当前筛选条件下暂无项目经营数据" />
        )}
      </TableBody>
    </Table>
  );
}

export function CostCategorySummaryTable({
  data,
}: {
  data: FinanceCostCategorySummaryResult;
}) {
  return (
    <Table className="min-w-[760px] border-t">
      <TableHeader className="bg-muted/60">
        <TableRow className="hover:bg-transparent">
          <TableHead>成本分类</TableHead>
          <TableHead className="text-right">支出</TableHead>
          <TableHead className="text-right">占比</TableHead>
          <TableHead className="text-right">流水数</TableHead>
          <TableHead className="text-right">项目数</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.list.length ? data.list.map((item) => (
          <TableRow key={item.cost_category_id || "unallocated"}>
            <TableCell>
              <div className="font-medium">{item.cost_category_name}</div>
              {!item.cost_category_id ? (
                <div className="mt-1 text-xs text-muted-foreground">
                  需要财务补充分摊或归集
                </div>
              ) : null}
            </TableCell>
            <MoneyCell value={item.expense_amount} />
            <TableCell className="text-right tabular-nums">
              {formatFinancePercent(item.expense_percent)}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {item.ledger_entry_count}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {item.project_count}
            </TableCell>
          </TableRow>
        )) : (
          <EmptyRow colSpan={5} text="当前筛选条件下暂无成本分类数据" />
        )}
      </TableBody>
    </Table>
  );
}

export function ReceivableAgingTable({
  data,
}: {
  data: FinanceReceivableAgingResult;
}) {
  return (
    <div className="grid gap-4">
      <div className="grid gap-2 md:grid-cols-5">
        {data.buckets.map((bucket) => (
          <div key={bucket.key} className="rounded-md border bg-card p-3">
            <div className="text-xs text-muted-foreground">{bucket.label}</div>
            <div className="mt-1 text-sm font-semibold tabular-nums">
              {formatFinanceMoney(bucket.amount)}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {bucket.count} 条应收
            </div>
          </div>
        ))}
      </div>
      <Table className="min-w-[860px] border-t">
        <TableHeader className="bg-muted/60">
          <TableRow className="hover:bg-transparent">
            <TableHead>项目</TableHead>
            <TableHead>到期日</TableHead>
            <TableHead className="text-right">应收</TableHead>
            <TableHead className="text-right">已收</TableHead>
            <TableHead className="text-right">未收</TableHead>
            <TableHead className="text-right">逾期天数</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.list.length ? data.list.map((item) => (
            <TableRow key={item.receivable_id}>
              <TableCell>
                <div className="max-w-[18rem] truncate font-medium">
                  {item.project_name}
                </div>
                <div className="mt-1 truncate text-xs text-muted-foreground">
                  {item.receivable_id}
                </div>
              </TableCell>
              <TableCell>{item.due_date ? formatFinanceDate(item.due_date) : "-"}</TableCell>
              <MoneyCell value={item.amount} />
              <MoneyCell value={item.paid_amount} />
              <MoneyCell value={item.remaining_amount} danger={item.remaining_amount > 0} />
              <TableCell className="text-right tabular-nums">
                {item.overdue_days}
              </TableCell>
            </TableRow>
          )) : (
            <EmptyRow colSpan={6} text="当前筛选条件下暂无应收账龄数据" />
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function MoneyCell({ value, danger = false }: { value: number; danger?: boolean }) {
  return (
    <TableCell className={`whitespace-nowrap text-right font-medium tabular-nums ${danger ? "text-red-700" : ""}`}>
      {formatFinanceMoney(value)}
    </TableCell>
  );
}

function EmptyRow({ colSpan, text }: { colSpan: number; text: string }) {
  return (
    <TableRow>
      <TableCell colSpan={colSpan} className="h-32 text-center text-sm text-muted-foreground">
        {text}
      </TableCell>
    </TableRow>
  );
}
