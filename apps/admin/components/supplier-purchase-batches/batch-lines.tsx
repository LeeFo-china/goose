"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { loadBatchCategories } from "./batch-api";
import { BatchOptionPicker } from "./batch-option-picker";
import type { BatchLine } from "./batch-types";

export function BatchLines(
  { lines, disabled, onChange }: {
    lines: BatchLine[];
    disabled: boolean;
    onChange: (lines: BatchLine[]) => void;
  },
) {
  const [categorySku, setCategorySku] = useState<string | null>(null);
  const current = lines.find((line) => line.supplier_sku_id === categorySku);
  return (
    <Card className="shadow-none">
      <CardHeader>
        <CardTitle className="text-base">
          已选商品（{lines.length} / 100）
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          最多 20 家供应商。成本类目用于采购归类；仓库补货不占用项目预算。
        </p>
      </CardHeader>
      <CardContent className="p-0">
        {lines.length
          ? (
            <Table className="min-w-[640px]">
              <TableHeader>
                <TableRow>
                  <TableHead>商品 / 供应商</TableHead>
                  <TableHead>采购数量</TableHead>
                  <TableHead>成本类目</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((line) => (
                  <TableRow key={line.supplier_sku_id}>
                    <TableCell>
                      <div>{line.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {line.supplier_name || "供应商已冻结"}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Input
                        className="w-28"
                        aria-label={`${line.name}采购数量`}
                        inputMode="decimal"
                        value={line.quantity}
                        disabled={disabled}
                        onChange={(event) =>
                          onChange(lines.map((item) =>
                            item === line
                              ? { ...item, quantity: event.target.value }
                              : item
                          ))}
                      />
                    </TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={disabled}
                        onClick={() => setCategorySku(line.supplier_sku_id)}
                      >
                        {line.cost_category_id
                          ? line.category_name || "已选类目 · 更改"
                          : "请选择成本类目"}
                      </Button>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={disabled}
                        onClick={() =>
                          onChange(lines.filter((item) => item !== line))}
                      >
                        移除
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )
          : (
            <p className="p-5 text-sm text-muted-foreground">
              从采购目录中选择商品后，填写数量和成本类目。
            </p>
          )}
      </CardContent>
      <Dialog
        open={Boolean(current)}
        onOpenChange={(open) => {
          if (!open) setCategorySku(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>选择成本类目</DialogTitle>
            <DialogDescription>
              为当前商品选择有效的采购成本类目。
            </DialogDescription>
          </DialogHeader>
          {current
            ? (
              <BatchOptionPicker
                id="batch-cost-category"
                label="成本类目"
                value={current.cost_category_id
                  ? {
                    id: current.cost_category_id,
                    name: current.category_name || "已选类目",
                  }
                  : null}
                load={loadBatchCategories}
                onChange={(category) => {
                  onChange(lines.map((line) =>
                    line === current
                      ? {
                        ...line,
                        cost_category_id: category.id,
                        category_name: category.name,
                      }
                      : line
                  ));
                  setCategorySku(null);
                }}
              />
            )
            : null}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
