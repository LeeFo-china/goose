"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { loadBatchWarehouses } from "./batch-api";
import { BatchOptionPicker } from "./batch-option-picker";
import { findInitialWarehouse } from "./batch-warehouse-default";
import { batchError } from "./batch-rules";
import type { NamedOption } from "./batch-types";

const loadActiveWarehouses = (
  page: number,
  keyword: string,
  signal?: AbortSignal,
) => loadBatchWarehouses(page, keyword, true, signal);
export function BatchWarehousePicker(
  { value, onChange, disabled }: {
    value: NamedOption | null;
    onChange: (value: NamedOption) => void;
    disabled: boolean;
  },
) {
  const chosen = useRef(Boolean(value));
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (chosen.current) return;
    const controller = new AbortController();
    setError("");
    void findInitialWarehouse(
      (page) => loadBatchWarehouses(page, "", true, controller.signal),
      () => !controller.signal.aborted && !chosen.current,
    ).then((warehouse) => {
      if (warehouse && !chosen.current && !controller.signal.aborted) {
        chosen.current = true;
        onChangeRef.current(warehouse);
      }
    }).catch((caught: unknown) => {
      if (!controller.signal.aborted) {
        setError(batchError(caught, "默认仓库加载失败，请手动选择"));
      }
    });
    return () => controller.abort();
  }, [retry]);
  return (
    <div className="space-y-2">
      <BatchOptionPicker
        id="batch-warehouse"
        label="启用仓库"
        value={value}
        load={loadActiveWarehouses}
        disabled={disabled}
        onChange={(next) => {
          chosen.current = true;
          onChange(next);
        }}
      />
      {error
        ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
            <Button
              type="button"
              size="sm"
              variant="link"
              onClick={() => setRetry((value) => value + 1)}
            >
              重试默认选择
            </Button>
          </p>
        )
        : null}
      <p className="text-sm text-muted-foreground">
        仅一个启用仓库时自动选择；有多个仓库时优先租户默认仓库。没有启用仓库时不可保存。
      </p>
    </div>
  );
}
