"use client";

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

import type {
  Warehouse,
  WarehouseStatus,
  WarehouseUpdateRequest,
} from "./warehouse-types";

const STATUS_LABELS: Record<WarehouseStatus, string> = {
  active: "启用",
  inactive: "停用",
};

export function WarehouseTable({
  records,
  canManage,
  onEdit,
  onMutate,
}: {
  records: Warehouse[];
  canManage: boolean;
  onEdit: (warehouse: Warehouse) => void;
  onMutate: (warehouse: Warehouse, patch: WarehouseUpdateRequest) => void;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>仓库名称</TableHead>
          <TableHead>地址</TableHead>
          <TableHead>负责人</TableHead>
          <TableHead>默认仓库</TableHead>
          <TableHead>状态</TableHead>
          <TableHead>更新时间</TableHead>
          <TableHead className="text-right">操作</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {records.map((warehouse) => (
          <TableRow key={warehouse.id}>
            <TableCell className="font-medium">{warehouse.name}</TableCell>
            <TableCell className="max-w-xs text-muted-foreground">
              {warehouse.address || "-"}
            </TableCell>
            <TableCell>
              {warehouse.contact_name || warehouse.contact_phone || "-"}
            </TableCell>
            <TableCell>
              {warehouse.is_default ? (
                <Badge variant="success">默认</Badge>
              ) : (
                <span className="text-muted-foreground">-</span>
              )}
            </TableCell>
            <TableCell>
              <Badge variant={warehouse.status === "active" ? "secondary" : "outline"}>
                {STATUS_LABELS[warehouse.status]}
              </Badge>
            </TableCell>
            <TableCell className="text-muted-foreground">
              {formatDateTime(warehouse.updated_at)}
            </TableCell>
            <TableCell>
              <div className="flex justify-end gap-2">
                {canManage ? (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onEdit(warehouse)}
                    >
                      编辑
                    </Button>
                    {!warehouse.is_default && warehouse.status === "active" ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          onMutate(warehouse, {
                            expected_version: warehouse.version,
                            is_default: true,
                          })}
                      >
                        设为默认
                      </Button>
                    ) : null}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        onMutate(warehouse, {
                          expected_version: warehouse.version,
                          status: warehouse.status === "active"
                            ? "inactive"
                            : "active",
                        })}
                    >
                      {warehouse.status === "active" ? "停用" : "启用"}
                    </Button>
                  </>
                ) : (
                  <span className="text-sm text-muted-foreground">只读</span>
                )}
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
