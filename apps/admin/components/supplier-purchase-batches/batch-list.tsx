import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { BATCH_STATUS_LABELS, destinationName } from "./batch-rules";
import { batchDate, batchMoney } from "./batch-page-parts";
import type { BatchDetail } from "./batch-types";

export function BatchList(
  { rows, onOpen }: { rows: BatchDetail[]; onOpen: (id: string) => void },
) {
  return (
    <Table
      containerClassName="min-h-0 flex-1 overflow-auto"
      className="min-w-[900px]"
    >
      <TableHeader className="sticky top-0 z-10 bg-card">
        <TableRow>
          <TableHead>批次编号</TableHead>
          <TableHead>采购去向</TableHead>
          <TableHead>状态</TableHead>
          <TableHead>商品 / 供应商</TableHead>
          <TableHead className="text-right">冻结金额</TableHead>
          <TableHead>申请人</TableHead>
          <TableHead>最近更新</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((batch) => (
          <TableRow key={batch.id}>
            <TableCell>
              <Button
                type="button"
                variant="link"
                className="h-auto p-0"
                onClick={() => onOpen(batch.id)}
              >
                {batch.batch_no}
              </Button>
            </TableCell>
            <TableCell>
              <div>{destinationName(batch)}</div>
              <div className="text-xs text-muted-foreground">
                {batch.destination_type === "warehouse"
                  ? "仓库补货"
                  : "项目采购"}
              </div>
            </TableCell>
            <TableCell>{BATCH_STATUS_LABELS[batch.status]}</TableCell>
            <TableCell>
              {batch.item_count} 个 / {batch.supplier_count} 家
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {batchMoney(batch.total_amount)}
            </TableCell>
            <TableCell>
              {batch.applicant?.name ?? batch.creator?.name ?? "人员信息不可用"}
            </TableCell>
            <TableCell>{batchDate(batch.updated_at)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
