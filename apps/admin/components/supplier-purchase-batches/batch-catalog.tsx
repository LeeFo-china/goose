"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
      keyword,
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
  }, [destination_type, project_id, warehouse_id, page, keyword, retry]);
  const rows = loading || error ? [] : result?.list ?? [];
  return (
    <Card className="shadow-none">
      <CardHeader>
        <CardTitle className="text-base">可采购商品</CardTitle>
        <div className="flex gap-2">
          <InputGroup>
            <InputGroupAddon>
              <Search className="size-4" />
            </InputGroupAddon>
            <InputGroupInput
              aria-label="搜索采购商品"
              placeholder="商品名称 / SKU"
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
        <p className="text-sm text-muted-foreground">
          目录价格仅供选品参考，最终金额以保存后的服务端冻结结果为准。
        </p>
      </CardHeader>
      <CardContent className="p-0">
        <BatchReadState
          loading={loading}
          error={error}
          empty={!rows.length}
          onRetry={() => setRetry((value) => value + 1)}
          onClear={() => {
            setSearch("");
            setKeyword("");
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
                  <TableHead className="text-right">单价</TableHead>
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
                  return (
                    <TableRow key={item.supplier_sku_id}>
                      <TableCell>
                        <div>{item.product_name} · {item.sku_name}</div>
                        <div className="text-xs text-muted-foreground">
                          {item.sku_code}
                        </div>
                      </TableCell>
                      <TableCell>{item.supplier_name}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {batchMoney(item.unit_price)} /{" "}
                        {item.purchase_unit_name}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={disabled || selected ||
                            lines.length >= 100 || tooManySuppliers}
                          onClick={() =>
                            onAdd(item)}
                        >
                          {selected ? "已选择" : "选择"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )
          : null}
      </CardContent>
      <CardFooter className="border-t pt-4">
        <BatchPager
          pagination={result?.pagination}
          loading={loading || disabled}
          onPage={setPage}
        />
      </CardFooter>
    </Card>
  );
}
