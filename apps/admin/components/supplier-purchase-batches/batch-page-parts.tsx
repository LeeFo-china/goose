import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusAlert } from "@/components/admin/status-alert";
import type { Pagination } from "@/components/suppliers/supplier-types";

export function BatchPager(
  { pagination, loading, onPage }: {
    pagination?: Pagination | null;
    loading: boolean;
    onPage: (page: number) => void;
  },
) {
  return (
    <div className="flex w-full flex-wrap items-center justify-between gap-2 text-sm">
      <span className="text-muted-foreground">
        {pagination
          ? `共 ${pagination.total} 条 · 第 ${pagination.page} / ${
            Math.max(1, pagination.totalPages)
          } 页`
          : "每页 20 条"}
      </span>
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={loading || !pagination || pagination.page <= 1}
          onClick={() => pagination && onPage(pagination.page - 1)}
        >
          上一页
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={loading || !pagination ||
            pagination.page >= pagination.totalPages}
          onClick={() => pagination && onPage(pagination.page + 1)}
        >
          下一页
        </Button>
      </div>
    </div>
  );
}
export function BatchReadState(
  { loading, error, empty, onRetry, onClear }: {
    loading: boolean;
    error: string;
    empty: boolean;
    onRetry: () => void;
    onClear?: () => void;
  },
) {
  if (loading) {
    return (
      <div role="status" aria-label="正在加载" className="space-y-3 p-5">
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="h-5 w-full" />
        <Skeleton className="h-5 w-1/2" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="p-4">
        <StatusAlert>
          {error}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="ml-2"
            onClick={onRetry}
          >
            重试
          </Button>
        </StatusAlert>
      </div>
    );
  }
  if (empty) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>暂无匹配记录</EmptyTitle>
          <EmptyDescription>试试调整筛选条件，或稍后刷新。</EmptyDescription>
        </EmptyHeader>
        {onClear
          ? (
            <Button type="button" variant="outline" onClick={onClear}>
              清除筛选
            </Button>
          )
          : null}
      </Empty>
    );
  }
  return null;
}
export function batchMoney(value: string) {
  const [whole, cents = "00"] = value.split(".");
  return `¥${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${
    cents.padEnd(2, "0")
  }`;
}
export function batchDate(value: string | null) {
  return value
    ? new Date(value).toLocaleString("zh-CN", { hour12: false })
    : "未提交";
}
