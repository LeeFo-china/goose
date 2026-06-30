import Link from "next/link";
import { ExternalLink } from "lucide-react";
import type {
  FinanceDifferenceSourceRecord,
} from "@/components/finance/finance-difference-sources-requests";
import {
  financeDifferenceSourceTypeMeta,
  safeFinanceDifferenceSourceHref,
} from "@/components/finance/finance-difference-sources-utils";
import {
  financeDirectionMeta,
  formatFinanceDateTime,
  formatFinanceMoney,
} from "@/components/finance/finance-ledger-utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function FinanceDifferenceSourcesTable({
  rows,
}: {
  rows: FinanceDifferenceSourceRecord[];
}) {
  return (
    <Table className="min-w-[1080px] border-t">
      <TableHeader className="bg-muted/60">
        <TableRow className="hover:bg-transparent">
          <TableHead>来源</TableHead>
          <TableHead>项目</TableHead>
          <TableHead>说明</TableHead>
          <TableHead>发生时间</TableHead>
          <TableHead className="text-right">金额</TableHead>
          <TableHead className="text-right">操作</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length ? rows.map((row) => (
          <TableRow key={row.id}>
            <TableCell>
              <SourceBadge sourceType={row.source_type} />
              <div className="mt-1 truncate text-xs text-muted-foreground">
                {row.source_id}
              </div>
            </TableCell>
            <TableCell>
              <div className="max-w-[18rem] truncate font-medium">
                {row.project_name || "未关联项目"}
              </div>
              <div className="mt-1 truncate text-xs text-muted-foreground">
                {row.project_id || "-"}
              </div>
            </TableCell>
            <TableCell>
              <div className="max-w-[22rem] truncate">{row.description}</div>
            </TableCell>
            <TableCell className="whitespace-nowrap tabular-nums">
              {formatFinanceDateTime(row.occurred_at)}
            </TableCell>
            <TableCell className="whitespace-nowrap text-right">
              <div className="font-medium tabular-nums">
                {row.amount === null ? "-" : formatFinanceMoney(row.amount)}
              </div>
              {row.direction ? (
                <div className="mt-1">
                  <DirectionBadge direction={row.direction} />
                </div>
              ) : null}
            </TableCell>
            <TableCell className="text-right">
              <Button asChild variant="ghost" size="sm">
                <Link href={safeFinanceDifferenceSourceHref(row.target?.href)}>
                  {row.target?.label || "查看"}
                  <ExternalLink data-icon="inline-end" />
                </Link>
              </Button>
            </TableCell>
          </TableRow>
        )) : (
          <TableRow>
            <TableCell
              colSpan={6}
              className="h-32 text-center text-sm text-muted-foreground"
            >
              当前筛选条件下暂无差异来源
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}

function SourceBadge({ sourceType }: { sourceType: string }) {
  const meta = financeDifferenceSourceTypeMeta(sourceType);
  return <Badge variant={meta.variant}>{meta.label}</Badge>;
}

function DirectionBadge({ direction }: { direction: string }) {
  const meta = financeDirectionMeta(direction);
  return <Badge variant={meta.variant}>{meta.label}</Badge>;
}
