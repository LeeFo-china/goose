import { RefreshCw, TriangleAlert } from "lucide-react";

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export function SupplierSkuDialogConflictNotice({
  refreshFailed,
  refreshing = false,
  onRetry,
}: {
  refreshFailed: boolean;
  refreshing?: boolean;
  onRetry?: () => void;
}) {
  return (
    <Alert className="border-amber-300 bg-amber-50 text-amber-950">
      <TriangleAlert />
      <AlertTitle>数据已更新</AlertTitle>
      <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
        <p>
          {refreshFailed
            ? "最新版本加载失败，你填写的内容已保留。"
            : "已刷新最新版本，请确认后重试。你填写的内容已保留。"}
        </p>
        {refreshFailed && onRetry ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={refreshing}
            onClick={onRetry}
          >
            <RefreshCw data-icon="inline-start" />
            刷新最新版本
          </Button>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}
