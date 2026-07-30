"use client";

import { ClipboardList, MoreHorizontal } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { actionsFor } from "./requisition-rules";
import {
  formatRequisitionDateTime,
  formatRequisitionMoney,
  requisitionBudgetStatusMeta,
  requisitionStatusMeta,
  shortBusinessId,
} from "./requisition-page-utils";
import type {
  RequisitionAction,
  RequisitionRecord,
} from "./requisition-types";

const actionLabels: Record<RequisitionAction, string> = {
  edit: "编辑草稿",
  submit: "提交审批",
  approve: "批准申请",
  reject: "驳回申请",
  convert: "生成采购单",
  cancel: "取消申请",
};

export function RequisitionList({
  records,
  loading,
  projectNames,
  supplierNames,
  currentEmployeeId,
  canManage,
  canApprove,
  canManageBudget,
  onOpen,
  onAction,
}: {
  records: RequisitionRecord[];
  loading: boolean;
  projectNames: Record<string, string>;
  supplierNames: Record<string, string>;
  currentEmployeeId: string | null;
  canManage: boolean;
  canApprove: boolean;
  canManageBudget: boolean;
  onOpen: (record: RequisitionRecord) => void;
  onAction: (record: RequisitionRecord, action: RequisitionAction) => void;
}) {
  if (loading) {
    return (
      <div className="flex flex-col gap-2 p-4">
        {Array.from({ length: 7 }, (_, index) => (
          <Skeleton key={index} className="h-12 w-full" />
        ))}
      </div>
    );
  }
  if (records.length === 0) {
    return (
      <Empty className="min-h-72">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ClipboardList />
          </EmptyMedia>
          <EmptyTitle>暂无采购申请</EmptyTitle>
          <EmptyDescription>
            调整筛选条件，或发起一张项目临时采购申请。
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <Table containerClassName="min-w-[1120px] overflow-x-auto">
      <TableHeader className="sticky top-0 bg-card">
        <TableRow>
          <TableHead>申请号</TableHead>
          <TableHead>项目</TableHead>
          <TableHead>供应商</TableHead>
          <TableHead>状态</TableHead>
          <TableHead>预算状态</TableHead>
          <TableHead className="text-right">申请金额</TableHead>
          <TableHead>申请人</TableHead>
          <TableHead>提交时间</TableHead>
          <TableHead>更新时间</TableHead>
          <TableHead className="text-right">操作</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {records.map((record) => {
          const actions = actionsFor({
            status: record.status,
            budgetStatus: record.budget_status,
            currentEmployeeId,
            requesterEmployeeId: record.created_by_employee_id,
            canManage,
            canApprove,
            canManageBudget,
          });
          return (
            <TableRow key={record.id}>
              <TableCell className="font-mono font-medium">
                {record.request_no}
              </TableCell>
              <TableCell className="max-w-48 truncate">
                {projectNames[record.project_id] ??
                  `项目 ${shortBusinessId(record.project_id)}`}
              </TableCell>
              <TableCell className="max-w-52 truncate">
                {supplierNames[record.tenant_supplier_id] ??
                  `供应商 ${shortBusinessId(record.tenant_supplier_id)}`}
              </TableCell>
              <TableCell>
                <Badge variant={requisitionStatusMeta[record.status].variant}>
                  {requisitionStatusMeta[record.status].label}
                </Badge>
              </TableCell>
              <TableCell>
                <Badge
                  variant={requisitionBudgetStatusMeta[record.budget_status]
                    .variant}
                >
                  {requisitionBudgetStatusMeta[record.budget_status].label}
                </Badge>
              </TableCell>
              <TableCell className="text-right font-mono tabular-nums">
                {formatRequisitionMoney(record.total_amount)}
              </TableCell>
              <TableCell className="font-mono text-xs">
                {shortBusinessId(record.created_by_employee_id)}
              </TableCell>
              <TableCell className="tabular-nums text-muted-foreground">
                {formatRequisitionDateTime(record.submitted_at)}
              </TableCell>
              <TableCell className="tabular-nums text-muted-foreground">
                {formatRequisitionDateTime(record.updated_at)}
              </TableCell>
              <TableCell>
                <div className="flex justify-end gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => onOpen(record)}
                  >
                    查看
                  </Button>
                  {actions.length > 0 ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          aria-label={`更多操作 ${record.request_no}`}
                        >
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuGroup>
                          {actions.map((action) => (
                            <DropdownMenuItem
                              key={action}
                              onSelect={() => onAction(record, action)}
                            >
                              {actionLabels[action]}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuGroup>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : null}
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
