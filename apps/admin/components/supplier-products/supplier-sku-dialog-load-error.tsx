"use client";

import { RefreshCw } from "lucide-react";

import { StatusAlert } from "@/components/admin/status-alert";
import { Button } from "@/components/ui/button";

export function SupplierSkuDialogLoadError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex flex-col items-start gap-3">
      <StatusAlert title="SKU 表单资料加载失败">{message}</StatusAlert>
      <Button type="button" variant="outline" onClick={onRetry}>
        <RefreshCw data-icon="inline-start" />
        重新加载
      </Button>
    </div>
  );
}
