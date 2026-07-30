import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

import {
  formatRequisitionDateTime,
  formatRequisitionMoney,
  requisitionBudgetStatusMeta,
  requisitionStatusMeta,
  shortBusinessId,
} from "./requisition-page-utils";
import type {
  RequisitionItem,
  RequisitionRecord,
} from "./requisition-types";

export function RequisitionFacts({
  requisition,
  projectName,
  supplierName,
}: {
  requisition: RequisitionRecord;
  projectName?: string;
  supplierName?: string;
}) {
  return (
    <section className="rounded-md border p-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Fact label="申请号" value={requisition.request_no} mono />
        <Fact
          label="项目"
          value={projectName ??
            `项目 ${shortBusinessId(requisition.project_id)}`}
        />
        <Fact
          label="供应商"
          value={supplierName ??
            `供应商 ${shortBusinessId(requisition.tenant_supplier_id)}`}
        />
        <Fact
          label="状态"
          value={
            <Badge variant={requisitionStatusMeta[requisition.status].variant}>
              {requisitionStatusMeta[requisition.status].label}
            </Badge>
          }
        />
        <Fact
          label="预算状态"
          value={
            <Badge
              variant={requisitionBudgetStatusMeta[requisition.budget_status]
                .variant}
            >
              {requisitionBudgetStatusMeta[requisition.budget_status].label}
            </Badge>
          }
        />
        <Fact
          label="申请金额"
          value={formatRequisitionMoney(requisition.total_amount)}
          mono
        />
        <Fact
          label="计价时间"
          value={formatRequisitionDateTime(requisition.priced_at)}
        />
        <Fact label="版本" value={String(requisition.version)} mono />
        <Fact label="申请人" value={shortBusinessId(
          requisition.created_by_employee_id,
        )} mono />
        <Fact
          label="提交时间"
          value={formatRequisitionDateTime(requisition.submitted_at)}
        />
        <Fact
          label="期望到货"
          value={requisition.expected_delivery_date ?? "-"}
        />
        <Fact
          label="更新时间"
          value={formatRequisitionDateTime(requisition.updated_at)}
        />
      </div>
      <div className="mt-4 grid gap-3 border-t pt-4 md:grid-cols-2">
        <Fact label="临时采购原因" value={requisition.reason} />
        <Fact label="备注" value={requisition.remark ?? "-"} />
        {requisition.review_remark ? (
          <Fact label="审核备注" value={requisition.review_remark} />
        ) : null}
        {requisition.cancel_reason ? (
          <Fact label="取消原因" value={requisition.cancel_reason} />
        ) : null}
      </div>
    </section>
  );
}

export function RequisitionItemsTable({
  items,
  categoryNames,
}: {
  items: RequisitionItem[];
  categoryNames: Record<string, string>;
}) {
  return (
    <section className="rounded-md border">
      <div className="border-b p-4">
        <h3 className="text-base font-semibold">采购明细</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          价格、税率与金额均为服务端保存的快照事实。
        </p>
      </div>
      <Table containerClassName="min-w-[760px] overflow-x-auto">
        <TableHeader>
          <TableRow>
            <TableHead>商品 / SKU</TableHead>
            <TableHead>成本分类</TableHead>
            <TableHead className="text-right">数量</TableHead>
            <TableHead>单位</TableHead>
            <TableHead className="text-right">单价</TableHead>
            <TableHead className="text-right">含税金额</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.id}>
              <TableCell>
                <div className="font-medium">
                  {item.product_name_snapshot}
                </div>
                <div className="text-xs text-muted-foreground">
                  {item.sku_name_snapshot} · {item.sku_code_snapshot}
                </div>
              </TableCell>
              <TableCell>
                {categoryNames[item.cost_category_id] ??
                  `分类 ${shortBusinessId(item.cost_category_id)}`}
              </TableCell>
              <TableCell className="text-right font-mono tabular-nums">
                {item.quantity}
              </TableCell>
              <TableCell>{item.purchase_unit_symbol_snapshot}</TableCell>
              <TableCell className="text-right font-mono tabular-nums">
                {formatRequisitionMoney(item.unit_price)}
              </TableCell>
              <TableCell className="text-right font-mono tabular-nums">
                {formatRequisitionMoney(item.line_total_amount)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  );
}

function Fact({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={cn(
          "mt-1 break-words text-sm",
          mono && "font-mono tabular-nums",
        )}
      >
        {value}
      </div>
    </div>
  );
}
