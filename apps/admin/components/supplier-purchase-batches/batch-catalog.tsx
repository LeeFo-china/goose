"use client";

import { useEffect, useId, useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { loadBatchCatalog } from "./batch-api";
import {
  BatchCatalogFilters,
  type BatchCatalogFilterState,
} from "./batch-catalog-filters";
import { batchError } from "./batch-rules";
import { batchMoney, BatchPager, BatchReadState } from "./batch-page-parts";
import type {
  BatchCatalogItem,
  BatchDestination,
  BatchLine,
  PageData,
} from "./batch-types";

export function BatchCatalog(
  { destination, lines, disabled, onAdd }: {
    destination: BatchDestination;
    lines: BatchLine[];
    disabled: boolean;
    onAdd: (item: BatchCatalogItem) => void;
  },
) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [keyword, setKeyword] = useState("");
  const [filters, setFilters] = useState<BatchCatalogFilterState>({
    category: null,
    supplier: null,
  });
  const [result, setResult] = useState<PageData<BatchCatalogItem> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const { destination_type, project_id, warehouse_id } = destination;
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    loadBatchCatalog(
      { destination_type, project_id, warehouse_id },
      page,
      {
        keyword,
        categoryId: filters.category?.id,
        tenantSupplierId: filters.supplier?.id,
      },
      controller.signal,
    ).then((next) => {
      if (controller.signal.aborted) return;
      if (page > Math.max(1, next.pagination.totalPages)) {
        setPage(Math.max(1, next.pagination.totalPages));
        return;
      }
      setResult(next);
    }).catch((caught: unknown) => {
      if (!controller.signal.aborted) setError(batchError(caught));
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [
    destination_type,
    project_id,
    warehouse_id,
    page,
    keyword,
    filters.category?.id,
    filters.supplier?.id,
    retry,
  ]);
  const rows = loading || error ? [] : result?.list ?? [];
  return (
    <div className="flex min-h-0 flex-col">
      <div className="sticky top-0 z-10 space-y-3 border-b bg-background px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <InputGroup className="min-w-64 flex-1">
            <InputGroupAddon>
              <Search className="size-4" />
            </InputGroupAddon>
            <InputGroupInput
              aria-label="搜索采购商品"
              placeholder="搜索商品编码、名称或 SKU 编码、名称"
              value={search}
              maxLength={80}
              disabled={disabled}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  setKeyword(search);
                  setPage(1);
                }
              }}
            />
          </InputGroup>
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            onClick={() => {
              setKeyword(search);
              setPage(1);
            }}
          >
            搜索
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={disabled || loading}
            onClick={() => setRetry((value) => value + 1)}
          >
            刷新价格
          </Button>
        </div>
        <BatchCatalogFilters
          value={filters}
          disabled={disabled}
          onChange={(next) => {
            setFilters(next);
            setPage(1);
          }}
        />
        <p className="text-sm text-muted-foreground">
          目录价格仅供选品参考，最终金额以保存后的服务端冻结结果为准。
        </p>
      </div>
      <div className="min-h-0 overflow-auto">
        <BatchReadState
          loading={loading}
          error={error}
          empty={!rows.length}
          onRetry={() => setRetry((value) => value + 1)}
          onClear={() => {
            setSearch("");
            setKeyword("");
            setFilters({ category: null, supplier: null });
            setPage(1);
          }}
        />
        {rows.length
          ? (
            <Table className="min-w-[640px]">
              <TableHeader>
                <TableRow>
                  <TableHead>商品 / SKU</TableHead>
                  <TableHead>供应商</TableHead>
                  <TableHead>单位</TableHead>
                  <TableHead className="text-right">参考价</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((item) => {
                  const selected = lines.some((line) =>
                    line.supplier_sku_id === item.supplier_sku_id
                  );
                  const tooManySuppliers = !lines.some((line) =>
                    line.supplier_id === item.supplier_id
                  ) && new Set(lines.map((line) =>
                        line.supplier_id
                      )).size >= 20;
                  const disabledReason = selected
                    ? "该商品已加入"
                    : lines.length >= 100
                    ? "每个批次最多选择 100 个 SKU"
                    : tooManySuppliers
                    ? "每个批次最多选择 20 家供应商"
                    : null;
                  return (
                    <TableRow key={item.supplier_sku_id}>
                      <TableCell>
                        <div>{item.product_name} · {item.sku_name}</div>
                        <div className="text-xs text-muted-foreground">
                          {item.sku_code}
                        </div>
                      </TableCell>
                      <TableCell>{item.supplier_name}</TableCell>
                      <TableCell>{item.purchase_unit_name}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {batchMoney(item.unit_price)}
                      </TableCell>
                      <TableCell className="text-right">
                        <BatchCatalogAddAction
                          productName={item.product_name}
                          selected={selected}
                          disabled={disabled || Boolean(disabledReason)}
                          disabledReason={disabledReason}
                          onAdd={() => onAdd(item)}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )
          : null}
      </div>
      <div className="border-t px-4 py-3">
        <BatchPager
          pagination={result?.pagination}
          loading={loading || disabled}
          onPage={setPage}
        />
      </div>
    </div>
  );
}

export function BatchCatalogAddAction({
  productName,
  selected,
  disabled,
  disabledReason,
  onAdd,
}: {
  productName: string;
  selected: boolean;
  disabled: boolean;
  disabledReason: string | null;
  onAdd: () => void;
}) {
  const reasonId = useId();
  const visibleReason = !selected ? disabledReason : null;
  return (
    <div className="inline-flex max-w-48 flex-col items-end gap-1">
      <Button
        type="button"
        size="sm"
        variant={selected ? "secondary" : "outline"}
        disabled={disabled}
        aria-describedby={visibleReason ? reasonId : undefined}
        aria-label={disabledReason
          ? `${productName}：${disabledReason}`
          : `加入${productName}`}
        onClick={onAdd}
      >
        {selected ? "已选" : "加入"}
      </Button>
      {visibleReason
        ? (
          <span
            id={reasonId}
            className="text-right text-xs leading-tight text-muted-foreground"
          >
            {visibleReason}
          </span>
        )
        : null}
    </div>
  );
}
